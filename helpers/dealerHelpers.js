const crypto = require("crypto");
const User = require("../model/User");



// generate unique code for dealer
exports.generateDealerCode = async () => { 
    // Find the most recent dealer
    const lastDealer = await User.findOne({ role: "dealer" }).sort({ createdAt: -1 });

    // If no dealer exists, start with EMP-0001
    if (!lastDealer) {
        return "DLR-0001";
    }
    
    // Extract the numeric part from the last dealer's code and increment it
    const lastCode = parseInt(lastDealer.code.split("-")[1]);

    // Return the new employee code with zero-padded format
    return `DLR-${String(lastCode + 1).padStart(4, "0")}`;
};
