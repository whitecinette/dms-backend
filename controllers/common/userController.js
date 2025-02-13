const bcrypt = require("bcryptjs");
const User = require("../../model/User");
const jwt = require("jsonwebtoken");
const { sendNotificationToAdmins } = require("../../helpers/notificationHelper");

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

//////Edit profile for employee, dealer, mdd////
// exports.editProfileForUser = async (req, res) => {
//     try {
//         const user = req.user;
//         console.log("user to update:", user)
//         const update = req.body;
//         const data = await User.findByIdAndUpdate(user._id, update, { new: true })
//         if (!data) {
//             return res.status(404).json({ message: "Failed to update user profile" })
//         }
//         res.status(200).json({ message: "User profile updated successfully", user: data })
//     } catch (err) {
//         console.error("Error updating user profile:", err)
//         res.status(500).json({ message: "Internal Server Error" })
//     }
// }
//////Edit profile for employee, dealer, mdd////
// editProfileForUser controller
exports.editProfileForUser = async (req, res) => {
    try {
        const user = req.user; // Assumed that the user is populated by authentication middleware
        console.log("User to update: ", user);

        const update = req.body;
        const previousData = { ...user.toObject() }; // Save the current data to compare later

        // Check if the email format is valid (only if the email is provided)
        if (update.email && !validateEmail(update.email)) {
            return res.status(400).json({ message: "Invalid email format." });
        }

        // Store the plain password for the notification
        // let plainPassword = update.password;

        // If a new password is provided, hash it
        if (update.password) {
            update.password = await bcrypt.hash(update.password, 10);
        }

        // Update user profile with the provided fields
        const updatedUser = await User.findByIdAndUpdate(user._id, update, { new: true });

        if (!updatedUser) {
            return res.status(404).json({ message: "Failed to update user profile" });
        }

        // Compare old data with the updated data to check for changes
        const changes = [];
        for (let key in update) {
            if (update[key] !== previousData[key]) {
                changes.push({ field: key, oldValue: previousData[key], newValue: update[key] });
            }
        }

        // If password was updated, explicitly add it to the changes as plain text
        // if (plainPassword) {
        //     changes.push({
        //         field: "password",
        //         oldValue: "**********", // Don't show the old password for security
        //         newValue: plainPassword, // Show the new password in plain text in the notification
        //     });
        // }

        // If the email was updated, update the "fromEmail" for sending notification
        const userMakingChangesEmail = update.email || user.email;

        // If there are any changes, notify the admin and super admin
        if (changes.length > 0) {
            console.log(`Changes detected, notifying admins with sender email: ${userMakingChangesEmail}`);
            await sendNotificationToAdmins(changes, previousData, updatedUser, userMakingChangesEmail);  // This function will send notifications
        }

        // Return the updated user profile
        res.status(200).json({ message: "User profile updated successfully", user: updatedUser });

    } catch (err) {
        console.error("Error updating user profile:", err);
        res.status(500).json({ message: "Internal Server Error" });
    }
};




// Helper function to validate email format
function validateEmail(email) {
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return re.test(email);
}