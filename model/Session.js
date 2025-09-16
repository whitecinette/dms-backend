const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  deviceId: String,              // ANDROID_ID or generated UUID
  deviceInfo: {
    brand: String,               // Samsung, Xiaomi, etc.
    model: String,               // Galaxy S21, Redmi Note 10, etc.
    os: String,                  // Android 14, iOS 17, Windows 11
    appVersion: String           // From Flutter app
  },
  ip: String,                     // Client IP
  userAgent: String,              // Browser/app agent string
  loginTime: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now },
  status: { type: String, enum: ["active", "expired"], default: "active" }
}, { strict: false, timestamps: true });

module.exports = mongoose.model("Session", sessionSchema);
