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
        "Leave",
        // "Approved",
        // "Rejected",
      ], // Fixed "Half-day"
      default: "Present",
    },
    punchInImage: { type: String, default: null },
    punchOutImage: { type: String, default: null },
    hoursWorked: { type: Number, default: 0 },
    punchOutCode: { type: String },
    punchOutName: { type: String },
    punchInCode: { type: String },
    punchInName: { type: String },
    punchInLatitude: { type: mongoose.Schema.Types.Decimal128 },
    punchInLongitude: { type: mongoose.Schema.Types.Decimal128 },
    punchOutLatitude: { type: mongoose.Schema.Types.Decimal128, default: null },
    punchOutLongitude: {
      type: mongoose.Schema.Types.Decimal128,
      default: null,
    },
    // leaveType: {
    //   type: String,
    //   enum: ["Sick", "Casual", "Paid", "Unpaid", "Other"],
    //   required: false, // Changed to optional
    // },
    // leaveDescription: { type: String, required: false },
  },
  { strict: false, timestamps: true }
);

module.exports = mongoose.model("Attendance", attendanceSchema);
