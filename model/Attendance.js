const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    code: {
      type: String, 
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    punchIn: String,
    punchOut: String,
    status: {
      type: String,
      enum: ["Pending", "Present", "Absent", "Half-day"],
      default: "Pending",
    },
    leaveType: {
      type: String,
      enum: ["Sick", "Casual", "Paid", "Unpaid"],
    },
    punchInImage: { 
      type: String, 
      default : null
     },
    hoursWorked: Number,
    leaveDescription: String,
    leaveDays: Number,
    latitude: Number,
    longitude: Number,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Attendance", attendanceSchema);
