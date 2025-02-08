const fs = require("fs");
const csvParser = require("csv-parser");
const ActorCode = require("../../model/ActorCode");

//////// Bulk Upload API (CSV)
exports.uploadBulkActorCodes = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "CSV file is required." });
        }

        console.log("File received:", req.file); // Debug log
        const results = [];
        const errors = [];
        const filePath = req.file.path;

        // Read the CSV file
        fs.createReadStream(filePath)
            .pipe(csvParser({ mapHeaders: ({ header }) => header.toLowerCase().trim() })) // Normalize headers
            .on("data", (row) => {
                console.log("Processing row:", row); // Debug log

                if (!row.code || !row.name || !row.position || !row.role) {
                    errors.push({ row, message: "Missing required fields" });
                } else {
                    results.push({
                        code: row.code.toUpperCase(),
                        name: row.name,
                        position: row.position,
                        role: row.role,
                    });
                }
            })
            .on("end", async () => {
                try {
                    console.log("CSV Processing Complete. Total Rows:", results.length); // Debug log
                    const insertedData = [];
                    const updatedData = [];

                    for (const data of results) {
                        const existingActor = await ActorCode.findOne({ code: data.code });

                        if (existingActor) {
                            existingActor.name = data.name;
                            existingActor.position = data.position;
                            existingActor.role = data.role;
                            await existingActor.save();
                            updatedData.push(existingActor);
                        } else {
                            const newActor = new ActorCode(data);
                            await newActor.save();
                            insertedData.push(newActor);
                        }
                    }

                    // Remove the temporary file
                    fs.unlinkSync(filePath);
                    console.log("File deleted:", filePath); // Debug log

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
//////// Bulk Upload API (CSV)

/////// Add Actor API///////
exports.addActorCode = async (req, res) => {
    try {
        let { code, name, position, role } = req.body;
        code = code.toUpperCase(); 

        // Check if the actor code already exists
        const existingActor = await ActorCode.findOne({ code });
        if (existingActor) {
            return res.status(400).json({ message: "Actor code already exists." });
        }

        // Create a new ActorCode entry
        const actor = new ActorCode({ code, name, position, role });
        await actor.save();

        return res.status(201).json({ message: "Actor added successfully.", actor });
    } catch (error) {
        console.error("Error adding actor:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};
/////// Add Actor API///////

///////Edit Actor API//////
exports.editActorCode = async (req, res) => {
    try {
        // Check if required fields are provided
        if (!req.body.code || !req.body.name || !req.body.position || !req.body.role) {
            return res.status(400).json({ message: "All fields (code, name, position, role) are required." });
        }

        // Extract and format the data
        let { code, name, position, role } = req.body;

        const actorId = req.params.id;

        // Check if the actor exists
        const actor = await ActorCode.findById(actorId);
        if (!actor) {
            return res.status(404).json({ message: "Actor not found." });
        }

        // Check if the updated code is already used by another actor
        const existingActor = await ActorCode.findOne({ code });
        if (existingActor && existingActor._id.toString() !== actorId) {
            return res.status(400).json({ message: "Actor code already exists with another record." });
        }

        // Update actor details
        actor.code = code;
        actor.name = name;
        actor.position = position;
        actor.role = role;

        // Save the updated actor
        await actor.save();

        return res.status(200).json({ message: "Actor updated successfully.", actor });

    } catch (error) {
        console.error("Error editing actor:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

