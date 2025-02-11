const bcrypt = require("bcryptjs");
const User = require("../../model/User");
const jwt = require("jsonwebtoken");

exports.loginUser = async (req, res) => {
    try {
        const { code, password, role } = req.body;  // Login with code, password, and role

        // Validate that the role is provided in the request body
        if (!role) {
            return res.status(400).json({ message: "Role is required" });
        }

        // Check if the role is valid (employee, dealer, mdd)
        const validRoles = ["employee", "dealer", "mdd"];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ message: "Invalid role" });
        }

        // Check if the user exists based on code and role
        const user = await User.findOne({ code, role });  // Searching for user by their generated code and role

        if (!user) {
            return res.status(400).json({ message: "Invalid code or unauthorized access" });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);  // Compare with the user's stored password
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
                message: `${user.role.charAt(0).toUpperCase() + user.role.slice(1)} logged in successfully`,
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
