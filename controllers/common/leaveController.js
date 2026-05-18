const Leave = require("../../model/Leave");
const Notification = require("../../model/Notification");
const moment = require('moment-timezone');
const User = require("../../model/User"); // Assuming you have an Employee model
const Attendance = require("../../model/Attendance"); // Assuming you have an Attendance model
const MetaData = require("../../model/MetaData");
const { formatDate } = require("../../helpers/attendanceHelper");

const DAY_MS = 1000 * 60 * 60 * 24;
const QUOTA_LEAVE_TYPES = new Set(["casual", "sick", "earned"]);

const atMidnight = (dateInput) => {
  const d = new Date(dateInput);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getMonthRange = (year, monthIndex) => {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const getMonthKeysBetween = (fromDate, toDate) => {
  const keys = [];
  const cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
  const last = new Date(toDate.getFullYear(), toDate.getMonth(), 1);

  while (cursor <= last) {
    keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return keys;
};

const getOverlappedDays = (fromDate, toDate, rangeStart, rangeEnd, isHalfDay = false) => {
  const overlapStart = atMidnight(new Date(Math.max(new Date(fromDate), new Date(rangeStart))));
  const overlapEnd = atMidnight(new Date(Math.min(new Date(toDate), new Date(rangeEnd))));

  if (overlapStart > overlapEnd) return 0;
  if (isHalfDay) return 0.5;

  return Math.floor((overlapEnd - overlapStart) / DAY_MS) + 1;
};

exports.requestLeave = async (req, res) => {
 try {
   const { code } = req.user;
   const {
     leaveType,
     fromDate,
     toDate,
     reason,
     attachmentUrl,
     isHalfDay = false,
     halfDaySession,
   } = req.body;

   // Basic validation
   if (!leaveType || !fromDate || !toDate || !reason) {
     return res.status(400).json({
       success: false,
       message: "All fields are required",
     });
   }

   // Convert dates to IST midnight (5:30 AM UTC)
   const from = new Date(new Date(fromDate).setHours(5, 30, 0, 0));
   const to = new Date(new Date(toDate).setHours(5, 30, 0, 0));

   if (from > to) {
     return res.status(400).json({
       success: false,
       message: "From Date must be before To Date",
     });
   }

   const nowIST = moment().tz("Asia/Kolkata");
   const leaveStartDay = moment(from).tz("Asia/Kolkata");
   const isLeaveForToday = nowIST.format('YYYY-MM-DD') === leaveStartDay.format('YYYY-MM-DD');

   // ❌ Restrict full-day leave for today after 3 PM
   if (!isHalfDay && isLeaveForToday && nowIST.hour() >= 15) {
     return res.status(400).json({
       success: false,
       message:
         "You cannot request a full-day leave for today after 3:00 PM. You can apply for a half-day leave instead.",
     });
   }

   // ✅ Check attendance for today if applying leave for today
   if (isLeaveForToday) {
     const startOfToday = nowIST.clone().startOf('day').toDate();
     const endOfToday = nowIST.clone().endOf('day').toDate();

     const attendanceRecord = await Attendance.findOne({
       code,
       date: { $gte: startOfToday, $lte: endOfToday },
       status: "Present", // modify if you use a different present status
     });

     if (attendanceRecord) {
      return res.status(400).json({
        success: false,
        message: "You have already marked attendance today. Leave request is not allowed.",
      });
    }
    
   }

   // ✅ Half-day logic
   if (isHalfDay) {
     if (from.toDateString() !== to.toDateString()) {
       return res.status(400).json({
         success: false,
         message: "Half-day leave must have the same From and To date",
       });
     }

     if (!['morning', 'afternoon'].includes(halfDaySession)) {
       return res.status(400).json({
         success: false,
         message: "halfDaySession must be 'morning' or 'afternoon' for half-day leave",
       });
     }

     // ⏰ Validate timing for today's half-day
     const currentHour = nowIST.hour();
     if (isLeaveForToday) {
       if (
         (halfDaySession === 'morning' && currentHour >= 12) ||
         (halfDaySession === 'afternoon' && currentHour >= 17)
       ) {
         return res.status(400).json({
           success: false,
           message: `You cannot apply for ${halfDaySession} session after ${
             halfDaySession === 'morning' ? '12:00 PM' : '5:00 PM'
           }.`,
         });
       }
     }
   }

   // 🔁 Check for overlapping leave
   const existingLeave = await Leave.findOne({
     code,
     $or: [
       {
         fromDate: { $lte: to },
         toDate: { $gte: from },
       },
     ],
     status: { $in: ["approved", "pending"] },
   });

   if (existingLeave) {
     return res.status(409).json({
       success: false,
       message: `Leave already requested between ${existingLeave.fromDate.toDateString()} and ${existingLeave.toDate.toDateString()}`,
     });
   }

   // 🧮 Calculate total leave days
   const totalDays = isHalfDay ? 0.5 : Math.floor((atMidnight(to) - atMidnight(from)) / DAY_MS) + 1;

   // ✅ Firm/user leave quota with default fallback
   // If metadata leaves are missing, default to 1 leave/month as requested.
   if (QUOTA_LEAVE_TYPES.has(String(leaveType).toLowerCase())) {
     const userMeta = await MetaData.findOne({ code }).lean();
     const allowedLeaves = Number.isFinite(Number(userMeta?.allowed_leaves))
       ? Number(userMeta.allowed_leaves)
       : 1;

     const monthKeys = getMonthKeysBetween(from, to);
     const existingQuotaLeaves = await Leave.find({
       code,
       leaveType: { $in: Array.from(QUOTA_LEAVE_TYPES) },
       status: { $in: ["approved", "pending"] },
       fromDate: { $lte: to },
       toDate: { $gte: from },
     }).lean();

     for (const key of monthKeys) {
       const [year, month] = key.split("-").map(Number);
       const { start, end } = getMonthRange(year, month - 1);

       const alreadyUsed = existingQuotaLeaves.reduce(
         (sum, leave) =>
           sum + getOverlappedDays(leave.fromDate, leave.toDate, start, end, leave.isHalfDay),
         0
       );

       const requestedInMonth = getOverlappedDays(from, to, start, end, isHalfDay);
       const projected = alreadyUsed + requestedInMonth;

       if (requestedInMonth > 0 && projected > allowedLeaves) {
         return res.status(400).json({
           success: false,
           message: `Leave limit exceeded for ${key}. Allowed: ${allowedLeaves}, Requested total: ${projected}`,
         });
       }
     }
   }

   // 📌 Save leave
   const newLeave = new Leave({
     code,
     leaveType,
     fromDate: from,
     toDate: to,
     reason,
     totalDays,
     isHalfDay,
     halfDaySession: isHalfDay ? halfDaySession : undefined,
     status: "pending",
     attachmentUrl,
     appliedAt: nowIST.toDate(),
   });

   const savedLeave = await newLeave.save();

   // 🔔 Optional notification
   await Notification.create({
     title: "Leave Request",
     message: `Employee ${code} requested ${isHalfDay ? 'half-day' : 'leave'} from ${formatDate(from)} to ${formatDate(to)}`,
     filters: [
        code,
        fromDate ? new Date(fromDate).toISOString().split("T")[0] : "",
        toDate ? new Date(toDate).toISOString().split("T")[0] : "",
      ],
     targetRole: ["admin", "super_admin"],
   });

   return res.status(200).json({
     success: true,
     message: "Leave requested successfully",
     leave: savedLeave,
   });
 } catch (error) {
   console.error("Error requesting leave:", error);
   return res.status(500).json({
     success: false,
     message: "Internal Server Error",
   });
 }
};


exports.getRequestLeaveForEmp = async (req, res) => {
  try {
    const { code } = req.user;
    const { fromDate, toDate, status, type } = req.query;

    if (!code) {
      return res.status(400).json({ message: "Employee code is required" });
    }

    const filter = { code };

    // Date range filter
    if (fromDate && toDate) {
      filter.appliedAt = {
        $gte: new Date(fromDate),
        $lte: new Date(toDate),
      };
    }

    // Status filter
    if (status) {
      filter.status = status;
    }
    if (type) {
      filter.leaveType = type;
    }

    const leaves = await Leave.find(filter).sort({ appliedAt: -1 });

    return res.status(200).json({ success: true, leaves });
  } catch (error) {
    console.error("Error getting employee leave requests:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

//get Leave application to superAdmin, admin
exports.getLeaveApplications = async (req, res) => {
  try {
    const { role } = req.user; // Get user role from token
    let {
      search,
      status,
      fromDate,
      toDate,
      type,
      position,
      firmCode,
      firmCodes,
      page = 1,
      limit = 50,
    } = req.query;

    // Convert page and limit to numbers
    page = parseInt(page);
    limit = parseInt(limit);
    const skip = (page - 1) * limit;

    // Build query based on filters
    const query = {};
    const userQuery = {};
    const regex = search ? new RegExp(search, "i") : null;
    const requestedFirmCodes = []
      .concat(firmCode || [])
      .concat(firmCodes || [])
      .join(",")
      .split(",")
      .map((code) => code.trim())
      .filter(Boolean);

    if (role === "hr") {
      userQuery.role = "employee";
    }

    if (position) {
      userQuery.position = new RegExp(`^${position}$`, "i");
    }

    if (regex) {
      userQuery.$or = [
        { name: regex },
        { code: regex },
        { position: regex },
      ];
    }

    const matchedUsers = await User.find(userQuery, "code name role position").lean();
    const userCodeSet = new Set(matchedUsers.map((u) => u.code));

    let allowedCodes = [...userCodeSet];
    if (requestedFirmCodes.length > 0) {
      const metadataList = await MetaData.find(
        { code: { $in: allowedCodes }, firm_code: { $in: requestedFirmCodes } },
        "code"
      ).lean();
      allowedCodes = metadataList.map((m) => m.code);
    }

    query.code = { $in: allowedCodes.length > 0 ? allowedCodes : ["__NO_MATCH__"] };

    // Add other filters
    if (status) {
      query.status = status;
    }
    if (type) {
      query.leaveType = type;
    }
    if (fromDate && toDate) {
      const startDate = new Date(fromDate);
      const endDate = new Date(toDate);
      // Ensure endDate includes the full day
      endDate.setHours(23, 59, 59, 999);

      // Query for leave applications that overlap with the date range
      query.$or = [
        {
          fromDate: { $gte: startDate, $lte: endDate },
        },
        {
          toDate: { $gte: startDate, $lte: endDate },
        },
        {
          $and: [
            { fromDate: { $lte: startDate } },
            { toDate: { $gte: endDate } },
          ],
        },
      ];
    }

    // Get total count for pagination
    const totalCount = await Leave.countDocuments(query);

    // Get paginated leaves
    const leaves = await Leave.find(query)
      .populate("approvalHistory.approverId", "name role")
      .sort({ appliedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const leaveCodes = [...new Set(leaves.map((l) => l.code))];
    const [employeeDetails, metaDetails] = await Promise.all([
      User.find({ code: { $in: leaveCodes } }, "code name role position").lean(),
      MetaData.find({ code: { $in: leaveCodes } }, "code firm_code").lean(),
    ]);

    const employeeMap = new Map(employeeDetails.map((e) => [e.code, e]));
    const metaMap = new Map(metaDetails.map((m) => [m.code, m]));

    const formattedLeaves = leaves.map((leave) => {
      const employee = employeeMap.get(leave.code);
      const meta = metaMap.get(leave.code);
      return {
        ...leave,
        employeeName: employee?.name || "Unknown",
        employeeCode: leave.code,
        employeeRole: employee?.role || "Unknown",
        employeePosition: employee?.position || "Unknown",
        firmCode: meta?.firm_code || "",
      };
    });

    res.status(200).json({
      success: true,
      message: "Leave applications retrieved successfully",
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
      totalRecords: totalCount,
      leaves: formattedLeaves,
    });
  } catch (error) {
    console.error("Error retrieving leave applications:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.getMyLeavePolicy = async (req, res) => {
  try {
    const { code } = req.user;
    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Employee code is required",
      });
    }

    const now = moment().tz("Asia/Kolkata");
    const monthStart = now.clone().startOf("month").toDate();
    const monthEnd = now.clone().endOf("month").toDate();

    const userMeta = await MetaData.findOne({ code }, "allowed_leaves").lean();
    const allowedLeaves = Number.isFinite(Number(userMeta?.allowed_leaves))
      ? Number(userMeta.allowed_leaves)
      : 1;

    const quotaLeaves = await Leave.find({
      code,
      leaveType: { $in: Array.from(QUOTA_LEAVE_TYPES) },
      status: { $in: ["approved", "pending"] },
      fromDate: { $lte: monthEnd },
      toDate: { $gte: monthStart },
    }).lean();

    const usedLeaves = quotaLeaves.reduce(
      (sum, leave) =>
        sum + getOverlappedDays(leave.fromDate, leave.toDate, monthStart, monthEnd, leave.isHalfDay),
      0
    );

    return res.status(200).json({
      success: true,
      data: {
        code,
        allowedLeaves,
        usedLeaves,
        remainingLeaves: Math.max(0, allowedLeaves - usedLeaves),
        month: now.format("YYYY-MM"),
      },
    });
  } catch (error) {
    console.error("Error fetching leave policy:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

//edit leave application by superAdmin, admin
exports.editLeaveApplication = async (req, res) => {
  try {
    const userId = req.user.id; // Assuming user ID is in the token

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
        status: "error",
      });
    }

    const { status, leaveId, comment } = req.body;

    if (!status || !leaveId) {
      return res.status(400).json({
        success: false,
        message: "Status and leaveId are required",
        status: "error",
      });
    }

    if (status === "pending") {
      return res.status(400).json({
        success: false,
        message: "Cannot set status to pending",
        status: "warning",
      });
    }

    const leave = await Leave.findById({ _id: leaveId });

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Leave application not found",
        status: "error",
      });
    }

    leave.status = status;
    leave.approvalHistory.push({
      approverId: userId,
      action: status,
      date: new Date(),
      comment: comment || "",
    });

    leave.updatedAt = new Date();
    const updatedLeave = await leave.save();

    // Save attendance entries if approved
    if (status === "approved") {
      const currentDate = new Date(leave.fromDate);
      const endDate = new Date(leave.toDate);

      while (currentDate <= endDate) {
        await Attendance.create({
          code: leave.code,
          status: "Leave",
          date: new Date(currentDate),
        });

        currentDate.setDate(currentDate.getDate() + 1); // Next day
      }
    }
    if (status === "rejected") {
      // If rejected, remove any existing attendance entries for the leave period
      const currentDate = new Date(leave.fromDate);
      const endDate = new Date(leave.toDate);

      while (currentDate <= endDate) {
        await Attendance.deleteMany({
          code: leave.code,
          date: {
            $gte: currentDate,
            $lt: new Date(currentDate).setDate(currentDate.getDate() + 1),
          },
        });

        currentDate.setDate(currentDate.getDate() + 1); // Next day
      }
    }

    // const notification = {
    //   title: "Leave Application Update",
    //   message: `Your leave application has been ${status}`,
    //   targetCodes: [leave.code],
    //   targetRole: ["employee"],
    //   filters: { code: leave.code }
    // };

    // await Notification.create(notification);

    return res.status(200).json({
      success: true,
      message: "Leave application updated successfully",
      status: "success",
      leave: updatedLeave,
    });
  } catch (error) {
    console.error("Error updating leave application:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      status: "error",
    });
  }
};
