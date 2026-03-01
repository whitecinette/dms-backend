const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    // ✅ keep userId optional, but don't depend on it
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // ✅ primary stable identity
    code: { type: String, index: true }, // user code

    deviceId: { type: String, index: true }, // device UUID or whatever flutter sends
    deviceInfo: {
      brand: String,
      model: String,
      os: String,
      appVersion: String,
    },

    ip: String,
    userAgent: String,

    loginTime: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now },
    logoutTime: Date,

    // ✅ add revoked
    status: { type: String, enum: ["active", "expired", "revoked"], default: "active" },
  },
  { strict: false, timestamps: true }
);

module.exports = mongoose.model("Session", sessionSchema);