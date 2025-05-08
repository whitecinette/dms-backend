const jwt = require("jsonwebtoken");
const User = require("../model/User");

exports.superAdminAuth = async (req, res, next) => {
  try {
    const token = req.header("Authorization");
    if (!token) {
      return res.status(401).send({ message: "Access Denied. No token provided." });
    }
    
    // Log the token for debugging
    console.log("Received Token:", token);

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Log the decoded token for debugging
    console.log("Decoded Token:", decoded);

    const user = await User.findOne({ _id: decoded.id, role: "super_admin" });

    if (!user) {
      return res.status(401).send({ message: "Access Denied. You are not a super Admin" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Error in superAdminAuth middleware:", err);
    return res.status(500).json({ message: "Invalid or expired token." });
  }
};

exports.adminAuth = async (req, res, next) => {
  try {
    const token = req.header("Authorization");
    if (!token) {
      return res
        .status(401)
        .send({ message: "Access Denied. No token provided." });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log(decoded);
    const user = await User.findOne({ _id: decoded.id, role: "admin" });

    if (!user) {
      return res
        .status(401)
        .send({ message: "Access Denied. You are not a Admin" });
    }
    req.user = user;
    next();
  } catch (err) {
    console.log(err);
  }
};

///////common auth for admin and super admin
exports.adminOrSuperAdminAuth = async (req, res, next) => {
  try {
    const token = req.header("Authorization");
    if (!token) {
      return res.status(401).send({ message: "Access Denied. No token provided." });
    }

    // Remove the "Bearer " prefix if present
    //const tokenWithoutBearer = token.startsWith("Bearer ") ? token.slice(7) : token;

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    //console.log("Token received:", token);
    // console.log("Decoded Token:", decoded);

    // Find user and check role
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ message: "Access Denied. User not found." });
    }
    // console.log(user)
    if (!["admin", "super_admin"].includes(user.role)) {
      return res.status(403).json({ message: "Access Denied. You are not authorized." });
    }

    req.user = user;
    next(); // Proceed to the next middleware or controller
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Invalid or expired token." });
  }
};



exports.userAuth = async (req, res, next) => {
  try {
    console.log("User auth reaching!!")
      const token = req.header("Authorization");
      // console.log("Token: ", token);

      if (!token) {
          return res.status(401).json({ message: "Access denied. No token provided." });
      }

      // Verify token
      const decoded = jwt.verify(token.replace("Bearer ", ""), process.env.JWT_SECRET);
      req.user = decoded; // Attach user info to the request object

      // Fetch user details to ensure the user exists
      const user = await User.findById(req.user.id);
      if (!user) {
          return res.status(404).json({ message: "User not found." });
      }

      next(); // Move to the next middleware or route handler
  } catch (error) {
      // Warning-style response
    res.status(403).json({
     warning: true,
     message: "Session expired. Please log in again to continue.",
     error: error.message
    });
  }
};


exports.authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // use the same secret used in login
    req.user = decoded; // add decoded user to request
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Invalid token", error: error.message });
  }
};