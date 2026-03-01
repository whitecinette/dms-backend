const mongoose = require("mongoose");

const deviceItemSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true },     // UUID generated in Flutter (recommended)
    platform: { type: String, enum: ["flutter"], default: "flutter" },

    status: { type: String, enum: ["pending", "approved", "blocked"], default: "pending" },

    deviceInfo: {
      brand: String,
      model: String,
      os: String,
      appVersion: String,
    },

    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },

    approvedAt: Date,
    approvedByCode: String, // admin code who approved (optional)
  },
  { _id: false }
);

const deviceRegistrySchema = new mongoose.Schema(
  {
    // ✅ primary identity
    code: { type: String, required: true, unique: true, index: true },

    devices: { type: [deviceItemSchema], default: [] },
  },
  { strict: false, timestamps: true }
);

module.exports = mongoose.model("DeviceRegistry", deviceRegistrySchema);