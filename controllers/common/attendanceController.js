const Attendance = require("../../model/Attendance");
const ActorCode = require("../../model/ActorCode");

const moment = require("moment"); // Make sure to install moment.js

exports.markAttendance = async (req, res) => {
  try {
    const { employeeId, date, punchIn, punchOut, latitude, longitude } =
      req.body;

    // Check if employee exists
    const employee = await ActorCode.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // Parse the punchIn and punchOut times to Date objects using moment.js
    const punchInTime = moment(punchIn, "hh:mm A").toDate();
    const punchOutTime = moment(punchOut, "hh:mm A").toDate();

    // Check for invalid times
    if (!punchInTime || !punchOutTime) {
      return res
        .status(400)
        .json({ message: "Invalid punch-in or punch-out time" });
    }

    // Calculate hours worked
    const hoursWorked = (punchOutTime - punchInTime) / (1000 * 60 * 60); // Convert milliseconds to hours

    // Set status based on hours worked
    let status = "Absent"; // Default status
    if (hoursWorked >= 8.5 && hoursWorked <= 9.5) {
      status = "Present"; // Set status to "Present" if hoursWorked is approximately 9 hours
    } else if (hoursWorked >= 4 && hoursWorked < 8.5) {
      status = "Half-day"; // Half-day if worked between 4 and 8 hours
    }

    // Create a new attendance record with latitude, longitude, and the calculated status
    const attendance = new Attendance({
      employeeId,
      date,
      punchIn: punchInTime,
      punchOut: punchOutTime,
      status,
      hoursWorked,
      latitude,
      longitude,
    });

    // Save the attendance record
    await attendance.save();

    // Respond with the attendance data
    res.status(201).json({
      message: "Attendance marked successfully",
      attendance,
    });
  } catch (error) {
    res.status(500).json({ message: "Error marking attendance", error });
  }
};

exports.getAttendanceByEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const attendance = await Attendance.find({ employeeId }).populate(
      "employeeId"
    );

    // Calculate attendance summary
    const summary = {
      present: 0,
      absent: 0,
      halfDay: 0,
    };

    attendance.forEach((record) => {
      if (record.status === "Present") summary.present += 1;
      if (record.status === "Absent") summary.absent += 1;
      if (record.status === "Half-day") summary.halfDay += 1;
    });

    res.status(200).json({
      message: "Attendance fetched successfully",
      attendance,
      summary,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching attendance", error });
  }
};

exports.getAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.find()
      .populate("employeeId", "name")
      .exec();

    // Attendance summary for all employees
    const summary = {
      present: 0,
      absent: 0,
      halfDay: 0,
    };

    attendance.forEach((record) => {
      if (record.status === "Present") summary.present += 1;
      if (record.status === "Absent") summary.absent += 1;
      if (record.status === "Half-day") summary.halfDay += 1;
    });

    res.status(200).json({
      message: "Attendance fetched successfully",
      attendance,
      summary,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching attendance", error });
  }
};

exports.requestLeave = async (req, res) => {
  try {
    const { startDate, endDate, leaveType, leaveDescription } =
      req.body;
    const { employeeId } = req.params;

    // Check if employee exists
    const employee = await ActorCode.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // Validate startDate and endDate
    const start = moment(startDate, "YYYY-MM-DD");
    const end = moment(endDate, "YYYY-MM-DD");
    if (!start.isValid() || !end.isValid() || end.isBefore(start)) {
      return res.status(400).json({ message: "Invalid date range" });
    }

    // Calculate number of leave days
    const leaveDays = end.diff(start, "days") + 1;

    // Create attendance records for the leave period
    const attendanceRecords = [];
    for (let day = 0; day < leaveDays; day++) {
      const leaveDate = moment(start).add(day, "days").toDate();

      const attendance = new Attendance({
        employeeId,
        date: leaveDate,
        // status: "Absent",        // Set attendance as Absent because it's a leave
        leaveStatus: "Pending", // Leave request is pending approval
        leaveType,
        leaveDescription,
        leaveDays,
      });

      attendanceRecords.push(attendance);
    }

    // Save all records
    await Attendance.insertMany(attendanceRecords);

    res.status(201).json({
      message: `${leaveDays} day(s) leave requested successfully.`,
      attendanceRecords,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error requesting leave",
      error: error.message || error,
    });
  }
};

exports.getEmpLeave = async (req, res) => {
  try {
    const { employeeId } = req.params;

    // Find all attendance records for the employee and populate actor details
    const leaveRecords = await Attendance.find({ employeeId }).populate({
      path: "employeeId",
      model: "ActorCode",
      select: "name code", // Fetch only name and code
    });

    if (!leaveRecords.length) {
      return res
        .status(404)
        .json({ message: "No leave records found for this employee." });
    }

    // Calculate total leaves
    const totalLeaves = leaveRecords.reduce(
      (sum, record) => sum + (record.leaveDays || 0),
      0
    );

    // Format the response
    const formattedRecords = leaveRecords.map((record) => ({
      _id: record._id,
      date: record.date,
      status: record.status,
      leaveStatus: record.leaveStatus,
      leaveType: record.leaveType,
      leaveDescription: record.leaveDescription,
      leaveDays: record.leaveDays,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      employeeId: record.employeeId._id,
      employeeName: record.employeeId.name,
      employeeCode: record.employeeId.code,
    }));

    res.status(200).json({
      message: "Leave records fetched successfully.",
      totalLeaves,
      data: formattedRecords,
    });
  } catch (error) {
    console.error("Error fetching employee leave:", error);
    res.status(500).json({
      message: "Error fetching employee leave",
      error: error.message || error,
    });
  }
};

exports.getAllEmpLeaves = async (req, res) => {
  try {
    // Find all attendance records and populate actor details
    const leaveRecords = await Attendance.find({}).populate({
      path: "employeeId",
      model: "ActorCode",
      select: "name code", // Fetch only name and code
    });

    if (!leaveRecords.length) {
      return res.status(404).json({ message: "No leave records found." });
    }

    // Group leave records by employee
    const groupedLeaves = {};

    leaveRecords.forEach((record) => {
      const empId = record.employeeId?._id?.toString() || "Unknown";

      if (!groupedLeaves[empId]) {
        groupedLeaves[empId] = {
          employeeId: record.employeeId?._id || null,
          employeeName: record.employeeId?.name || "Unknown",
          employeeCode: record.employeeId?.code || "Unknown",
          totalLeaves: 0,
          leaveRecords: [],
        };
      }

      groupedLeaves[empId].totalLeaves += record.leaveDays || 0;
      groupedLeaves[empId].leaveRecords.push({
        _id: record._id,
        date: record.date,
        status: record.status,
        leaveStatus: record.leaveStatus,
        leaveType: record.leaveType,
        leaveDescription: record.leaveDescription,
        leaveDays: record.leaveDays,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      });
    });

    // Convert the grouped object into an array
    const allEmployeeLeaves = Object.values(groupedLeaves);

    res.status(200).json({
      message: "All employee leave records fetched successfully.",
      totalEmployees: allEmployeeLeaves.length,
      data: allEmployeeLeaves,
    });
  } catch (error) {
    console.error("Error fetching all employees' leave records:", error);
    res.status(500).json({
      message: "Error fetching all employees' leave records",
      error: error.message || error,
    });
  }
};
