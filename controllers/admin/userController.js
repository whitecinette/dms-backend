
const bcrypt = require("bcryptjs");
const User = require("../../model/User");
const { generateAdminCode } = require("../../helpers/adminHelpers");
const jwt = require("jsonwebtoken");
const { inactiveActor, editActorCode } = require("../../helpers/actorToUserHelper");


/////////////// SUPER ADMIN ///////////////////////////
// 📌 Register Super Admin
exports.registerSuperAdmin = async (req, res) => {
    try {
        const { name, contact, email, password } = req.body;

        // Check if a Super Admin already exists
        const existingSuperAdmin = await User.findOne({ role: "super_admin" });
        if (existingSuperAdmin) {
            return res.status(400).json({ message: "Super Admin already exists" });
        }

        // Check if email is already taken
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "Email already in use" });
        }

        // Hash password before saving
        const hashedPassword = await bcrypt.hash(password, 10);

        // Generate unique code (e.g., "SUPER-001")
        const code = "SUPER-ADMIN-001";

        // Create Super Admin user
        const superAdmin = new User({
            name,
            code,
            password: hashedPassword,
            contact,
            email,
            status: "active",
            role: "super_admin",
            isVerified: true,
            version: 1,
        });

        await superAdmin.save();
        res.status(201).json({ message: "Super Admin registered successfully", superAdmin });
    } catch (error) {
        res.status(500).json({ message: "Server Error", error });
        console.log("Error:", error);
    }
};

// 📌 Super Admin Login
// exports.loginSuperAdmin = async (req, res) => {
//     try {
//         const { email, password } = req.body;

//         // Check if Super Admin exists
//         const superAdmin = await User.findOne({ email, role: "super_admin" });
//         if (!superAdmin) {
//             return res.status(400).json({ message: "Invalid credentials or unauthorized access" });
//         }

//         // Compare password
//         const isMatch = await bcrypt.compare(password, superAdmin.password);
//         if (!isMatch) {
//             return res.status(400).json({ message: "Invalid credentials" });
//         }

//         // Generate JWT token
//         const token = jwt.sign(
//             { id: superAdmin._id, role: superAdmin.role },
//             process.env.JWT_SECRET,
//             { expiresIn: "7d" } // Token valid for 7 days
//         );

//         res.status(200).json({
//             message: "Super Admin logged in successfully",
//             token,
//             user: {
//                 id: superAdmin._id,
//                 name: superAdmin.name,
//                 code: superAdmin.code,
//                 contact: superAdmin.contact,
//                 email: superAdmin.email,
//                 status: superAdmin.status,
//                 role: superAdmin.role,
//                 isVerified: superAdmin.isVerified,
//                 version: superAdmin.version,
//             },
//         });
//     } catch (error) {
//         res.status(500).json({ message: "Server Error", error });
//         console.log("Error:", error);
//     }
// };

// 📌 Delete a User (Only Super Admin)
// User can be MDD, Dealer, Employee or Admin
exports.deleteUserByAdmins = async (req, res) => {
    try {
        const { id } = req.params; // User ID to delete

        // const superAdmin = req.user;

        // // Check if requester is a Super Admin
        // if (!superAdmin || superAdmin.role !== "super_admin") {
        //     return res.status(403).json({ message: "Forbidden: Only Super Admin can delete users" });
        // }

        // Check if the user exists
        const userToDelete = await User.findById(id);
        if (!userToDelete) {
            return res.status(404).json({ message: "User not found" });
        }
        //deactivate actor codes
        await inactiveActor(userToDelete.code);
        // Delete the user (Only the user record, NOT related work)
        await User.findByIdAndDelete(id);

        res.status(200).json({ message: "User deleted successfully" });

    } catch (error) {
        console.error("Delete User Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};
// Edit admin profile for super admin
exports.editAdminProfileForSuperAdmin = async (req, res) => {
    try {
        const { id } = req.params; // Admin ID to edit
        const update = req.body;
        const admin = await User.findByIdAndUpdate(id, update, { new: true })
        if (!admin) {
            return res.status(404).json({ message: "Admin not found" });
        }
        res.status(200).json({ message: "Admin profile updated successfully" });
    } catch (error) {
        console.error("Edit Admin Profile Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

// 📌 inActive All Users (Admin, Employee, Dealer, or any role) for Super Admin
exports.deactivateUserBySuperAdmin = async (req, res) => {
    try {
        const { id } = req.params;  // User ID to deactivate

        // Find the user by ID (it can be Employee, Dealer, MDD, or Admin)
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Ensure that the user is not already inactive
        if (user.status === "inactive") {
            return res.status(400).json({ message: "User is already inactive" });
        }

        // Ensure the user performing the action is a super admin
        const super_admin = req.user;  // Admin information from the authentication middleware
        if (!super_admin || super_admin.role !== "super_admin") {
            return res.status(403).json({ message: "Forbidden: Only Super_Admin can deactivate users" });
        }

        // Check if the user being deactivated is a super admin
        if (user.role === "super_admin") {
            return res.status(403).json({ message: "Cannot deactivate super admin" });
        }

        // Proceed to deactivate the user (can be an admin, employee, dealer, MDD)
        user.status = "inactive";  // Setting user status to inactive
        user.isVerified = false;   // Optionally, you can also mark the user as unverified
        await user.save();
        await inactiveActor(user.code)

        res.status(200).json({ message: "User deactivated successfully", user });
    } catch (error) {
        res.status(500).json({ message: "Server Error", error });
        console.log("Error:", error);
    }
};

// 📌 Register Admin for Super Admin
exports.registerAdminForSuperAdmin = async (req, res) => {
    try {
        const { name, contact, email, password } = req.body;
        const superAdmin = req.user;

        if (!superAdmin || superAdmin.role !== "super_admin") {
            return res.status(403).json({ message: "Forbidden: Only Super Admin can register admins" });
        }
        // Check if email is already taken
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "Email already in use" });
        }

        // Generate unique Admin Code
        const code = await generateAdminCode();

        // Hash password before saving
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create Admin user
        const admin = new User({
            name,
            contact,
            email,
            password: hashedPassword,
            code,
            status: "active",
            role: "admin",
            isVerified: true,
            version: 1,
        });

        // Save the admin user to the database
        await admin.save();

        // Respond with success message
        res.status(201).json({ message: "Admin registered successfully", admin });

    } catch (error) {
        res.status(500).json({ message: "Server Error", error });
        console.log("Error:", error);
    }
};

// 📌 Register User by Super Admin
exports.registerUserBySuperAdmin = async (req, res) => {
    try {
        const { name, code, contact, email, password, role } = req.body;
        const superAdmin = req.user; // Admin information from the authentication middleware

        if (!superAdmin || superAdmin.role !== "super_admin") {
            return res.status(403).json({ message: "Forbidden: Only Super Admin can register users" });
        }


        // Allowed roles for Super Admin
        const allowedRoles = ["admin", "mdd", "dealer", "employee"];
        if (!allowedRoles.includes(role)) {
            return res.status(400).json({ message: "Invalid role assignment" });
        }

        // Check if email is already taken
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "Email already in use" });
        }

        // Generate unique code
        // const code = await generateAdminCode();

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        const newUser = new User({
            name,
            code,
            password: hashedPassword,
            contact,
            email,
            status: "active",  // Default active
            role,
            isVerified: true,   // Default verified
            version: 1,
            verifiedBy: {
                Name: superAdmin.name,
                role: superAdmin.role,
            }
        });

        await newUser.save();
        res.status(201).json({ message: "User registered successfully", user: newUser });

    } catch (error) {
        console.error("Register User by Super Admin Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// 📌 Edit User by Super Admin
// exports.editUserBySuperAdmin = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const { name, contact, email, status, role, position, isVerified } = req.body;

//         const user = await User.findByIdAndUpdate(
//             id,
//             { $set: { name, contact, email, status, role, position, isVerified } },
//             { new: true } // Returns the updated user & applies schema validation
//         );

//         if (!user) return res.status(404).json({ message: "User not found" });

//         // Edit actor code
//         await editActorCode(user.code, user.name, user.status, user.role, user.position);

//         res.status(200).json({ message: "User updated successfully", user });

//     } catch (error) {
//         res.status(500).json({ message: "Server error", error: error.message });
//     }
// };


// 📌 Get User by Super Admin
exports.getUsersForAdmins = async (req, res) => {
    const {
        page = 1,
        limit = 50,
        sort = "createdAt",
        order = "" ,
        search = "",
        role = ""
    } = req.query;
    // console.log(req.query)
    try {
        const user = req.user;
        let totalUsers, employees, dealers, mdds, users;
        const filters = {};

        if (user.role === "super_admin") {
            filters.role = { $ne: "super_admin" };
            totalUsers = await User.countDocuments(filters);
            employees = await User.countDocuments({ role: { $in: ["employee", "admin"] } });
        } else {
            filters.role = { $nin: ["admin", "super_admin"] };
            totalUsers = await User.countDocuments(filters);
            employees = await User.countDocuments({ role: "employee" });
        }

        // Ensure order is a number
        const sortOrder = order === "-1" ? -1 : 1;

        // Ensure role filter is correctly applied
        if (role) {
            filters.role = role;
        }

        // Search filter (case-insensitive)
        if (search) {
            filters.$or = [
                { name: { $regex: search, $options: "i" } },
                { code: { $regex: search, $options: "i" } },
                { contact: { $regex: search, $options: "i" } },
                { role: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
            ];
        }

        // Fetch users with filters, sorting, and pagination
        users = await User.find(filters)
            .sort({ [sort]: sortOrder }) // Ensure sorting is correct
            .limit(Number(limit)) // Ensure limit is a number
            .skip((Number(page) - 1) * Number(limit));

        // Count other user roles
        dealers = await User.countDocuments({ role: "dealer" });
        mdds = await User.countDocuments({ role: "mdd" });

        res.status(200).json({
            message: "All users fetched successfully",
            data: users,
            currentPage: Number(page),
            totalRecords: totalUsers,
            employees,
            dealers,
            mdds,
        });

    } catch (error) {
        console.error("Error fetching users:", error); // Log error to debug
        res.status(500).json({ message: "Server error", error: error.message });
    }
};



/////////////// SUPER ADMIN ///////////////////////////


/////////////// ADMIN ///////////////////////////

// 📌 Edit Admin Profile
exports.editAdminProfile = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, password, contact, email } = req.body;

        // Check if user exists
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        // Ensure only Admins can be updated
        if (user.role !== "admin") {
            return res.status(403).json({ message: "Unauthorized: Only admins can be updated" });
        }

        // Prevent duplicate email update
        if (email && email !== user.email) {
            if (await User.findOne({ email })) {
                return res.status(400).json({ message: "Email already in use" });
            }
        }

        // Prepare update object
        const updateData = {};
        if (name) updateData.name = name;
        if (contact) updateData.contact = contact;
        if (email) updateData.email = email;
        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }
        // Only hash password if it's different from the existing one
        if (password && !(await bcrypt.compare(password, user.password))) {
            updateData.password = await bcrypt.hash(password, 10);
        }
        // Update user with validation
        const updatedUser = await User.findByIdAndUpdate(id, updateData, {
            new: true,
            runValidators: true, // Enforce validation
        });

        res.status(200).json({ message: "User updated successfully", user: updatedUser });
    } catch (error) {
        console.error("Edit Admin Profile Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};
// 📌 Login Admin Profile
// exports.loginAdmin = async (req, res) => {
//     try {
//         const { email, password } = req.body;

//         // Check if Admin exists
//         const admin = await User.findOne({ email, role: "admin" });
//         if (!admin) {
//             return res.status(400).json({ message: "Invalid credentials or unauthorized access" });
//         }

//         // Compare password
//         const isMatch = await bcrypt.compare(password, admin.password);
//         if (!isMatch) {
//             return res.status(400).json({ message: "Invalid credentials" });
//         }

//         // Generate JWT token
//         const token = jwt.sign(
//             { id: admin._id, role: admin.role },
//             process.env.JWT_SECRET,
//             { expiresIn: "7d" } // Token valid for 7 days
//         );

//         res.status(200).json({
//             message: "Admin logged in successfully",
//             token,
//             user: {
//                 id: admin._id,
//                 name: admin.name,
//                 code: admin.code,
//                 contact: admin.contact,
//                 email: admin.email,
//                 status: admin.status,
//                 role: admin.role,
//                 isVerified: admin.isVerified,
//                 version: admin.version,
//             },
//         });
//     } catch (error) {
//         res.status(500).json({ message: "Server Error", error });
//         console.log("Error:", error);
//     }
// };
// 📌 Delete User (Employee, Dealer, or any role) for Admin
// exports.deleteUserByAdmin = async (req, res) => {
//     try {
//         const { id } = req.params; // User ID to delete
//         // const admin = req.user;

//         // // Check if requester is an Admin
//         // if (!admin || admin.role !== "admin") {
//         //     return res.status(403).json({ message: "Forbidden: Only Admins can delete users" });
//         // }

//         // Check if the user exists
//         const userToDelete = await User.findById(id);
//         if (!userToDelete) {
//             return res.status(404).json({ message: "User not found" });
//         }

//         // Check if Admin is trying to delete another Admin (this logic can be adjusted based on your needs)
//         if (userToDelete.role === "admin" || userToDelete.role === "super_admin") {
//             return res.status(403).json({ message: "Admins cannot delete Super Admin or other Admins" });
//         }
//         //deactivate actor code
//         await inactiveActor(userToDelete.code)
//         // Delete the user (Only the user record, NOT related work)
//         await User.findByIdAndDelete(id);

//         res.status(200).json({ message: "User deleted successfully" });

//     } catch (error) {
//         console.error("Delete User Error:", error);
//         res.status(500).json({ message: "Internal Server Error" });
//     }
// };

// 📌 inActive User (Employee, Dealer, or any role) for Admin
exports.deactivateUserByAdmin = async (req, res) => {
    try {
        const { id } = req.params;  // User ID to deactivate
       
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Ensure the user performing the action is an admin
        const admin = req.user;  // Admin information from the authentication middleware
        if (!admin || admin.role !== "admin") {
            return res.status(403).json({ message: "Forbidden: Only Admin can deactivate users" });
        }

        // Check if the user being deactivated is an admin or super admin
        if (user.role === "admin" || user.role === "super_admin") {
            return res.status(403).json({ message: "Cannot deactivate another admin or super admin" });
        }

        // Ensure that the user is not already inactive
        if (user.status === "inactive") {
            return res.status(400).json({ message: "User is already inactive" });
        }

        // Update the user's status to "inactive" and mark as unverified
        user.status = "inactive";
        user.isVerified = false;  // Optionally, mark the user as unverified
        await user.save();
        //deactivate actor code
        await inactiveActor(user.code)

        res.status(200).json({ message: "User deactivated successfully", user });
    } catch (error) {
        res.status(500).json({ message: "Server Error", error });
        console.log("Error:", error);
    }
};

// 📌 Register User by Admin
exports.registerUserByAdmin = async (req, res) => {
    try {
        const { name,code, contact, email, password, role, address, bankAccountNumber, bankName } = req.body;
        const admin = req.user;
        
        if (!admin || admin.role !== "admin") {
            return res.status(403).json({ message: "Forbidden: Only Admin can register users" });
        }

        // Allowed roles for Admin (cannot create another Admin or MDD)
        const allowedRoles = ["dealer", "employee", "mdd"];
        if (!allowedRoles.includes(role)) {
            return res.status(400).json({ message: "Invalid role assignment" });
        }

        // Check if email is already taken
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "Email already in use" });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        const newUser = new User({
            name,
            code,  // Assuming generateAdminCode() is defined elsewhere
            password: hashedPassword,
            contact,
            email,
            status: "active",  // Default active
            role,
            isVerified: true,   // Default verified
            version: 1,
            verifiedBy: {
                // userId: admin._id,
                role: admin.role,
                name: admin.name
            }
        });

        await newUser.save();
        res.status(201).json({ message: "User registered successfully", user: newUser });

    } catch (error) {
        console.error("Register User by Admin Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// 📌 Edit User by Admins
exports.editUserByAdmins = async (req, res) => {
    try {
        console.log(req.params);
        const { id } = req.params;
        const { name, email, code, role, position, status } = req.body;

        const user = await User.findById(id);
        if (!user) return res.status(404).json({ message: "User not found" });

        // Only check if the code exists for other users (ignore the current user's code)
        const existingUser = await User.findOne({ code, _id: { $ne: id } });
        if (existingUser) return res.status(400).json({ message: "Code already in use" });

        // Ensure the status is being updated
        if (typeof status !== "string" || (status !== "active" && status !== "inactive")) {
            return res.status(400).json({ message: "Invalid status value" });
        }

        // Update user
        const updatedUser = await User.findByIdAndUpdate(
            id,
            { $set: { name, code, email, status, role, position } },
            { new: true, runValidators: true } // Ensures validation
        );

        // Ensure editActorCode only runs if the user was successfully updated
        if (updatedUser) {
            await editActorCode(
                updatedUser.code,
                updatedUser.name,
                updatedUser.status,
                updatedUser.role,
                updatedUser.position
            );
        }

        res.status(200).json({ message: "User updated successfully", user: updatedUser });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};


// 📌 Get Users for Admin
// exports.getUsersForAdmin = async (req, res) => {
//     try {
//         // Fetch only non-admin users
//         const users = await User.find({ role: { $nin: ["admin", "super_admin"] } });

//         res.status(200).json({ message: "Users fetched successfully", users });
//     } catch (error) {
//         res.status(500).json({ message: "Server error", error: error.message });
//     }
// };

/////////////// ADMIN ///////////////////////////
// ============= Permission by Admin or Super Admin================
// 📌 Activate and Verify Employee (Only Admin/Super Admin)
exports.activateAndVerifyUser = async (req, res) => {
    try {
        const { id } = req.params;  // Employee ID to activate and verify

        // Find the employee by ID
        const person = await User.findById(id);
        if (!person) {
            return res.status(404).json({ message: "person not found" });
        }

        // Get the super admin or admin performing the action
        const adminOrSuperAdmin = req.user;  // Admin or Super Admin information from the authentication middleware

        // Ensure super admin can verify any user (admin, employee, dealer, MDD)
        if (adminOrSuperAdmin.role === "super_admin") {
        //     // No restrictions for super admin, proceed with activation
        }
        // // Ensure admin can only activate employee, dealer, or MDD, not themselves or other admins
        else
            if (adminOrSuperAdmin.role === "admin") {
                // Admin should not be able to activate or verify themselves or other admins
                if (person.role === "admin") {
                    return res.status(403).json({ message: "An admin cannot activate or verify another admin" });
                }
            } else {
                return res.status(403).json({ message: "Only Admin or Super Admin can verify or activate users" });
            }

        // Ensure the user is not already active and verified
        if (person.status === "active" && person.isVerified === true) {
            return res.status(400).json({ message: "person is already active and verified" });
        }

        // Ensure an admin cannot verify or activate themselves
        if (adminOrSuperAdmin.role === "admin" && adminOrSuperAdmin._id.toString() === person._id.toString()) {
            return res.status(403).json({ message: "An admin cannot verify or activate itself" });
        }

        // Log who verified (admin or super_admin)
        person.verifiedBy = {
            userId: adminOrSuperAdmin._id,
            role: adminOrSuperAdmin.role,  // Store the role for clarity
            name: adminOrSuperAdmin.name   // Optional: You could also store the admin's name if needed
        };

        // Update status to active and mark as verified
        person.status = "active";
        person.isVerified = true;
        await person.save();

        res.status(200).json({ message: "Employee activated and verified successfully", person });
    } catch (error) {
        res.status(500).json({ message: "Server Error", error });
        console.log("Error:", error);
    }
};

// ============= /Permission by Admin or Super Admin================
// ============= /Login by Admin or Super Admin================

// 📌 Login by Admin or Super Admin
exports.loginAdminOrSuperAdmin = async (req, res) => {
    try {
        const { email, password, role } = req.body;  // Login with email, password, and role

        // Validate that the role is provided in the request body
        if (!role || !["super_admin", "admin"].includes(role)) {
            return res.status(400).json({ message: "Invalid role provided" });
        }

        // Check if the user exists based on email and role
        const user = await User.findOne({ email, role });
        if (!user) {
            return res.status(400).json({ message: "Invalid credentials or unauthorized access" });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "7d" } // Token valid for 7 days
        );

        res.status(200).json({
            message: `${role.charAt(0).toUpperCase() + role.slice(1)} logged in successfully`,
            token,
            user: {
                id: user._id,
                name: user.name,
                code: user.code,
                contact: user.contact,
                email: user.email,
                status: user.status,
                role: user.role,
                isVerified: user.isVerified,
                version: user.version,
            },
        });
    } catch (error) {
        res.status(500).json({ message: "Server Error", error });
        console.log("Error:", error);
    }
};
// ============= /Login by Admin or Super Admin================
