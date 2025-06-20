const fs = require("fs");
const csvParser = require("csv-parser");
const ActorCode = require("../../model/ActorCode");
const User = require("../../model/User");
const {
  assignActorToUser,
  deleteUser,
  editUser,
} = require("../../helpers/actorToUserHelper");

///upload aotor codes in bulks

exports.uploadBulkActorCodes = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "CSV file is required." });
    }

    const results = [];
    const errors = [];
    const filePath = req.file.path;

    fs.createReadStream(filePath)
      .pipe(
        csvParser({
          mapHeaders: ({ header }) =>
            header.toLowerCase().trim().replace(/\s+/g, "_"), // Normalize headers
        })
      )
      .on("data", (row) => {
        // Normalize required fields
        let cleanedRow = {};

        Object.keys(row).forEach((key) => {
          let cleanedKey = key.toLowerCase().trim().replace(/\s+/g, "_"); // Clean column names
          // console.log("Cleaned key-", cleanedKey)
          let cleanedValue = row[key]?.trim(); // Trim whitespace from values

          // Apply transformation rules
          if (cleanedKey === "code") {
            cleanedValue = cleanedValue.toUpperCase(); // Ensure code is uppercase
          }
          if (cleanedKey === "name") {
            cleanedValue = cleanedValue
              .toLowerCase()
              .split(" ")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" "); // Capitalize Name
          }
          if (cleanedKey === "status") {
            cleanedValue = cleanedValue.toLowerCase(); // Normalize status
          }

          cleanedRow[cleanedKey] = cleanedValue;
        });

        // Check required fields
        if (
          !cleanedRow.code ||
          !cleanedRow.name ||
          !cleanedRow.position ||
          !cleanedRow.role
        ) {
          errors.push({ row, message: "Missing required fields" });
        } else {
          results.push(cleanedRow);
        }
      })
      .on("end", async () => {
        try {
          const insertedData = [];
          const updatedData = [];

          for (const data of results) {
            const existingActor = await ActorCode.findOne({ code: data.code });

            if (existingActor) {
              Object.assign(existingActor, data); // Update existing actor with new data
              await existingActor.save();
              updatedData.push(existingActor);
            } else {
              const newActor = new ActorCode(data);
              await newActor.save();
              insertedData.push(newActor);
            }

            // Assign actor to user if status is "active"
            if (data.status === "active") {
              await assignActorToUser(data.code);
            }
          }

          fs.unlinkSync(filePath); // Delete CSV file after processing

          res.status(200).json({
            message: "CSV processed successfully",
            insertedCount: insertedData.length,
            updatedCount: updatedData.length,
            data: errors,
          });
        } catch (err) {
          console.error("Error processing CSV:", err);
          res.status(500).json({ message: "Internal server error." });
        }
      });
  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

// exports.uploadBulkActorCodes = async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ message: "CSV file is required." });
//     }

//     // console.log("File received:", req.file); // Debug log
//     const results = [];
//     const errors = [];
//     const filePath = req.file.path;

//     fs.createReadStream(filePath)
//       .pipe(
//         csvParser({ mapHeaders: ({ header }) => header.toLowerCase().trim() })
//       ) // Normalize headers
//       .on("data", (row) => {
//         //console.log("Processing row:", row); // Debug log

//         if (
//           !row.code ||
//           !row.name ||
//           !row.position ||
//           !row.role ||
//           !row.status
//         ) {
//           errors.push({ row, message: "Missing required fields" });
//         } else {
//           results.push({
//             code: row.code.toUpperCase(),
//             name: row.name,
//             position: row.position,
//             role: row.role,
//             status: row.status.toLowerCase(), // Normalize status
//           });
//         }
//       })
//       .on("end", async () => {
//         try {
//           //console.log("CSV Processing Complete. Total Rows:", results.length);
//           const insertedData = [];
//           const updatedData = [];

//           for (const data of results) {
//             const existingActor = await ActorCode.findOne({ code: data.code });

//             if (existingActor) {
//               existingActor.name = data.name;
//               existingActor.position = data.position;
//               existingActor.role = data.role;
//               existingActor.status = data.status;
//               if (existingActor.status === "active") {
//                 await editUser(existingActor.code, existingActor.code, existingActor.name, existingActor.position, existingActor.role, existingActor.status);
//             }
//               await existingActor.save();
//               updatedData.push(existingActor);
//             } else {
//               const newActor = new ActorCode(data);
//               await newActor.save();
//               insertedData.push(newActor);
//             }

//             // Assign actor to user if status is "active"
//             if (data.status === "active") {
//               await assignActorToUser(data.code);
//             }
//           }

//           fs.unlinkSync(filePath);
//           //console.log("File deleted:", filePath);

//           res.status(200).json({
//             message: "CSV processed successfully",
//             insertedCount: insertedData.length,
//             updatedCount: updatedData.length,
//             data: errors,
//           });
//         } catch (err) {
//           console.error("Error processing CSV:", err);
//           res.status(500).json({ message: "Internal server error." });
//         }
//       });
//   } catch (error) {
//     console.error("Upload Error:", error);
//     res.status(500).json({ message: "Internal server error." });
//   }
// };

//add actor code
exports.addActorCode = async (req, res) => {
  try {
    let { code, name, status, ...update } = req.body; // Destructure required fields and gather extra fields
    code = code.toUpperCase(); // Ensure the code is stored in uppercase

    // Check if the actor code already exists
    const existingActor = await ActorCode.findOne({ code });
    if (existingActor) {
      return res.status(400).json({ message: "Actor code already exists." });
    }

    // Create a new actor code entry with required fields and any extra fields
    const actor = await ActorCode.create({
      code,
      name,
      status: status || "active", // Default to "active" if not provided
      ...update, // Spread the extra fields into the actor object
    });

    // If the status is "active", call the function to assign the actor to a user
    if (status === "active") {
      console.log("Calling assignActorToUser with code:", code);
      await assignActorToUser(code);
    }

    return res
      .status(201)
      .json({ message: "Actor added successfully.", actor });
  } catch (error) {
    console.error("Error adding actor:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

///update actor codes
exports.editActorCode = async (req, res) => {
  try {
    const userRole = req.user.role;
    // Check if role is one of the allowed roles
    if (!["admin", "super_admin", "hr"].includes(userRole)) {
      return res.status(403).json({ message: "Unauthorized" });
    }
    if (
      !req.body.code ||
      !req.body.name ||
      !req.body.position ||
      !req.body.role ||
      !req.body.status ||
      !req.body.parent_code
    ) {
      return res.status(400).json({ message: "All fields are required." });
    }

    let { code, name, position, role, status, parent_code } = req.body;
    code = code.toUpperCase();
    const actorId = req.params.id;

    const actor = await ActorCode.findById(actorId);
    if (!actor) {
      return res.status(404).json({ message: "Actor not found." });
    }

    if (userRole === "admin" && (role === "admin" || role === "super_admin")) {
      return res.status(401).json({
        success: false,
        message: `Unauthorized! You cannot change the role to ${role}`,
      });
    }
    if (
      userRole === "hr" &&
      (role === "admin" || role === "hr" || role === "super_admin")
    ) {
      return res.status(401).json({
        success: false,
        message: `Unauthorized! You cannot change the role to ${role}`,
      });
    }

    const existingActor = await ActorCode.findOne({ code });
    if (existingActor && existingActor._id.toString() !== actorId) {
      return res
        .status(400)
        .json({ message: "Actor code already exists with another record." });
    }

    if (actor.status === "active") {
      await editUser(actor.code, code, name, position, role, status);
    }

    // Update the actor using findByIdAndUpdate to ensure all fields are updated
    const updatedActor = await ActorCode.findByIdAndUpdate(
      actorId,
      {
        code,
        name,
        position,
        role,
        status,
        parent_code,
        updatedAt: new Date(),
      },
      { new: true }
    );

    if (status === "active") {
      await assignActorToUser(code);
    }

    return res
      .status(200)
      .json({ message: "Actor updated successfully.", actor: updatedActor });
  } catch (error) {
    console.error("Error editing actor:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

/////Actor Code for Admin and Super Admin/////
exports.getActorCodeForAdminAndSuperAdmin = async (req, res) => {
  const {
    page = 1,
    limit = 50,
    sort = "createdAt",
    order = "",
    search = "",
    status = "",
  } = req.query;

  try {
    const user = req.user;
    const filters = {};
    // Ensure order is a number
    const sortOrder = order === "-1" ? -1 : 1;

    // Search filter (case-insensitive)
    if (search) {
      const searchRegex = new RegExp(search, "i"); // Create regex once
      filters.$or = [{ code: searchRegex }, { name: searchRegex }];
    }
    if (status) {
      filters.status = status;
    }
    if (user.role === "admin") {
      filters.role = { $nin: ["admin", "super_admin"] };
    }
    const actorCodes = await ActorCode.find(filters)
      .sort({ [sort]: sortOrder })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const totalRecords = await ActorCode.countDocuments(filters);

    if (!actorCodes || actorCodes.length === 0) {
      return res.status(404).json({ message: "No actor codes found." });
    }

    return res.status(200).json({
      message: "Actor codes fetched successfully",
      currentPage: Number(page),
      totalRecords,
      data: actorCodes,
    });
  } catch (error) {
    console.error("Error getting actor code for admin and super admin:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

exports.deleteActorCode = async (req, res) => {
  try {
    const actorId = req.params.id;

    // Find the actor code
    const actor = await ActorCode.findById(actorId);
    if (!actor) {
      return res.status(404).json({ message: "Actor code not found." });
    }
    if (actor.status === "active") {
      await deleteUser(actor.code);
    }

    // Delete the actor code
    await ActorCode.findByIdAndDelete(actorId);

    return res
      .status(200)
      .json({ message: "Actor code deleted successfully." });
  } catch (error) {
    console.error("Error deleting actor code:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

exports.getEmployeeCodeAndName = async (req, res) => {
  try {
    const employees = await ActorCode.find({
      role: "employee",
      status: "active",
    });

    if (!employees) {
      return res.status(400).json({ message: "Employee not found" });
    }

    const employeeList = employees.map((employee) => ({
      employee_code: employee.code,
      employee_name: employee.name,
    }));

    return res.status(200).json({ employeeList });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
