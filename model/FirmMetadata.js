const mongoose = require("mongoose");

const firmMetaDataSchema = new mongoose.Schema(
  {
    firmCode: {
      type: String,
      required: true,
      unique: true, // one metadata doc per firm
      trim: true,
    },

    punchOutConsidered: { type: Boolean, default: false },
    halfDayThresholdHours: { type: Number },   // e.g., 4 hrs
    fullDayThresholdHours: { type: Number },   // e.g., 8 hrs
    overtimeEnabled: { type: Boolean, default: false },
    overtimeRateMultiplier: { type: Number },  // e.g., 1.5x

    leaveApprovalRequired: { type: Boolean, default: true },
    maxCasualLeaves: { type: Number },
    maxSickLeaves: { type: Number },
    maxAnnualLeaves: { type: Number },

    holidayList: [{ type: Date }], // optional predefined holidays

    payrollCycle: { type: String, enum: ["monthly", "weekly"], default: "monthly" },
    salaryCutoffDay: { type: Number }, // e.g., 25th of month

    gracePeriodMinutes: { type: Number }, // late mark grace

  },
  {
    timestamps: true,
    strict: false,
  }
);

module.exports = mongoose.model("FirmMetaData", firmMetaDataSchema);
