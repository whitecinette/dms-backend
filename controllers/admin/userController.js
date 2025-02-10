
const bcrypt = require("bcryptjs");
const User = require("../../model/User");
const { generateAdminCode } = require("../../helpers/adminHelpers");
const jwt = require("jsonwebtoken");


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
exports.loginSuperAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if Super Admin exists
        const superAdmin = await User.findOne({ email, role: "super_admin" });
        if (!superAdmin) {
            return res.status(400).json({ message: "Invalid credentials or unauthorized access" });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, superAdmin.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: superAdmin._id, role: superAdmin.role },
            process.env.JWT_SECRET,
            { expiresIn: "7d" } // Token valid for 7 days
        );

        res.status(200).json({
            message: "Super Admin logged in successfully",
            token,
            user: {
                id: superAdmin._id,
                name: superAdmin.name,
                code: superAdmin.code,
                contact: superAdmin.contact,
                email: superAdmin.email,
                status: superAdmin.status,
                role: superAdmin.role,
                isVerified: superAdmin.isVerified,
                version: superAdmin.version,
            },
        });
    } catch (error) {
        res.status(500).json({ message: "Server Error", error });
        console.log("Error:", error);
    }
};

// 📌 Delete a User (Only Super Admin)
// User can be MDD, Dealer, Employee or Admin
exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params; // User ID to delete
        const token = req.headers.authorization?.split(" ")[1]; // Extract JWT Token

        if (!token) {
            return res.status(401).json({ message: "Unauthorized: No token provided" });
        }

        // Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const superAdmin = await User.findById(decoded.id);

        // Check if requester is a Super Admin
        if (!superAdmin || superAdmin.role !== "super_admin") {
            return res.status(403).json({ message: "Forbidden: Only Super Admin can delete users" });
        }

        // Check if the user exists
        const userToDelete = await User.findById(id);
        if (!userToDelete) {
            return res.status(404).json({ message: "User not found" });
        }

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
        const admin = await User.findByIdAndUpdate(id,update,{new:true})
        if(!admin){
            return res.status(404).json({ message: "Admin not found" });
        }
        res.status(200).json({ message: "Admin profile updated successfully" });
    } catch (error) {
        console.error("Edit Admin Profile Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}


/////////////// SUPER ADMIN ///////////////////////////


/////////////// ADMIN ///////////////////////////
exports.registerAdmin = async (req, res) => {
    try {
        const { name, contact, email, password } = req.body;

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
            code,
            password: hashedPassword,
            contact,
            email,
            status: "active",
            role: "admin",
            isVerified: true,
            version: 1,
        });

        await admin.save();
        res.status(201).json({ message: "Admin registered successfully", admin });
    } catch (error) {
        res.status(500).json({ message: "Server Error", error });
        console.log("Error:", error);
    }
};

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






/////////////// ADMIN ///////////////////////////


//////Edit profile for employee, dealer, mdd////
exports.editProfileForUser = async(req,res) => {
    try{
        const user = req.user;
        console.log("user: ",user)
        const update = req.body;
        const data = await User.findByIdAndUpdate(user._id,update,{new:true})
        if(!data){
            return res.status(404).json({message:"Failed to update user profile"})
        }
        res.status(200).json({message:"User profile updated successfully",user:data})
    }catch(err){
        console.error("Error updating user profile:",err)
        res.status(500).json({message:"Internal Server Error"})
    }
}
//////Edit profile for employee, dealer, mdd////