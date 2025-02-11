const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    // code: { type: String, required: true, unique: true }, // Unique user identifier
    password: { type: String, required: true }, // Hashed password
    contact: { type: String },
    email: { type: String, unique: true, sparse: true, default: undefined },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    role: { type: String, required: true }, // Example: "Admin", "Employee", etc.
    isVerified: { type: Boolean, default: false },
    version: { type: Number, default: 1 }, // Track changes
    verifiedBy: {  // This is where we store who verified the user
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      role: String, // admin or super_admin
      name: String, // Name of the admin or super_admin
  },
  },
  {
    timestamps: true, // Automatically adds createdAt & updatedAt
    strict: false, // Allows flexible schema updates
  }
);

module.exports = mongoose.model("User", userSchema);
