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
    const { latitude, longitude } = req.body;
    const { code } = req.user; // Extract user code from token

    if (!code) {
      return res
        .status(400)
        .json({ message: "User code is missing in token." });
    }

 

    // Validate lat-long
    if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
      return res
        .status(400)
        .json({ message: "Invalid latitude or longitude." });
    }

    // Get current date for attendance tracking
    const formattedDate = moment().startOf("day").toDate();
    const punchInTime = moment().toDate();

    // Check if user already punched in today
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

    // Fetch hierarchy entries for the user
    const userHierarchies = await HierarchyEntries.find({
      $or: [{ tse: code }, { asm: code }, { dealers: code }],
    });

    if (!userHierarchies || userHierarchies.length === 0) {
      return res
        .status(404)
        .json({ message: "No hierarchy data found for this user." });
    }



    // Extract all related employee codes from hierarchy
    let allCodes = [];

    userHierarchies.forEach((hierarchy) => {
  

      // Extract values from hierarchy
      const fields = ["smd", "asm", "mdd", "tse", "dealer"]; // Ensure all roles are considered

      fields.forEach((key) => {
        if (hierarchy[key]) {
          // Ensure the field exists
          allCodes.push(hierarchy[key]); // Push value (string) directly
        }
      });
    });

    // Remove duplicates
    allCodes = [...new Set(allCodes)];



    if (allCodes.length === 0) {
      return res
        .status(404)
        .json({ message: "No related employees found in the hierarchy." });
    }

    // Find all users related to extracted codes
    const relatedUsers = await User.find(
      { code: { $in: allCodes } },
      { code: 1, name: 1, longitude: 1, latitude: 1, _id: 0 }
    );

    if (!relatedUsers.length) {
      return res
        .status(404)
        .json({ message: "No related users with location data found." });
    }



    // Convert user coordinates
    const userLat = parseFloat(latitude);
    const userLon = parseFloat(longitude);

    let nearestUser = null;
    let minDistance = Infinity;

    relatedUsers.forEach((relUser) => {
      const relLat = parseFloat(relUser.latitude);
      const relLon = parseFloat(relUser.longitude);

      if (isNaN(relLat) || isNaN(relLon) || (relLat === 0 && relLon === 0))
        return;

      const distance = getDistance(userLat, userLon, relLat, relLon);
      if (distance < minDistance) {
        minDistance = distance;
        nearestUser = relUser;
      }
    });


    if (!nearestUser || minDistance > 100) {
      return res.status(400).json({
        message:
          "You are too far from the nearest hierarchy location to punch in.",
        nearestUser,
        distance: minDistance,
      });
    }

    // Validate image for Cloudinary upload
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Punch in image is required.",
      });
    }

    // Upload image to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "gpunchInImage",
      resource_type: "image",
    });

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
    });

    await attendance.save();

    res
      .status(201)
      .json({ message: "Punch-in recorded successfully", attendance });
  } catch (error) {
    console.error("Error in punch-in:", error);
    res
      .status(500)
      .json({ message: "Error recording punch-in", error: error.message });
  }
};
// punch out
exports.punchOut = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const { code } = req.user;

    if (!code) {
      return res.status(400).json({ message: "User code is missing in token." });
    }

    // Define a proper date range for query
    const startOfDay = moment().startOf("day").toDate();
    const endOfDay = moment().endOf("day").toDate();
    const punchOutTime = moment(); // Ensure moment object

    // Fetch the attendance record within the correct date range
    const attendance = await Attendance.findOne({
      code,
    });


    if (!attendance) {
      return res.status(400).json({ message: "You have not punched in today." });
    }

    // if (!attendance.punchIn) {
    //   return res.status(400).json({ message: "You have not punched in today." });
    // }

    if (attendance.punchOut) {
      return res.status(400).json({ message: "You have already punched out for today." });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "Punch out image is required." });
    }

    // Upload the punch-out image to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "gpunchOutImage",
      resource_type: "image",
    });

    const punchOutImage = result.secure_url;
    const punchInTime = moment(attendance.punchIn); // Ensure moment object
    const hoursWorked = moment.duration(punchOutTime.diff(punchInTime)).asHours();
    

    // Determine attendance status based on hours worked
    let status = "Absent";
    if (hoursWorked >= 8) status = "Present";
    else if (hoursWorked >= 4) status = "Half Day";
    else if (hoursWorked > 0) status = "Absent";

    // Update the attendance record
    const updatedAttendance = await Attendance.findOneAndUpdate(
      { code }, // Update based on fetched attendance ID
      {
        punchOut: punchOutTime.toDate(),
        punchOutImage: punchOutImage,
        hoursWorked: parseFloat(hoursWorked.toFixed(2)), // Store as a number
        status: status,
        latitude,
        longitude,
      },
      { new: true } // Return the updated document
    );


    res.status(201).json({
      message: "Punch-out recorded successfully",
      attendance: updatedAttendance,
    });
  } catch (error) {
    console.error("Error in punch-out:", error);
    res.status(500).json({ message: "Error recording punch-out", error: error.message });
  }
};

// get attendance 
exports.getAttendance = async (req, res) => {
  try {
    let { startDate, endDate, page, limit } = req.query;

    // Set default values for pagination
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    const skip = (page - 1) * limit;

    // Construct the query
    let query = {};

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = moment(startDate).startOf("day").toDate();
      if (endDate) query.date.$lte = moment(endDate).endOf("day").toDate();
    }

    // Fetch all attendance records with pagination
    const attendanceRecords = await Attendance.find(query)
      .sort({ date: -1 }) // Sort by latest attendance first
      .skip(skip)
      .limit(limit);

    if (!attendanceRecords.length) {
      return res.status(404).json({ message: "No attendance records found." });
    }

    // Get total records for pagination
    const totalRecords = await Attendance.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / limit);

    res.status(200).json({
      message: "All attendance records fetched successfully",
      totalRecords,
      totalPages,
      currentPage: page,
      attendance: attendanceRecords,
    });
  } catch (error) {
    console.error("Error fetching attendance:", error);
    res.status(500).json({ message: "Error fetching attendance", error: error.message });
  }
};

// get attendance by employee code
exports.getAttendanceByEmployee = async (req, res) => {
  try {
    const { code } = req.user; 

    if (!code) {
      return res.status(400).json({ message: "User code is missing in token." });
    }

    let { startDate, endDate, page, limit } = req.query;

    // Set default values for pagination
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    const skip = (page - 1) * limit;

    // Construct the query
    let query = { code };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = moment(startDate).startOf("day").toDate();
      if (endDate) query.date.$lte = moment(endDate).endOf("day").toDate();
    }

    // Fetch attendance records with pagination
    const attendanceRecords = await Attendance.find(query)
      .sort({ date: -1 }) // Sort by latest attendance first
      .skip(skip)
      .limit(limit);

    if (!attendanceRecords.length) {
      return res.status(404).json({ message: "No attendance records found." });
    }

    // Get total records for pagination
    const totalRecords = await Attendance.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / limit);

    res.status(200).json({
      message: "Attendance records fetched successfully",
      totalRecords,
      totalPages,
      currentPage: page,
      attendance: attendanceRecords,
    });
  } catch (error) {
    console.error("Error fetching attendance:", error);
    res.status(500).json({ message: "Error fetching attendance", error: error.message });
  }
};

// request leave by employee code 
exports.requestLeave = async (req, res) => {
  try {
    const { code } = req.user;

    // Get leave details from request body
    const { date, leaveType, leaveDescription } = req.body;

    // Validate required fields
    if (!date || !leaveType || !leaveDescription) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Create a new attendance record for the leave request
    const leaveRequest = new Attendance({
      code,
      date,  // Using date as the leave date
      status: "Pending", // Leave is pending approval
      leaveType,
      leaveDescription,
    });

    // Save to database
    await leaveRequest.save();

    return res.status(201).json({
      message: "Leave request submitted successfully",
      leaveRequest,
    });
  } catch (error) {
    console.error("Error requesting leave:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// // get leave request by employee code
// exports.getEmpLeave = async (req, res) => {
//   try {
//     // Extract code from token (set during authentication)
//     const { code } = req.user;

//     if (!code) {
//       return res.status(400).json({ message: "Code is required" });
//     }

//     // Fetch leave records for the specific employee
//     const leaves = await Attendance.find({
//       code: code,
//       leaveType: { $exists: true }, // Ensuring only leave records are fetched
//     });

//     if (!leaves.length) {
//       return res.status(404).json({ message: "No leave records found for this employee" });
//     }

//     return res.status(200).json({
//       message: "Leave records fetched successfully",
//       leaves,
//     });
//   } catch (error) {
//     console.error("Error fetching employee leave records:", error);
//     return res.status(500).json({ message: "Internal Server Error" });
//   }
// };

// // get all leave 
// exports.getAllEmpLeaves = async (req, res) => {
//   try {
//     // Fetch all leave records where leaveType is present
//     const leaves = await Attendance.find({ leaveType: { $exists: true } });

//     if (!leaves.length) {
//       return res.status(404).json({ message: "No leave records found" });
//     }

//     return res.status(200).json({
//       message: "Leave records fetched successfully",
//       leaves,
//     });
//   } catch (error) {
//     console.error("Error fetching leave records:", error);
//     return res.status(500).json({ message: "Internal Server Error" });
//   }
// };

