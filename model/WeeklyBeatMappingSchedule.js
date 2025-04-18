const mongoose = require("mongoose");

// Flexible Dealer Schema
const DealerScheduleSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    latitude: { type: mongoose.Schema.Types.Decimal128, required: true },
    longitude: { type: mongoose.Schema.Types.Decimal128, required: true },
    status: { type: String, enum: ["done", "pending"], required: true },
    distance: { type: String, default: null },
    // You can now add fields like zone, district, etc. in future CSVs
  },
  { strict: false } // ✅ Flexible for extra fields like "zone"
);

const WeeklyBeatMappingScheduleSchema = new mongoose.Schema(
  {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    code: { type: String, required: true }, // e.g. ASM code
    schedule: [DealerScheduleSchema], // ✅ Now a flat list of dealers
    total: { type: Number, default: 0 },
    done: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },
  },
  { strict: false, timestamps: true }
);

module.exports = mongoose.model(
  "WeeklyBeatMappingSchedule",
  WeeklyBeatMappingScheduleSchema
);
