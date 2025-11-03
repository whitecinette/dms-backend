const mongoose = require('mongoose');

const staticRouteSchema = new mongoose.Schema(
  {
    // Route name: e.g., "Tonk - Alwar"
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // Optional code for uniqueness or external mapping
    code: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },

    // Validity window for seasonal / periodic routes
    validFrom: { type: Date },
    validTo: { type: Date },

    // Hierarchy info for the overall route (optional)
    hierarchy: {
      zone: { type: String, trim: true },
      region: { type: String, trim: true },
      district: { type: String, trim: true },
      state: { type: String, trim: true },
    },

    // List of towns under this route
    towns: [
      {
        name: { type: String, required: true, trim: true },
        taluka: { type: String, trim: true },
        district: { type: String, trim: true },
        state: { type: String, trim: true },
        lat: { type: Number },
        lon: { type: Number },
      },
    ],

    // Assign route to users (SID codes, etc.)
    assignedTo: [
      {
        userCode: { type: String, trim: true },
        assignedDate: { type: Date, default: Date.now },
      },
    ],

    // Approval + lifecycle fields
    status: {
      type: String,
      enum: ['active', 'inactive', 'approved'],
      default: 'inactive',
    },
    approved: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    strict: true, // keeps schema organized and predictable
  }
);

module.exports = mongoose.model('StaticRoute', staticRouteSchema);
