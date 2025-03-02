const BeatMapping = require("../../model/BeatMapping");


exports.addBeatMapping = async (req, res) => {
    try {
        const { code } = req.user;
        if (!code) {
            return res.status(400).json({ message: "Invalid token: Code missing" });
        }

        // Extract data from request body
        const { latitude, longitude, accuracy, speed, altitude, address, deviceId, batteryLevel } = req.body;

        // Validate required fields
        if (!code || !latitude || !longitude) {
            return res.status(400).json({ message: "Latitude and longitude are required" });
        }

        // Create and save new beat mapping record
        const newBeatMapping = new BeatMapping({
            code,
            latitude,
            longitude,
            accuracy,
            speed,
            altitude,
            address,
            deviceId,
            batteryLevel
        });

        await newBeatMapping.save();

        res.status(201).json({
            message: "Beat mapping added successfully",
            data: newBeatMapping
        });

    } catch (error) {
        console.error("Error adding beat mapping:", error);
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
};



exports.getBeatMapping = async (req, res) =>{
    try {
        // Fetch all beat mapping data from MongoDB
        const beatMappings = await BeatMapping.find();

        // Check if data exists
        if (!beatMappings.length) {
            return res.status(404).json({ message: "No beat mapping records found" });
        }

        // Send response
        res.status(200).json({
            message: "Beat mapping data retrieved successfully",
            data: beatMappings
        });
    } catch (error) {
        console.error("Error fetching beat mapping data:", error);
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
}