const { v4: uuidv4 } = require("uuid");
const Firm = require("../../model/Firm");
const { generateFirmId } = require("../../helpers/adminHelpers");

// 📌 Create a new Firm
exports.createFirm = async (req, res) => {
    try {
        const { name, owners, gstNumber, logo, address, contact, accountDetails, website } = req.body;

        // Check if Firm already exists
        const existingFirm = await Firm.findOne({ gstNumber });
        if (existingFirm) {
            return res.status(400).json({ message: "Firm with this GST number already exists" });
        }

        // Ensure at least one owner is provided
        if (!owners || owners.length === 0) {
            return res.status(400).json({ message: "At least one owner is required" });
        }

        // Generate short & unique firmId from name
        const firmId = await generateFirmId(name);

        // Create Firm
        const firm = new Firm({
            firmId,
            name,
            owners,
            gstNumber,
            logo,
            address,
            contact,
            accountDetails,
            website,
        });

        await firm.save();
        res.status(201).json({ message: "Firm created successfully", firm });
    } catch (error) {
        res.status(500).json({ message: "Server Error", error });
        console.log("rerrro" , error)
    }
};


// 📌 Get all Firms
exports.getAllFirms = async (req, res) => {
    try {
        const firms = await Firm.find();
        res.status(200).json(firms);
    } catch (error) {
        res.status(500).json({ message: "Server Error", error });
    }
};

// 📌 Get a Firm by firmId
exports.getFirmById = async (req, res) => {
    try {
        const firm = await Firm.findOne({ firmId: req.params.firmId });

        if (!firm) {
            return res.status(404).json({ message: "Firm not found" });
        }

        res.status(200).json(firm);
    } catch (error) {
        res.status(500).json({ message: "Server Error", error });
    }
};

// 📌 Update a Firm
exports.updateFirm = async (req, res) => {
    try {
        const firm = await Firm.findOne({ firmId: req.params.firmId });

        if (!firm) {
            return res.status(404).json({ message: "Firm not found" });
        }

        // Update firm details
        Object.assign(firm, req.body);

        await firm.save();
        res.status(200).json({ message: "Firm updated successfully", firm });
    } catch (error) {
        res.status(500).json({ message: "Server Error", error });
    }
};

// 📌 Delete a Firm
exports.deleteFirm = async (req, res) => {
    try {
        const firm = await Firm.findOneAndDelete({ firmId: req.params.firmId });

        if (!firm) {
            return res.status(404).json({ message: "Firm not found" });
        }

        res.status(200).json({ message: "Firm deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server Error", error });
    }
};

