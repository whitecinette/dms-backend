const crypto = require("crypto");
const Firm = require("../model/Firm");

// Function to generate firmId from name
exports.generateFirmId = async (name) => {
    let firmId = name.toLowerCase().replace(/[^a-z0-9]/g, "-"); // Convert to lowercase & replace special chars
    let randomString = crypto.randomBytes(2).toString("hex"); // Generate 4-char random hex
    firmId = `${firmId}-${randomString}`; // Append random string for uniqueness

    // Ensure firmId is unique
    let existingFirm = await Firm.findOne({ firmId });
    while (existingFirm) {
        randomString = crypto.randomBytes(2).toString("hex");
        firmId = `${firmId}-${randomString}`;
        existingFirm = await Firm.findOne({ firmId });
    }

    return firmId;
};