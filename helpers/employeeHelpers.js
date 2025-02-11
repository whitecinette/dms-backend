const crypto = require("crypto");
const User = require("../model/User");

// generate unique code for employee
exports.generateEmployeeCode = async () => {
    // Find the most recent employee
    const lastEmployee = await User.findOne({ role: "employee" }).sort({ createdAt: -1 });

    // If no employee exists, start with EMP-0001
    if (!lastEmployee) {
        return "EMP-0001";
    }

    // Extract the numeric part from the last employee's code and increment it
    const lastCode = parseInt(lastEmployee.code.split("-")[1]);

    // Return the new employee code with zero-padded format
    return `EMP-${String(lastCode + 1).padStart(4, "0")}`;
};
