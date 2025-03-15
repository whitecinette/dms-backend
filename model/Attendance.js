const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    date: { type: Date, required: true },
    punchIn: { type: Date, default: null },
    punchOut: { type: Date, default: null },
    status: {
      type: String,
      enum: [
        "Pending",
        "Present",
        "Absent",
        "Half Day",
        "Approved",
        "Rejected",
      ], // Fixed "Half-day"
      default: "Pending",
    },
    punchInImage: { type: String, default: null },
    punchOutImage: { type: String, default: null },
    leaveType: {
      type: String,
      enum: ["Sick", "Casual", "Paid", "Unpaid", "Other"],
      required: false, // Changed to optional
    },
    leaveDescription: { type: String, required: false }, // Changed to optional
    hoursWorked: { type: Number, default: 0 }, // Ensures default value
    punchOutCode: { type: String },
    punchOutName: { type: String },
    punchInCode: { type: String },
    punchInName: { type: String },

    latitude: Number,
    longitude: Number,
  },
  { strict: false, timestamps: true }
);

module.exports = mongoose.model("Attendance", attendanceSchema);
