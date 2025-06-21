const bcrypt = require("bcryptjs");
const User = require("../../model/User");
const jwt = require("jsonwebtoken");
const {
  sendNotificationToAdmins,
} = require("../../helpers/notificationHelper");
const { getAdditionalFields } = require("../../helpers/userHelpers");

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

