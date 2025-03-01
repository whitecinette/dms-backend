const Attendance = require("../../model/Attendance");
const ActorCode = require("../../model/ActorCode");
const moment = require("moment");
const HierarchyEntries = require("../../model/HierarchyEntries");
const User = require("../../model/User");
const getDistance = require("../../helpers/attendanceHelper")

const cloudinary =require("../../config/cloudinary")
// punch in

exports.punchIn = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const { code } = req.user; // Get user code from JWT token

    if (!code) {
      return res.status(400).json({ message: "User code is missing in token." });
    }

    // Get current date for attendance tracking
    const formattedDate = moment().startOf("day").toDate();
    const punchInTime = moment().toDate();

    // Check if user already punched in today
    const existingAttendance = await Attendance.findOne({ code, date: formattedDate });
    if (existingAttendance) {
      return res.status(400).json({ message: "You have already punched in for today.", attendance: existingAttendance });
    }

    // Fetch hierarchy entry for the user
    const userHierarchy = await HierarchyEntries.findOne({
      $or: [{ tse: code },  { asm: code }], // Include all possible positions
    });

    if (!userHierarchy) {
      return res.status(404).json({ message: "No hierarchy data found for this user." });
    }
    // console.log(`User ${code} belongs to hierarchy:`, userHierarchy);


    // Extract all hierarchy levels dynamically
    const hierarchyKeys = Object.keys(userHierarchy.toObject()).filter(
      (key) => !["_id", "hierarchy_name", "createdAt", "updatedAt", "__v"].includes(key)
    );

    const allCodes = hierarchyKeys.map((key) => userHierarchy[key]).flat(); // Get all related employee codes

    if (!allCodes.length) {
      return res.status(404).json({ message: "No related employees found in the hierarchy." });
    }
    // console.log(`Related employee codes for user ${code}:`, allCodes);

    // Find all users related to extracted codes
    const relatedUsers = await User.find(
      { code: { $in: allCodes } },
      { code: 1, name: 1, longitude: 1, latitude: 1, _id: 0 }
    );
    if (!relatedUsers.length) {
      console.log("related user: " , relatedUsers);
      return res.status(404).json({ message: "No related users with location data found." });
    }

    // Convert user coordinates
    const userLat = parseFloat(latitude);
    const userLon = parseFloat(longitude);

    let nearestUser = null;
    let minDistance = Infinity;

    relatedUsers.forEach((relUser) => {
      const relLat = parseFloat(relUser.latitude);
      const relLon = parseFloat(relUser.longitude);

      if (isNaN(relLat) || isNaN(relLon) || (relLat === 0 && relLon === 0)) return;

      const distance = getDistance(userLat, userLon, relLat, relLon);
      if (distance < minDistance) {
        minDistance = distance;
        nearestUser = relUser;
      }
    });

    if (!nearestUser || minDistance > 100) {
      return res.status(400).json({
        message: "You are too far from the nearest hierarchy member to punch in.",
        nearestUser,
        distance: minDistance,
      });
    }

     // Upload image to Cloudinary if provided
if (!req.file) {
  return res.status(400).json({
    success: false,
    message: "Punch in image is required.",
  });
}

    const result = await cloudinary.uploader.upload(req.file.path, { folder: 'gpunchInImage', resource_type: 'image' });
    const punchInImage = result.secure_url;

    // Save punch-in record
    const attendance = new Attendance({
      code,
      date: formattedDate,
      punchIn: punchInTime,
      status: "Pending",
      latitude,
      longitude,
      punchInImage,
      nearestHierarchyCode: nearestUser.code,
    });

    await attendance.save();

    res.status(201).json({ message: "Punch-in recorded successfully", attendance });
  } catch (error) {
    res.status(500).json({ message: "Error recording punch-in", error: error.message });
  }
};

// punch out

exports.punchOut = async (req, res) => {
    try {
        const { latitude, longitude } = req.body;
        const code = req.user.code;  // Extract code from authenticated user

        // Get current date dynamically
        const formattedDate = moment().startOf("day").toDate();

        // Get current time dynamically for punch-out
        const punchOutTime = moment().toDate();



        // Find existing attendance record for today
        const attendance = await Attendance.findOne({ code, date: formattedDate });
        if (!attendance) {
            return res.status(400).json({ message: "You have not punched in yet for today." });
        }

        if (attendance.punchOut) {
            return res.status(400).json({ message: "You have already punched out today." });
        }

        // Fetch dealers assigned to this employee
        const hierarchyData = await HierarchyEntries.find({
            $or: [{ tse: code }, { mdd: code }, { asm: code }, { szd: code }]
        });

        if (!hierarchyData || hierarchyData.length === 0) {
            return res.status(404).json({ message: "No dealers found under this employee." });
        }

        // Extract dealer codes
        const dealerCodes = hierarchyData.map(entry => entry.dealer);
        const dealers = await User.find(
            { code: { $in: dealerCodes } },
            { code: 1, name: 1, longitude: 1, latitude: 1, _id: 0 }
        );

        if (!dealers || dealers.length === 0) {
            return res.status(404).json({ message: "No dealers with location data found." });
        }

        // Convert latitude and longitude to numbers
        const userLat = parseFloat(latitude);
        const userLon = parseFloat(longitude);

        // Find nearest dealer
        let nearestDealer = null;
        let minDistance = Infinity;

        dealers.forEach(dealer => {
            if (dealer.latitude && dealer.longitude) {
                const distance = getDistance(userLat, userLon, parseFloat(dealer.latitude), parseFloat(dealer.longitude));
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestDealer = dealer;
                }
            }
        });

        if (!nearestDealer) {
            return res.status(404).json({ message: "No nearby dealer found." });
        }

        // Define max distance allowed for punch-out (100 meters)
        const MAX_DISTANCE = 100;
        if (minDistance > MAX_DISTANCE) {
            return res.status(400).json({
                message: "You are too far from the nearest dealer to punch out.",
                nearestDealer,
                distance: minDistance
            });
        }

        // Ensure punch-out image is provided
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Punch out image is required.",
            });
        }

        // Upload punch-out image to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: 'gpunchOutImage',
            resource_type: 'image',
        });

        const punchOutImage = result.secure_url; // ✅ Get punch-out image URL

        // Calculate hours worked
        // const hoursWorked = moment(punchOutTime).diff(moment(attendance.punchIn), 'hours', true);
        // const hoursWorked = moment(punchOutTime).diff(moment(attendance.punchIn, moment.ISO_8601), 'hours', true);


        // Update punch-out record
        attendance.punchOut = punchOutTime;
        attendance.punchOutImage = punchOutImage; // ✅ Store punch-out image in DB
        attendance.status = "Present";
        attendance.latitude = latitude;
        attendance.longitude = longitude;
        // attendance.hoursWorked = hoursWorked;
        attendance.dealerCode = nearestDealer.code;

        await attendance.save();

        res.status(200).json({
            message: "Punch-out recorded successfully",
            attendance
        });
    } catch (error) {
        res.status(500).json({ message: "Error recording punch-out", error: error.message });
        console.log("error" ,error)
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
