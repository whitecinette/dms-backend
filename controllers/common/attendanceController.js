const Attendance = require("../../model/Attendance");
const ActorCode = require("../../model/ActorCode");
const moment = require("moment");
const HierarchyEntries = require("../../model/HierarchyEntries");
const User = require("../../model/User");
const getDistance = require("../../helpers/attendanceHelper");

const cloudinary = require("../../config/cloudinary");
// punch in

exports.punchIn = async (req, res) => {
  try {
    console.log("Punch in reaching");
    const { latitude, longitude } = req.body;
    const { code } = req.user;

    if (!code)
      return res
        .status(400)
        .json({ message: "User code is missing in token." });

    const formattedDate = moment().format("YYYY-MM-DD");
    const punchInTime = moment().format("YYYY-MM-DD HH:mm:ss");

    const existingAttendance = await Attendance.findOne({
      code,
      date: formattedDate,
    });
    if (existingAttendance) {
      return res.status(400).json({
        message: "You have already punched in for today.",
        attendance: existingAttendance,
      });
    }

    // Dynamic hierarchy handling logic
    const userHierarchies = await HierarchyEntries.find({});

    const matchedHierarchies = userHierarchies.filter((hierarchy) => {
      const hierarchyKeys = Object.keys(hierarchy.toObject()).filter(
        (key) => key !== "_id" && key !== "hierarchy_name" && key !== "__v"
      );
      return hierarchyKeys.some((key) => hierarchy[key] === code);
    });

    let allCodes = [];
    matchedHierarchies.forEach((hierarchy) => {
      const hierarchyKeys = Object.keys(hierarchy.toObject()).filter(
        (key) => key !== "_id" && key !== "hierarchy_name" && key !== "__v"
      );
      const relatedCodes = hierarchyKeys
        .flatMap((key) => hierarchy[key])
        .filter(Boolean);
      allCodes.push(...relatedCodes);
    });

    allCodes = [...new Set(allCodes)];

    if (!allCodes.length) {
      return res
        .status(404)
        .json({ message: "No related employees found in the hierarchy." });
    }

    const relatedUsers = await User.aggregate([
      {
        $match: {
          code: { $in: allCodes }, // Match only relevant users
          latitude: { $type: "decimal" },
          longitude: { $type: "decimal" },
        },
      },
      {
        $project: {
          code: 1,
          name: 1,
          latitude: 1,
          longitude: 1,
        },
      },
    ]);

    if (!relatedUsers.length) {
      return res
        .status(404)
        .json({ message: "No related users with location data found." });
    }

    const userLat = parseFloat(latitude);
    const userLon = parseFloat(longitude);

    let nearestUser = null;
    let minDistance = Infinity;

    relatedUsers.forEach((relUser) => {
      const relLat = parseFloat(relUser.latitude);
      const relLon = parseFloat(relUser.longitude);

      if (isNaN(relLat) || isNaN(relLon)) return;

      const distance = getDistance(userLat, userLon, relLat, relLon);
      if (distance < minDistance) {
        minDistance = distance;
        nearestUser = relUser;
      }
    });

    if (!nearestUser || minDistance > 100) {
      return res.status(400).json({
        message:
          "You are too far from the nearest hierarchy member to punch in.",
        nearestUser: {
          code: nearestUser?.code || "N/A",
          name: nearestUser?.name || "Unknown",
        },
        distance: minDistance,
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Punch-in image is required.",
      });
    }

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "gpunchInImage",
      resource_type: "image",
    });

    const attendance = new Attendance({
      code,
      date: formattedDate,
      punchIn: punchInTime,
      status: "Pending",
      latitude,
      longitude,
      punchInImage: result.secure_url,
      punchInCode: nearestUser.code,
      punchInName: nearestUser.name,
    });

    await attendance.save();

    res
      .status(201)
      .json({ message: "Punch-in recorded successfully", attendance });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error recording punch-in", error: error.message });
    console.log("errorrr:", error);
  }
};

// punch out
exports.punchOut = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const { code } = req.user;

    if (!code)
      return res
        .status(400)
        .json({ message: "User code is missing in token." });

    const formattedDate = moment().format("YYYY-MM-DD");
    const punchOutTime = moment().format("YYYY-MM-DD HH:mm:ss");

    const attendance = await Attendance.findOne({ code, date: formattedDate });
    if (!attendance) {
      return res
        .status(400)
        .json({ message: "You have not punched in yet for today." });
    }

    if (attendance.punchOut) {
      return res
        .status(400)
        .json({ message: "You have already punched out today." });
    }

    const userHierarchies = await HierarchyEntries.find({});
    const matchedHierarchies = userHierarchies.filter((hierarchy) => {
      const hierarchyKeys = Object.keys(hierarchy.toObject()).filter(
        (key) => key !== "_id" && key !== "hierarchy_name" && key !== "__v"
      );
      return hierarchyKeys.some((key) => hierarchy[key] === code);
    });

    let allCodes = [];
    matchedHierarchies.forEach((hierarchy) => {
      const hierarchyKeys = Object.keys(hierarchy.toObject()).filter(
        (key) => key !== "_id" && key !== "hierarchy_name" && key !== "__v"
      );
      const relatedCodes = hierarchyKeys
        .flatMap((key) => hierarchy[key])
        .filter(Boolean);
      allCodes.push(...relatedCodes);
    });

    allCodes = [...new Set(allCodes)];

    const relatedUsers = await User.aggregate([
      {
        $match: {
          code: { $in: allCodes },
          latitude: { $type: "decimal" },
          longitude: { $type: "decimal" },
        },
      },
      { $project: { code: 1, name: 1, latitude: 1, longitude: 1 } },
    ]);

    const userLat = parseFloat(latitude);
    const userLon = parseFloat(longitude);

    let nearestUser = null;
    let minDistance = Infinity;

    relatedUsers.forEach((relUser) => {
      const relLat = parseFloat(relUser.latitude);
      const relLon = parseFloat(relUser.longitude);

      if (isNaN(relLat) || isNaN(relLon)) return;

      const distance = getDistance(userLat, userLon, relLat, relLon);
      if (distance < minDistance) {
        minDistance = distance;
        nearestUser = relUser;
      }
    });

    if (!nearestUser || minDistance > 100) {
      return res.status(400).json({
        message:
          "You are too far from the nearest hierarchy member to punch out.",
        nearestUser,
        distance: minDistance,
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Punch-out image is required.",
      });
    }

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "gpunchOutImage",
      resource_type: "image",
    });

    const punchOutImage = result.secure_url;

    const durationMinutes = moment(punchOutTime).diff(
      moment(attendance.punchIn),
      "minutes"
    );
    const hoursWorked = (durationMinutes / 60).toFixed(2);

    let status = "Present";
    if (hoursWorked <= 4) {
      status = "Absent";
    } else if (hoursWorked < 8) {
      status = "Half Day";
    }

    attendance.punchOut = punchOutTime;
    attendance.punchOutImage = punchOutImage;
    attendance.status = status;
    attendance.latitude = latitude;
    attendance.longitude = longitude;
    attendance.hoursWorked = parseFloat(hoursWorked);

    attendance.punchOutCode = nearestUser.code;
    attendance.punchOutName = nearestUser.name;

    await attendance.save();

    res.status(201).json({
      message: "Punch-out recorded successfully",
      attendance: {
        ...attendance.toObject(),
        punchOutCode: attendance.punchOutCode,
        punchOutName: attendance.punchOutName,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error recording punch-out", error: error.message });
    console.error("Error:", error);
  }
};

exports.getAttendance = async (req, res) => {
  try {
    // Fetch all attendance records for the user
    const attendanceRecords = await Attendance.find();

    if (!attendanceRecords.length) {
      return res.status(404).json({ message: "No attendance records found." });
    }

    res.status(200).json({
      message: "Attendance records fetched successfully",
      attendance: attendanceRecords,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching attendance", error: error.message });
  }
};

exports.getAttendanceByEmployee = async (req, res) => {
  try {
    const { code } = req.params; // Extract user code from JWT token

    if (!code) {
      return res
        .status(400)
        .json({ message: "User code is missing in token." });
    }

    // Fetch all attendance records for the user
    const attendanceRecords = await Attendance.find({ code });

    if (!attendanceRecords.length) {
      return res.status(404).json({ message: "No attendance records found." });
    }

    res.status(200).json({
      message: "Attendance records fetched successfully",
      attendance: attendanceRecords,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching attendance", error: error.message });
  }
};

exports.requestLeave = async (req, res) => {
  try {
    const { startDate, endDate, leaveType, leaveDescription } = req.body;
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

// get attendance by date
exports.getAttendanceByDate = async (req, res) => {
  try {
    const { date } = req.params;

    let filter = {};
    if (date) {
      filter.date = date; // Assuming date is stored as "YYYY-MM-DD" string
    }

    const attendanceRecords = await Attendance.find(filter);

    if (!attendanceRecords.length) {
      return res
        .status(404)
        .json({ message: "No attendance records found for the given date." });
    }

    // Total attendance count
    const totalRecords = attendanceRecords.length;

    // Count different attendance statuses
    const halfDayCount = attendanceRecords.filter(
      (record) => record.status === "Half Day"
    ).length;
    const presentCount = attendanceRecords.filter(
      (record) => record.status === "Present"
    ).length;
    const leaveCount = attendanceRecords.filter(
      (record) => record.status === "Rejected" || record.status === "Approved"
    ).length;
    const absentCount = attendanceRecords.filter(
      (record) => record.status === "Absent"
    ).length;

    res.status(200).json({
      message: "Attendance records fetched successfully",
      attendance: attendanceRecords,
      counts: {
        halfDay: halfDayCount,
        present: presentCount,
        leave: leaveCount,
        absent: absentCount,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching attendance", error: error.message });
  }
};

// exports.getDealersByEmployeeCode = async (req, res) => {
//     try {
//         const { code } = req.params; // Get employee code from request params

//         // Find all hierarchy entries where the employee's code matches the `tse` field
//         const hierarchyData = await HierarchyEntries.find({ tse: code });

//         if (!hierarchyData || hierarchyData.length === 0) {
//             return res.status(404).json({ message: "No dealers found under this employee." });
//         }

//         // Extract all dealers from the found hierarchy entries
//         const dealers = hierarchyData.map(entry => entry.dealer);

//         res.status(200).json({ dealers });
//     } catch (error) {
//         res.status(500).json({ message: "Server error", error: error.message });
//     }
// };

// exports.getDealersByEmployeeCode = async (req, res) => {
//  try {
//      const { code } = req.params; // Get employee code from request params

//      // Find all hierarchy entries where the employee's code matches any of the fields
//      const hierarchyData = await HierarchyEntries.find({
//          $or: [
//              { tse: code },
//              { mdd: code },
//              { asm: code },
//              { szd: code }
//          ]
//      });

//      if (!hierarchyData || hierarchyData.length === 0) {
//          return res.status(404).json({ message: "No dealers found under this employee." });
//      }

//      // Extract all dealer codes from the found hierarchy entries
//      const dealerCodes = hierarchyData.map(entry => entry.dealer);

//      // Find dealers in the User model using the dealer codes
//      const dealersWithLocation = await User.find(
//          { code: { $in: dealerCodes } },
//          { code: 1, name: 1, longitude: 1, latitude: 1, _id: 0 } // Selecting necessary fields
//      );

//      res.status(200).json({ dealers: dealersWithLocation });
//  } catch (error) {
//      res.status(500).json({ message: "Server error", error: error.message });
//  }
// };
// const getDistance = (lat1, lon1, lat2, lon2) => {
//     const toRad = (value) => (value * Math.PI) / 180;
//     const R = 6371; // Radius of Earth in km
//     const dLat = toRad(lat2 - lat1);
//     const dLon = toRad(lon2 - lon1);
//     const a =
//         Math.sin(dLat / 2) * Math.sin(dLat / 2) +
//         Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
//         Math.sin(dLon / 2) * Math.sin(dLon / 2);
//     const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
//     return R * c; // Distance in km
// };

// exports.getDealersByEmployeeCode = async (req, res) => {
//     try {
//         const { code } = req.params; // Get employee code and location from request params
//         const {  latitude, longitude } = req.body;

//         // Find all hierarchy entries where the employee's code matches any of the fields
//         const hierarchyData = await HierarchyEntries.find({
//             $or: [
//                 { tse: code },
//                 { mdd: code },
//                 { asm: code },
//                 { szd: code }
//             ]
//         });

//         if (!hierarchyData || hierarchyData.length === 0) {
//             return res.status(404).json({ message: "No dealers found under this employee." });
//         }

//         // Extract all dealer codes from the found hierarchy entries
//         const dealerCodes = hierarchyData.map(entry => entry.dealer);

//         // Find dealers in the User model using the dealer codes
//         const dealersWithLocation = await User.find(
//             { code: { $in: dealerCodes } },
//             { code: 1, name: 1, longitude: 1, latitude: 1, _id: 0 } // Selecting necessary fields
//         );

//         if (!dealersWithLocation || dealersWithLocation.length === 0) {
//             return res.status(404).json({ message: "No dealers with location data found." });
//         }

//         // Convert latitude and longitude to float
//         const userLat = parseFloat(latitude);
//         const userLon = parseFloat(longitude);

//         // Find the nearest dealer
//         let nearestDealer = null;
//         let minDistance = Infinity;

//         dealersWithLocation.forEach(dealer => {
//             if (dealer.latitude && dealer.longitude) {
//                 const distance = getDistance(userLat, userLon, parseFloat(dealer.latitude), parseFloat(dealer.longitude));
//                 if (distance < minDistance) {
//                     minDistance = distance;
//                     nearestDealer = dealer;
//                 }
//             }
//         });

//         if (!nearestDealer) {
//             return res.status(404).json({ message: "No nearby dealer found." });
//         }

//         res.status(200).json({ nearestDealer, distance: minDistance });
//     } catch (error) {
//         res.status(500).json({ message: "Server error", error: error.message });
//     }
// };
