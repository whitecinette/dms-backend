
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



/////////////// ADMIN ///////////////////////////