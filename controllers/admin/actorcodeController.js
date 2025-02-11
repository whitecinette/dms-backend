const fs = require("fs");
const csvParser = require("csv-parser");
const ActorCode = require("../../model/ActorCode");
const User = require("../../model/User");
const { assignActorToUser } = require("../../helpers/actorToUserHelper");

///upload aotor codes in bulks
exports.uploadBulkActorCodes = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "CSV file is required." });
    }

    // console.log("File received:", req.file); // Debug log
    const results = [];
    const errors = [];
    const filePath = req.file.path;

    fs.createReadStream(filePath)
      .pipe(
        csvParser({ mapHeaders: ({ header }) => header.toLowerCase().trim() })
      ) // Normalize headers
      .on("data", (row) => {
        //console.log("Processing row:", row); // Debug log

        if (
          !row.code ||
          !row.name ||
          !row.position ||
          !row.role ||
          !row.status
        ) {
          errors.push({ row, message: "Missing required fields" });
        } else {
          results.push({
            code: row.code.toUpperCase(),
            name: row.name,
            position: row.position,
            role: row.role,
            status: row.status.toLowerCase(), // Normalize status
          });
        }
      })
      .on("end", async () => {
        try {
          //console.log("CSV Processing Complete. Total Rows:", results.length);
          const insertedData = [];
          const updatedData = [];

          for (const data of results) {
            const existingActor = await ActorCode.findOne({ code: data.code });

            if (existingActor) {
              existingActor.name = data.name;
              existingActor.position = data.position;
              existingActor.role = data.role;
              existingActor.status = data.status;
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

          fs.unlinkSync(filePath);
          //console.log("File deleted:", filePath);

          res.status(200).json({
            message: "CSV processed successfully",
            insertedCount: insertedData.length,
            updatedCount: updatedData.length,
            errors,
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

//add actor code
exports.addActorCode = async (req, res) => {
  try {
    let { code, name, position, role, status } = req.body;
    code = code.toUpperCase();

    const existingActor = await ActorCode.findOne({ code });
    if (existingActor) {
      return res.status(400).json({ message: "Actor code already exists." });
    }

    const actor = await ActorCode.create({
      code,
      name,
      position,
      role,
      status,
    });

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
    if (
      !req.body.code ||
      !req.body.name ||
      !req.body.position ||
      !req.body.role ||
      !req.body.status
    ) {
      return res.status(400).json({ message: "All fields are required." });
    }

    let { code, name, position, role, status } = req.body;
    code = code.toUpperCase();
    const actorId = req.params.id;

    const actor = await ActorCode.findById(actorId);
    if (!actor) {
      return res.status(404).json({ message: "Actor not found." });
    }

    const existingActor = await ActorCode.findOne({ code });
    if (existingActor && existingActor._id.toString() !== actorId) {
      return res
        .status(400)
        .json({ message: "Actor code already exists with another record." });
    }

    actor.code = code;
    actor.name = name;
    actor.position = position;
    actor.role = role;
    actor.status = status;

    await actor.save();

    if (status === "active") {
      await assignActorToUser(code);
    }

    return res
      .status(200)
      .json({ message: "Actor updated successfully.", actor });
  } catch (error) {
    console.error("Error editing actor:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

/////Actor Code for Admin and Super Admin/////
exports.getActorCodeForAdminAndSuperAdmin = async (req, res) => {
  try {
    const actorCode = await ActorCode.find();
    if (!actorCode) {
      return res.status(404).json({ message: "No actor code found." });
    }
    return res.status(200).json({ actorCode });
  } catch (error) {
    console.error("Error getting actor code for admin and super admin:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};
