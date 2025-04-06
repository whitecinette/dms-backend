const Attendance = require("../../model/Attendance");
const ActorCode = require("../../model/ActorCode");
const moment = require("moment");
const HierarchyEntries = require("../../model/HierarchyEntries");
const User = require("../../model/User");
const getDistance = require("../../helpers/attendanceHelper");
const { Parser } = require("json2csv");
const fs = require("fs");

const cloudinary = require("../../config/cloudinary");
const ActorTypesHierarchy = require("../../model/ActorTypesHierarchy");
// punch in

exports.punchIn = async (req, res) => {
  try {
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
      return res.status(200).json({
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
     return res.status(200).json({
       warning: true,
       message: `You are too far  — approx ${minDistance.toFixed(
         2
       )} meters away. Please move closer to a hierarchy member and try again.`,
     });
   }
   

    if (!req.file) {
      return res.status(200).json({
        warning: true,
        message: "Please capture an image.",
      });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "gpunchInImage",
      resource_type: "image",
    });

    // Delete local file after successful upload
    fs.unlink(req.file.path, (err) => {
      if (err) {
        console.error("Failed to delete temp file:", err);
      } else {
        console.log("Temp file deleted:", req.file.path);
      }
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
        .status(200)
        .json({ 
         warning: true,
         message: "You have not punched in yet for today." });
    }

    if (attendance.punchOut) {
      return res
        .status(200)
        .json({
         warning: true,
          message: "You have already punched out today." });
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
     return res.status(200).json({
       warning: true,
       message: `You are too far  — approx ${minDistance.toFixed(
         2
       )} meters away. Please move closer to a hierarchy member and try again.`,
     });
   }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please capture an image.",
      });
    }

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "gpunchOutImage",
      resource_type: "image",
    });

    // ✅ Delete temp file after upload
    fs.unlink(req.file.path, (err) => {
      if (err) {
        console.error("Failed to delete temp file:", err);
      } else {
        console.log("Temp file deleted:", req.file.path);
      }
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
exports.getAttendanceForEmployee = async (req, res) => {
  const employeeCode = req.user.code;

  try {
    const attendanceData = await Attendance.find({ code: employeeCode }).sort({
      date: -1,
    });

    if (!attendanceData || attendanceData.length === 0) {
      return res
        .status(404)
        .json({ message: "No attendance records found for this employee." });
    }

    res.status(200).json({
      success: true,
      data: attendanceData,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Error fetching attendance records.",
    });
  }
};
exports.getAttendanceByEmployeeForAdmin = async (req, res) => {
  try {
    const { code } = req.params;
    const { date } = req.query;

    if (!code) {
      return res.status(400).json({ message: "User code is missing." });
    }

    // Fetch the employee's name using the code
    const employee = await ActorCode.findOne({ code });
    if (!employee) {
      return res.status(404).json({ message: "Employee not found." });
    }

    // Create query filter
    const query = { code };
    if (date) {
      query.date = new Date(date); // Convert string to Date object for filtering
    }

    // Fetch attendance records with optional date filter, sorted by latest date
    const attendanceRecords = await Attendance.find(query)
      .sort({ date: -1 }) // ✅ Sort by latest date first
      .lean(); // Convert to plain JavaScript objects

    if (!attendanceRecords.length) {
      return res.status(404).json({ message: "No attendance records found." });
    }

    // Count attendance statuses
    const attendanceCount = {
      leave: attendanceRecords.filter(
        (record) => record.status === "Approved" || record.status === "Rejected"
      ).length,
      absent: attendanceRecords.filter((record) => record.status === "Absent")
        .length,
      present: attendanceRecords.filter((record) => record.status === "Present")
        .length,
      halfday: attendanceRecords.filter(
        (record) => record.status === "Half Day"
      ).length,
    };

    res.status(200).json({
      message: "Attendance records fetched successfully",
      employeeName: employee.name, // Include employee name
      attendance: attendanceRecords, // Sorted attendance records
      attendanceCount, // Include attendance counts
    });
  } catch (error) {
    console.error("Error fetching attendance:", error);
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
    const { firm = "" } = req.query;

    if (!date) {
      return res.status(400).json({ message: "Date is required." });
    }

    // Normalize the date
    const selectedDate = new Date(date);
    selectedDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(selectedDate);
    nextDay.setDate(selectedDate.getDate() + 1);

    // Step 1: Get Firm Positions
    let firmPositions = [];
    if (firm) {
      const firmData = await ActorTypesHierarchy.findById(firm);
      if (!firmData) {
        return res.status(400).json({ message: "Invalid firm ID." });
      }
      if (Array.isArray(firmData.hierarchy)) {
        firmPositions = firmData.hierarchy;
      }
    }

    // Step 2: Fetch Employees Based on Firm Filter (If Applied)
    let employeeFilter = { role: "employee" };
    if (firmPositions.length > 0) {
      employeeFilter.position = { $in: firmPositions };
    }
    const employees = await User.find(
      employeeFilter,
      "code name position"
    ).lean();

    // Step 3: Fetch Attendance Records (Include All)
    let attendanceRecords = await Attendance.find({
      date: { $gte: selectedDate, $lt: nextDay },
      code: { $in: employees.map((emp) => emp.code) }, // Ensure only firm employees are included
    }).lean();

    // Step 4: Convert attendance codes to a Set
    const presentCodes = new Set(
      attendanceRecords.map((record) => record.code.trim().toLowerCase())
    );

    // Step 5: Identify Absent Employees from the Firm
    const absentEmployees = employees.filter(
      (emp) => !presentCodes.has(emp.code.trim().toLowerCase())
    );

    absentEmployees.forEach((emp) => {
      attendanceRecords.push({
        code: emp.code,
        name: emp.name,
        position: emp.position,
        status: "Absent",
        date: selectedDate,
      });
    });

    // Step 6: Initialize and Count Attendance Statuses
    let attendanceCount = {
      halfDay: 0,
      present: 0,
      leave: 0,
      absent: 0,
      pending: 0,
    };

    attendanceRecords.forEach(({ status }) => {
      if (status === "Half Day") attendanceCount.halfDay++;
      else if (status === "Present") attendanceCount.present++;
      else if (status === "Pending") attendanceCount.pending++;
      else if (status === "Absent") attendanceCount.absent++;
      else if (status === "Rejected" || status === "Approved") {
        attendanceCount.leave++;
      }
    });

    res.status(200).json({
      message: "Attendance counts fetched successfully",
      attendanceCount,
    });
  } catch (error) {
    console.error("Error fetching attendance:", error);
    res.status(500).json({
      message: "Error fetching attendance",
      error: error.message,
    });
  }
};

exports.getLatestAttendance = async (req, res) => {
  try {
    const {
      date,
      page = 1,
      limit = 10,
      search = "",
      status = "",
      firm = null,
    } = req.query;

    let firmPositions = [];
    if (firm) {
      const firmData = await ActorTypesHierarchy.findById(firm);
      if (!firmData) {
        return res.status(400).json({ message: "Invalid firm ID." });
      }

      if (firmData.hierarchy && Array.isArray(firmData.hierarchy)) {
        firmPositions = firmData.hierarchy;
      }
    }

    // ✅ Step 1: Fetch all employees first
    let employeeFilter = { role: "employee" };
    if (firmPositions.length) {
      employeeFilter.position = { $in: firmPositions };
    }

    const employees = await User.find(
      employeeFilter,
      "code name position"
    ).lean();

    // ❌ If no employees are found, return an empty response
    if (!employees.length) {
      return res.status(200).json({
        message: "No employees found",
        currentPage: Number(page),
        totalRecords: 0,
        totalPages: 0,
        data: [],
      });
    }

    // ✅ Step 2: Create employee map
    const employeeMap = employees.reduce((acc, emp) => {
      acc[emp.code.trim().toLowerCase()] = {
        name: emp.name,
        position: emp.position,
      };
      return acc;
    }, {});

    const employeeCodes = employees.map((emp) => emp.code);

    let attendanceRecords = [];
    if (date) {
      // ✅ Step 3: If date is given, fetch attendance only for employees in the firm
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      attendanceRecords = await Attendance.find({
        date: { $gte: startOfDay, $lte: endOfDay },
        code: { $in: employeeCodes },
      })
        .sort({ date: -1, punchIn: -1 })
        .lean();

      // ✅ Step 4: Add absent employees
      const presentCodes = new Set(
        attendanceRecords.map((record) => record.code.trim().toLowerCase())
      );

      employees.forEach((emp) => {
        const empCode = emp.code.trim().toLowerCase();
        if (!presentCodes.has(empCode)) {
          attendanceRecords.push({
            code: emp.code,
            name: emp.name,
            position: emp.position,
            status: "Absent",
            date: new Date(date),
          });
        }
      });
    } else {
      // ✅ If no date is provided, fetch attendance without a date filter
      attendanceRecords = await Attendance.find({
        code: { $in: employeeCodes },
      })
        .sort({ date: -1, punchIn: -1 })
        .lean();
    }

    // ✅ Step 5: Attach employee details
    attendanceRecords = attendanceRecords.map((record) => {
      const normalizedCode = record.code.trim().toLowerCase();
      const employee = employeeMap[normalizedCode];

      return {
        ...record,
        name: employee ? employee.name : "Unknown",
        position: employee ? employee.position : "Unknown",
      };
    });

    // ✅ Step 6: Apply filters (search & status)
    if (search) {
      const regex = new RegExp(search, "i");
      attendanceRecords = attendanceRecords.filter((rec) =>
        regex.test(rec.code)
      );
    }

    if (status) {
      attendanceRecords = attendanceRecords.filter(
        (rec) => rec.status === status
      );
    }

    // ✅ Step 7: Apply pagination
    const totalRecords = attendanceRecords.length;
    const totalPages = Math.ceil(totalRecords / limit);

    attendanceRecords = attendanceRecords.slice(
      (Number(page) - 1) * Number(limit),
      Number(page) * Number(limit)
    );

    res.status(200).json({
      message: "Latest attendance summary fetched successfully",
      currentPage: Number(page),
      totalRecords,
      totalPages,
      data: attendanceRecords,
    });
  } catch (error) {
    console.error("Error fetching attendance summary:", error);
    res.status(500).json({
      message: "Error fetching attendance summary",
      error: error.message,
    });
  }
};

exports.editAttendanceByID = async (req, res) => {
  try {
    const { id } = req.params;
    const update = req.body;
    const AttendanceEntity = await Attendance.findById(id);
    if (!AttendanceEntity) {
      return res.status(404).json("user not found");
    }
    const updateData = await Attendance.findByIdAndUpdate(id, update, {
      new: true,
    });
    return res.status(200).json({ message: "user updated successfully" });
  } catch (error) {
    console.log(error);
  }
};

exports.downloadAllAttendance = async (req, res) => {
  try {
    const { date, search = "", status = "", firm = null } = req.query;

    let firmPositions = [];
    if (firm) {
      const firmData = await ActorTypesHierarchy.findById(firm);
      if (!firmData) {
        return res.status(400).json({ message: "Invalid firm ID." });
      }

      if (firmData.hierarchy && Array.isArray(firmData.hierarchy)) {
        firmPositions = firmData.hierarchy;
      }
    }

    // Step 1: Fetch all employees first
    let employeeFilter = { role: "employee" };
    if (firmPositions.length) {
      employeeFilter.position = { $in: firmPositions };
    }

    const employees = await User.find(
      employeeFilter,
      "code name position"
    ).lean();

    // If no employees are found, return an empty response
    if (!employees.length) {
      return res.status(200).json({
        message: "No employees found",
        data: [],
      });
    }

    // Step 2: Create employee map
    const employeeMap = employees.reduce((acc, emp) => {
      acc[emp.code.trim().toLowerCase()] = {
        name: emp.name,
        position: emp.position,
      };
      return acc;
    }, {});

    const employeeCodes = employees.map((emp) => emp.code);

    let attendanceRecords = [];
    if (date) {
      // Step 3: If date is given, fetch attendance only for employees in the firm
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      attendanceRecords = await Attendance.find({
        date: { $gte: startOfDay, $lte: endOfDay },
        code: { $in: employeeCodes },
      })
        .sort({ date: -1, punchIn: -1 })
        .lean();

      // Step 4: Add absent employees
      const presentCodes = new Set(
        attendanceRecords.map((record) => record.code.trim().toLowerCase())
      );

      employees.forEach((emp) => {
        const empCode = emp.code.trim().toLowerCase();
        if (!presentCodes.has(empCode)) {
          attendanceRecords.push({
            code: emp.code,
            name: emp.name,
            position: emp.position,
            status: "Absent",
            date: new Date(date),
          });
        }
      });
    } else {
      // If no date is provided, fetch attendance without a date filter
      attendanceRecords = await Attendance.find({
        code: { $in: employeeCodes },
      })
        .sort({ date: -1, punchIn: -1 })
        .lean();
    }

    // Step 5: Attach employee details
    attendanceRecords = attendanceRecords.map((record) => {
      const normalizedCode = record.code.trim().toLowerCase();
      const employee = employeeMap[normalizedCode];

      return {
        ...record,
        name: employee ? employee.name : "Unknown",
        position: employee ? employee.position : "Unknown",
      };
    });

    // Step 6: Apply filters (search & status)
    if (search) {
      const regex = new RegExp(search, "i");
      attendanceRecords = attendanceRecords.filter((rec) =>
        regex.test(rec.code)
      );
    }

    if (status) {
      attendanceRecords = attendanceRecords.filter(
        (rec) => rec.status === status
      );
    }

    // Format data for CSV export
    const formattedAttendance = attendanceRecords.map((record) => ({
      name: record.name || "Unknown",
      code: record.code,
      position: record.position || "Unknown",
      date: record.punchIn
        ? new Date(record.punchIn).toISOString().split("T")[0]
        : record.date
        ? new Date(record.date).toISOString().split("T")[0]
        : "N/A",
      punchIn: record.punchIn
        ? new Date(record.punchIn).toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata",
          })
        : "N/A",
      punchOut: record.punchOut
        ? new Date(record.punchOut).toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata",
          })
        : "N/A",
      status: record.status,
      workingHours: record.hoursWorked || "0",
    }));

    const fields = [
      "name",
      "code",
      "position",
      "date",
      "punchIn",
      "punchOut",
      "status",
      "workingHours",
    ];
    const parser = new Parser({ fields });
    const csv = parser.parse(formattedAttendance);

    res.header("Content-Type", "text/csv");
    res.attachment("attendance_data.csv");
    return res.send(csv);
  } catch (error) {
    console.error("Error downloading attendance data:", error);
    res.status(500).json({
      message: "Error downloading attendance data",
      error: error.message,
    });
  }
};

exports.deleteAttendanceByID = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "Id is not given" });
    }

    const employee = await Attendance.findById(id);

    if (!employee) {
      return res
        .status(400)
        .json({ success: false, message: "Employee not found" });
    }

    await Attendance.findByIdAndDelete(id);

    return res
      .status(200)
      .json({ success: true, message: " successfully delete employee" });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
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
