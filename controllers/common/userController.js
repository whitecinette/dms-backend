const bcrypt = require("bcryptjs");
const User = require("../../model/User");
const jwt = require("jsonwebtoken");
const fs = require("fs");  // ✅ Import fs module
const stream = require("stream");
const csvParser = require("csv-parser");
const {
  sendNotificationToAdmins,
} = require("../../helpers/notificationHelper");
const { getAdditionalFields } = require("../../helpers/userHelpers");
const Firm = require("../../model/Firm");
const HierarchyEntries = require("../../model/HierarchyEntries");
const ActorTypesHierarchy = require("../../model/ActorTypesHierarchy");

exports.loginUser = async (req, res) => {
  try {
    const { code, password, role } = req.body; // Login with code, password, and role

    // Validate that the role is provided in the request body
    if (!role) {
      return res.status(400).json({ message: "Role is required" });
    }

    // Check if the role is valid (employee, dealer, mdd)
    const validRoles = ["employee", "dealer", "mdd", "hr"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    // Check if the user exists based on code and role
    const user = await User.findOne({ code, role }); // Searching for user by their code and role

    if (!user) {
      return res
        .status(400)
        .json({ message: "Invalid code or unauthorized access" });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password); // Compare with the user's stored password
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Check if the user is active and verified
    if (user.status === "active" && user.isVerified === true) {
      // Generate JWT token for active and verified users
      const token = jwt.sign(
        { id: user._id, role: user.role }, // Include user ID and role in the token
        process.env.JWT_SECRET,
        { expiresIn: "7d" } // Token valid for 7 days
      );

      return res.status(200).json({
        message: `${
          user.role.charAt(0).toUpperCase() + user.role.slice(1)
        } logged in successfully`,
        user: {
          id: user._id,
          name: user.name,
          contact: user.contact,
          email: user.email,
          status: user.status,
          role: user.role,
          isVerified: user.isVerified,
          version: user.version,
        },
        token, // Include the generated JWT token in the response
      });
    }

    // If the user is not active or verified, return an appropriate message
    res.status(400).json({ message: "User is not active or not verified" });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error });
    console.log("Error:", error);
  }
};

//////Edit profile for employee, dealer, mdd////
// exports.editProfileForUser = async (req, res) => {
//     try {
//         const user = req.user;
//         console.log("user to update:", user)
//         const update = req.body;
//         const data = await User.findByIdAndUpdate(user._id, update, { new: true })
//         if (!data) {
//             return res.status(404).json({ message: "Failed to update user profile" })
//         }
//         res.status(200).json({ message: "User profile updated successfully", user: data })
//     } catch (err) {
//         console.error("Error updating user profile:", err)
//         res.status(500).json({ message: "Internal Server Error" })
//     }
// }
//////Edit profile for employee, dealer, mdd////
// editProfileForUser controller

exports.editProfileForUser = async (req, res) => {
  try {
    const user = req.user;
    const update = req.body;


    // Update user profile
    const updatedUser = await User.findByIdAndUpdate(
      user.id,  // Changed from user._id to user.id since req.user contains decoded token data
      { $set: update },
      { new: true }
    ).select("-password"); // Added select to exclude password from response

    if (!updatedUser) {
      return res.status(404).json({ message: "Failed to update user profile" });
    }

    res.status(200).json({
      message: "User profile updated successfully",
      user: updatedUser,
    });
  } catch (err) {
    console.error("Error updating user profile:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
// Helper function to validate email format
function validateEmail(email) {
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email);
}

// edit all user according to thier role
exports.editUsers = async (req, res) => {
  try {
    const { updateData } = req.body;
    const { code } = req.user; // Extracted from token

    // Find user by code to get their role
    let user = await User.findOne({ code });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { role } = user; // Fetch the user's role from the database

    // Get allowed fields dynamically based on role
    const allowedUpdates = getAdditionalFields(role, updateData);

    if (Object.keys(allowedUpdates).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    // Convert nested objects to dot notation
    const flattenedUpdates = {};
    for (const key in allowedUpdates) {
      console.log("Key: ", key);
      if (
        typeof allowedUpdates[key] === "object" &&
        allowedUpdates[key] !== null
      ) {
        for (const subKey in allowedUpdates[key]) {
          console.log("subkey: ", subKey);
          flattenedUpdates[`${key}.${subKey}`] = allowedUpdates[key][subKey];
        }
      } else {
        flattenedUpdates[key] = allowedUpdates[key];
      }
    }

    // Update user in DB
    user = await User.findOneAndUpdate(
      { code },
      { $set: flattenedUpdates },
      { new: true }
    );

    res.status(200).json({ message: "Profile updated successfully", user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.getUsersDetails = async (req, res) => {
  try {
    const { code } = req.user; // Extract code from token

    // Find user by code
    const user = await User.findOne({ code }).select("-password"); // Exclude password for security

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res
      .status(200)
      .json({ message: "User details fetched successfully", user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.getUsersByPositions = async (req, res) => {
  try {
    const { positions } = req.body;

    if (!Array.isArray(positions) || positions.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "positions array is required" });
    }

    const users = await User.find(
      { position: { $in: positions } },
      { name: 1, code: 1, _id: 0 }
    );

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (err) {
    console.error("Error in getUsersByPositions:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.changeUserPassword = async (req, res) => {
 try {
   // Extract code from the token (set by userAuth middleware)
   const { code } = req.user
   const { oldPassword, newPassword } = req.body;

   // Validate required fields
   if (!code || !oldPassword || !newPassword) {
     return res.status(400).json({
       success: false,
       message: "Old password and new password are required",
     });
   }

   // Find the user by code
   const user = await User.findOne({ code });
   if (!user) {
     return res.status(404).json({
       success: false,
       message: "User not found",
     });
   }

   // Compare old password
   const isMatch = await bcrypt.compare(oldPassword, user.password);
   if (!isMatch) {
     return res.status(400).json({
       success: false,
       message: "Current password is incorrect",
     });
   }

   // Hash and update new password
   const hashedPassword = await bcrypt.hash(newPassword, 10);
   user.password = hashedPassword;
   await user.save();

   return res.status(200).json({
     success: true,
     message: "Password updated successfully",
   });
 } catch (error) {
   console.error("Error changing password:", error);
   return res.status(500).json({
     success: false,
     message: "Internal server error",
   });
 }
};



// get Profile
exports.getProfile = async (req, res) => {
  try {
    const { code } = req.user; // Extract employee code from authenticated user

    const user = await User.findOne({ code }).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Profile fetched successfully",
      user,
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.forgetPasswordForApp = async (req, res) => {
 console.log("🔁 Reaching to reset password API");

 try {
   // ✅ Extract from body (now includes code)
   const { code, oldPassword, newPassword } = req.body;
   console.log("Received body:", req.body);
   for (let key in req.body) {
     console.log(`${key} = "${req.body[key]}"`, req.body[key].length);
   }
   
   // ✅ Validate input
   if (!code || !oldPassword || !newPassword) {
     return res.status(400).json({ message: "Code, old password, and new password are required" });
   }

   // ✅ Fetch user
   const user = await User.findOne({ code });
   if (!user) {
     return res.status(404).json({ message: "User not found" });
   }

   // ✅ Debug log for password check
   console.log("Entered Old Password:", oldPassword);
   console.log("Stored Hashed Password:", user.password);

   // ✅ Compare old password
   const isMatch = await bcrypt.compare(oldPassword, user.password);
   console.log("Password Match Result:", isMatch);

   if (!isMatch) {
     return res.status(401).json({
       message: "Old password incorrect. Want to continue with OTP?",
       askOtp: true,
     });
   }

   // ✅ Hash and update new password
   const hashedNewPassword = await bcrypt.hash(newPassword, 10);
   user.password = hashedNewPassword;
   await user.save();

   return res.status(200).json({ message: "Password updated successfully" });
 } catch (error) {
   console.error("❌ Error resetting password:", error);
   return res.status(500).json({ message: "Something went wrong" });
 }
};


exports.getAllHierarchyUsersByFirm = async (req, res) => {
 try {
   const { firmName } = req.query;

   if (!firmName) {
     return res.status(400).json({ message: "firmName is required in query params." });
   }

   // 1. Get Firm by name
   const firm = await Firm.findOne({ name: new RegExp(`^${firmName}$`, 'i') });
   if (!firm) return res.status(404).json({ message: "Firm not found" });

   if (!firm.flowTypes || firm.flowTypes.length === 0) {
     return res.status(200).json({
       firm: firm.name,
       flows: [],
       message: "No flowTypes linked to this firm."
     });
   }

   const flowsResult = [];

   // 2. Loop through ActorTypeHierarchy IDs
   for (const flowTypeId of firm.flowTypes) {
     const actorFlow = await ActorTypesHierarchy.findById(flowTypeId); // ✅ Correct model now

     if (!actorFlow) {
       console.warn(`⚠️ ActorTypeHierarchy not found for ID: ${flowTypeId}`);
       continue;
     }

     const flowName = actorFlow.name;
     const levels = actorFlow.hierarchy || [];

     if (levels.length === 0) {
       console.warn(`⚠️ No levels defined in flow: ${flowName}`);
       continue;
     }

     // 3. Fetch all hierarchy entries assigned to this flow
     const hierarchyEntries = await HierarchyEntries.find({
       hierarchy_name: flowName
     });

     if (hierarchyEntries.length === 0) {
       console.warn(`⚠️ No hierarchy entries found for flow: ${flowName}`);
       continue;
     }

     const hierarchyMap = {};
     let employeeCount = 0;

     for (const level of levels) {
       const levelCodes = hierarchyEntries.map(e => e[level]).filter(Boolean);
       const uniqueCodes = [...new Set(levelCodes)];

       const users = await User.find({
         code: { $in: uniqueCodes },
         role: "employee"
       }).select("code name position");

       hierarchyMap[level] = users;
       employeeCount += users.length;
     }

     flowsResult.push({
       flowName: flowName,
       totalEmployees: employeeCount,
       hierarchy: hierarchyMap
     });
   }

   return res.status(200).json({
     firm: firm.name,
     flows: flowsResult,
     message: flowsResult.length ? "Data fetched successfully" : "No employee data found"
   });

 } catch (err) {
   console.error("❌ Error in getAllHierarchyUsersByFirm:", err);
   res.status(500).json({ message: "Server error", error: err.message });
 }
};

// Update dealer's town
// exports.updateDealerTownFromCSV = async (req, res) => {
//  try {
//    const filePath = req.file.path;
//    const updates = [];

//    fs.createReadStream(filePath)
//      .pipe(csv())
//      .on('data', (row) => {
//        const code = row['Code']?.trim();
//        const town = row['Town']?.trim();

//        if (!code) return;

//        updates.push({ code: code.toUpperCase(), town });
//      })
//      .on('end', async () => {
//        let updated = 0;
//        let skipped = 0;

//        for (const { code, town } of updates) {
//          const dealer = await User.findOne({ code });

//          if (!dealer) {
//            skipped++;
//            continue;
//          }

//          const incomingTown = (town || "").trim();
//          const existingTown = (dealer.town || "").trim();

//          if (!incomingTown || incomingTown.toUpperCase() === "N/A") {
//            skipped++;
//            continue;
//          }

//          if (incomingTown.toLowerCase() === existingTown.toLowerCase()) {
//            skipped++;
//            continue;
//          }

//          dealer.town = incomingTown;
//          await dealer.save();
//          updated++;
//        }

//        res.status(200).json({
//          success: true,
//          message: "Dealer towns updated from CSV.",
//          updated,
//          skipped,
//        });
//      });
//  } catch (error) {
//    console.error('Error updating dealer towns from CSV:', error);
//    res.status(500).json({ success: false, message: 'Internal server error.' });
//  }
// };

// update dealer town and if town field is not exist in document and in csv than add the field 
// exports.updateDealerTownFromCSV = async (req, res) => {
//  try {
//    const filePath = req.file.path;
//    const updates = [];

//    fs.createReadStream(filePath)
//      .pipe(csvParser())
//      .on('data', (row) => {
//        const code = row['Code']?.trim();
//        const town = row['Town']?.trim();

//        if (!code) return; // skip invalid rows
//        updates.push({ code: code.toUpperCase(), town });
//      })
//      .on('end', async () => {
//        let updated = 0;
//        let skipped = 0;
//        const updatedDealers = [];

//        for (const { code, town } of updates) {
//          const dealer = await User.findOne({ code });
//          if (!dealer) {
//            skipped++;
//            continue;
//          }

//          const incomingTown = (town || "").trim();
//          const hasTownField = dealer.town !== undefined;
//          const existingTown = (dealer.town || "").trim();
         
//          // ❌ Skip if blank or "N/A"
//          if (!incomingTown || incomingTown.toUpperCase() === "N/A") {
//            skipped++;
//            continue;
//          }
         
//          // ✅ Case: town field missing, but valid CSV town present
//          if (!hasTownField && incomingTown) {
//            dealer.town = incomingTown;
//            await dealer.save();
//            updated++;
//            updatedDealers.push({ code, town: incomingTown });
//            console.log(`✅ [NEW FIELD] ${code} => ${incomingTown}`);
//            continue;
//          }
         
//          // ❌ Skip if same (case-insensitive)
//          if (incomingTown.toLowerCase() === existingTown.toLowerCase()) {
//            skipped++;
//            continue;
//          }
         
//          // ✅ Update if different
//          await User.updateOne({ code }, { $set: { town: incomingTown } });
//          updated++;
//          updatedDealers.push({ code, town: incomingTown });
//          console.log(`✅ [UPDATED] ${code} => ${incomingTown}`);         
//        }

//        res.status(200).json({
//          success: true,
//          message: "Dealer towns updated from CSV.",
//          updated,
//          skipped,
//          updatedDealers,
//        });
//      });
//  } catch (error) {
//    console.error('Error updating dealer towns from CSV:', error);
//    res.status(500).json({ success: false, message: 'Internal server error.' });
//  }
// };

// skipped the duplicates code if any in csv suppose csv has a same code with diffrent town than its skip that and does'nt change the existing dealer town
exports.updateDealerTownFromCSV = async (req, res) => {
 try {
   const filePath = req.file.path;
   const rawUpdates = [];

   // ✅ Step 1: Read and parse the CSV rows
   fs.createReadStream(filePath)
     .pipe(csvParser())
     .on("data", (row) => {
       const code = row["Code"]?.trim();
       const town = row["Town"]?.trim();
       if (code) {
         rawUpdates.push({ code: code.toUpperCase(), town });
       }
     })
     .on("end", async () => {
       const codeTownMap = new Map();
       const conflictCodes = new Set();

       // ✅ Step 2: Detect conflicts where same code has different towns
       for (const { code, town } of rawUpdates) {
         if (!town || town.toUpperCase() === "N/A") continue;

         const prevTown = codeTownMap.get(code);
         if (!prevTown) {
           codeTownMap.set(code, town);
         } else if (prevTown.toLowerCase() !== town.toLowerCase()) {
           // ⚠️ Mark code as conflicted if multiple towns appear for same code
           conflictCodes.add(code);
         }
       }

       // ✅ Step 3: Apply updates for non-conflicting rows only
       let updated = 0;
       let skipped = 0;
       const updatedDealers = [];
       const conflictedDealers = [];
       const skippedDealers = [];

       for (const { code, town } of rawUpdates) {
         if (conflictCodes.has(code)) {
           // // ❌ Skip this code completely due to conflicting towns
           // conflictedDealers.push(code);
           skipped++;
           conflictedDealers.push({ code, town: incomingTown, reason: "Conflicting town entries" });
console.log(`⚠️ SKIPPED (Conflict): ${code} => ${incomingTown}`);

           continue;
         }

         const incomingTown = (town || "").trim();
         if (!incomingTown || incomingTown.toUpperCase() === "N/A") {
           // ❌ Skip blank or N/A towns
           skipped++;
           skippedDealers.push({ code, town: incomingTown, reason: "Blank or N/A town" });
           console.log(`⚠️ SKIPPED (Blank/N/A): ${code}`);
           continue;
         }

         const dealer = await User.findOne({ code });
         if (!dealer) {
           // ❌ Skip if dealer not found
           skipped++;
           skippedDealers.push({ code, town: incomingTown, reason: "Dealer not found" });
           console.log(`⚠️ SKIPPED (Dealer not found): ${code}`);
           continue;
         }

         const hasTownField = dealer.town !== undefined;
         const existingTown = (dealer.town || "").trim();

         // ✅ Case: Add new town if not present before
         if (!hasTownField && incomingTown) {
           dealer.town = incomingTown;
           await dealer.save();
           updated++;
           updatedDealers.push({ code, town: incomingTown });
           console.log(`✅ [NEW FIELD] ${code} => ${incomingTown}`);
           continue;
         }

         // ❌ Case: Same town already present — skip
         if (existingTown.toLowerCase() === incomingTown.toLowerCase()) {
          skipped++;
          skippedDealers.push({
            code,
            town: incomingTown,
            reason: "Same town already present",
          });
          continue;
        }
        

         // ✅ Case: Update town if different
         await User.updateOne({ code }, { $set: { town: incomingTown } });
         updated++;
         updatedDealers.push({ code, town: incomingTown });
         console.log(`✅ [UPDATED] ${code} => ${incomingTown}`);
       }

       // ✅ Final response with summary
       res.status(200).json({
         success: true,
         message: "Dealer towns updated from CSV.",
         updated,
         skipped: skippedDealers.length + conflictedDealers.length, // fixed count
         updatedDealers,
         skippedDealers,
         conflictedDealers,
       });
     });
 } catch (error) {
   console.error("Error updating dealer towns from CSV:", error);
   res.status(500).json({
     success: false,
     message: "Internal server error.",
   });
 }
};
