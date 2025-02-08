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

// Function to generate a unique Admin Code
exports.generateAdminCode = async () => {
    const lastAdmin = await User.findOne({ role: "Admin" }).sort({ createdAt: -1 });

    if (!lastAdmin) {
        return "ADMIN-001";
    }

    // Extract the last numeric part and increment it
    const lastCode = parseInt(lastAdmin.code.split("-")[1]);
    return `ADMIN-${String(lastCode + 1).padStart(3, "0")}`;
};