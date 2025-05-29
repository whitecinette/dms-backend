const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const User = require("../../model/User");

exports.registerUserForApp = async (req, res) => {
  try {
    const { name, code, password, role, contact, email } = req.body;

    // Validate required fields
    if (!name || !code || !password || !role) {
      return res.status(400).json({ message: "Name, code, password, and role are required" });
    }

    // Check if the role is valid. Update the array to include your six user types.
    const validRoles = ["admin", "employee", "dealer", "mdd", "hr", "super_admin"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    // Check if a user with the same code already exists
    let existingUser = await User.findOne({ code });
    if (existingUser) {
      return res.status(400).json({ message: "User with this code already exists" });
    }

    // If an email is provided, check if it's already in use
    if (email) {
      existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: "User with this email already exists" });
      }
    }

    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create a new user. Adjust status and isVerified as needed.
    const newUser = new User({
      name,
      code,
      password: hashedPassword,
      role,
      contact,
      email,
      status: "active",       // Default status
      isVerified: false,      // New users are unverified by default
      version: 1,
    });

    await newUser.save();

    return res.status(201).json({
      message: "User registered successfully. Please verify your email.",
      user: {
        id: newUser._id,
        name: newUser.name,
        code: newUser.code,
        contact: newUser.contact,
        email: newUser.email,
        status: newUser.status,
        role: newUser.role,
        isVerified: newUser.isVerified,
        version: newUser.version,
      },
    });

  } catch (error) {
    console.error("Registration Error:", error);
    return res.status(500).json({ message: "Server Error", error });
  }
};

exports.loginUserForApp = async (req, res) => {
    try {
        console.log("Reaching...");
      const { code, password } = req.body; // Only code and password are required now
  
      // Validate required fields
      if (!code || !password) {
        return res.status(400).json({ message: "Code and password are required" });
      }
  
      // Find the user based solely on the unique code
      const user = await User.findOne({ code });
      if (!user) {
        return res.status(400).json({ message: "Invalid code or unauthorized access" });
      }
  
      // Compare password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: "Invalid credentials" });
      }
  
      // Check if the user is active and verified
      if (user.status !== "active" || !user.isVerified) {
        return res.status(400).json({ message: "User is not active or not verified" });
      }
  
      // Generate JWT token including code, name, role, status, and isVerified in the payload
      const tokenPayload = {
        id: user._id,
        code: user.code,
        name: user.name,
        role: user.role,       // Role is retrieved from the user document
        position: user.position,
        status: user.status,
        isVerified: user.isVerified,
      };
  
      const token = jwt.sign(
        tokenPayload,
        process.env.JWT_SECRET,
        { expiresIn: "7d" } // Token valid for 7 days
      );
  
      return res.status(200).json({
        message: `${user.role.charAt(0).toUpperCase() + user.role.slice(1)} logged in successfully`,
        user: {
          id: user._id,
          name: user.name,
          code: user.code,
          contact: user.contact,
          email: user.email,
          status: user.status,
          role: user.role,
          position: user.position,
          isVerified: user.isVerified,
          version: user.version,
          position: user.position,
        },
        token, // Include the generated JWT token in the response
      });
  
    } catch (error) {
      console.error("Login Error:", error);
      return res.status(500).json({ message: "Server Error", error });
    }
  };

exports.loginMddWithFirebasePhone = async (req, res) => {
  try {
    console.log("Hi mdd")
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone number is required" });

    const user = await User.findOne({ role: "mdd", "owner_details.phone": phone });

    if (!user) return res.status(404).json({ message: "MDD user not found with this phone" });

    const tokenPayload = {
      id: user._id,
      code: user.code,
      name: user.name,
      role: user.role,
      position: user.position,
      status: user.status,
      isVerified: user.isVerified,
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: "7d" });

    return res.status(200).json({ user, token });
  } catch (err) {
    console.error("Firebase MDD Login Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


// fetched dealers credit limit
exports.fetchCreditLimit = async (req, res) => {
 try {
   const { code } = req.user;

   // Select code, name, position, and creditLimit fields
   const user = await User.findOne({ code }).select("code name position credit_limit category").lean();

   if (!user) {
     return res.status(404).json({ message: "User not found" });
   }

   if (user.position !== "dealer") {
     return res.status(403).json({ message: "Credit limit available only for dealers" });
   }

   res.status(200).json({
     message: "Credit limit fetched successfully",
     code: user.code,
     name: user.name,
     creditLimit: user.credit_limit,
     category: user.category,
   });
 } catch (error) {
   console.error("Error fetching credit limit:", error);
   res.status(500).json({ message: "Internal Server Error" });
 }
};
