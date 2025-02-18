const Attendance = require("../../model/Attendance");
const ActorCode = require("../../model/ActorCode");

const moment = require('moment'); // Make sure to install moment.js

exports.markAttendance = async (req, res) => {
  try {
    const { employeeId, date, punchIn, punchOut, latitude, longitude } = req.body;

    // Check if employee exists
    const employee = await ActorCode.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // Parse the punchIn and punchOut times to Date objects using moment.js
    const punchInTime = moment(punchIn, 'hh:mm A').toDate();
    const punchOutTime = moment(punchOut, 'hh:mm A').toDate();

    // Check for invalid times
    if (!punchInTime || !punchOutTime) {
      return res.status(400).json({ message: "Invalid punch-in or punch-out time" });
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
    const attendance = await Attendance.find({ employeeId }).populate("employeeId");

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
      .populate('employeeId', 'name')
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
   const { employeeId, startDate, endDate, leaveType, leaveDescription } = req.body;

   // Check if employee exists
   const employee = await ActorCode.findById(employeeId);
   if (!employee) {
     return res.status(404).json({ message: "Employee not found" });
   }

   // Validate startDate and endDate
   const start = moment(startDate, 'YYYY-MM-DD');
   const end = moment(endDate, 'YYYY-MM-DD');
   if (!start.isValid() || !end.isValid() || end.isBefore(start)) {
     return res.status(400).json({ message: "Invalid date range" });
   }

   // Calculate number of leave days
   const leaveDays = end.diff(start, 'days') + 1;

   // Create attendance records for the leave period
   const attendanceRecords = [];
   for (let day = 0; day < leaveDays; day++) {
     const leaveDate = moment(start).add(day, 'days').toDate();

     const attendance = new Attendance({
       employeeId,
       date: leaveDate,
       status: "Absent",        // Set attendance as Absent because it's a leave
       leaveStatus: "Pending",  // Leave request is pending approval
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



//  try {
//    const { employeeId } = req.params;

//    // Find employee details
//    const employee = await ActorCode.findById(employeeId);
//    if (!employee) {
//      return res.status(404).json({ message: "Employee not found" });
//    }

//    // Find leave records for the employee
//    const leaveRecords = await Attendance.find({
//      employeeId,
//      leaveStatus: { $exists: true } // Only fetch records with leaveStatus
//    }).sort({ date: 1 });

//    if (leaveRecords.length === 0) {
//      return res.status(404).json({ message: "No leave records found for this employee" });
//    }

//    // Prepare the response
//    const response = {
//      employeeId: employee._id,
//      employeeCode: employee.employeeCode,
//      employeeName: `${employee.firstName} ${employee.lastName}`,
//      totalLeaves: leaveRecords.length,
//      leaveRecords: leaveRecords.map(record => ({
//        date: record.date,
//        status: record.status,
//        leaveStatus: record.leaveStatus,
//        leaveType: record.leaveType,
//        leaveDescription: record.leaveDescription,
//        leaveDays: record.leaveDays,
//        createdAt: record.createdAt
//      }))
//    };

//    res.status(200).json(response);
//  } catch (error) {
//    res.status(500).json({
//      message: "Error fetching leave records",
//      error: error.message || error,
//    });
//  }
// };