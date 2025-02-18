const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ActorCode",
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
    enum: ["Present", "Absent", "Half-day"],
    default: "Absent", // Default for attendance
  },
  leaveStatus: {
    type: String,
    enum: ["Pending", "Approved", "Rejected"],
    default: "Pending", 
  },
  leaveType: {
    type: String,
    enum: ["Sick", "Casual", "Paid", "Unpaid"],
  },
  leaveDescription: String,
  leaveDays: Number,
  hoursWorked: Number,
  latitude: Number,
  longitude: Number,
}, { timestamps: true });

module.exports = mongoose.model("Attendance", attendanceSchema);
