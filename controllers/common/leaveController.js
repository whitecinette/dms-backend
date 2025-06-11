const Leave = require("../../model/Leave");
const Notification = require("../../model/Notification");
const User = require("../../model/User"); // Assuming you have an Employee model
const Attendance = require("../../model/Attendance"); // Assuming you have an Attendance model

const formatDate = (dateInput) => {
  // Get only the date part to avoid time zone shift
  const datePart = dateInput?.slice(0, 10); // "YYYY-MM-DD"
  if (!datePart) return "N/A";

  const [year, month, day] = datePart.split("-");
  const dateObj = new Date(year, month - 1, day); // month is 0-indexed

  const formattedDate = dateObj.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return formattedDate || "N/A";
};

exports.requestLeave = async (req, res) => {
  try {
    const { code } = req.user; // extracted from token
    const { leaveType, fromDate, toDate, reason, attachmentUrl, isHalfDay } =
      req.body;

    // Basic validation
    if (!leaveType || !fromDate || !toDate || !reason) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    const from = new Date(fromDate);
    const to = new Date(toDate);

    if (from > to) {
      return res
        .status(400)
        .json({ success: false, message: "From Date must be before To Date" });
    }

    // Check for overlapping leave for the same user
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

    // Calculate total leave days
    const oneDay = 1000 * 60 * 60 * 24;
    const totalDays = Math.ceil((to - from) / oneDay) + 1;

    const newLeave = new Leave({
      code,
      leaveType,
      fromDate: from,
      toDate: to,
      reason,
      totalDays,
      status: "pending",
      attachmentUrl,
    });

    const savedLeave = await newLeave.save();

    const startDate = fromDate;
    const endDate = toDate;

    const notification = {
      title: "Leave Request",
      message: `Employee ${code} requested leave from ${formatDate(
        startDate
      )} to ${formatDate(endDate)}`,
      filters: [code, startDate, endDate],
      targetRole: ["admin", "super_admin"],
    };
    await Notification.create(notification);

    res.status(200).json({
      success: true,
      message: "Leave requested successfully",
      leave: savedLeave,
    });
  } catch (error) {
    console.error("Error requesting leave:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.getRequestLeaveForEmp = async (req, res) => {
  try {
    const { code } = req.user;
    const { fromDate, toDate, status } = req.query;

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
      page = 1,
      limit = 10,
    } = req.query;

    // Convert page and limit to numbers
    page = parseInt(page);
    limit = parseInt(limit);
    const skip = (page - 1) * limit;

    // Build query based on filters
    const query = {};

    // Add role-based filtering
    if (role === "hr") {
      // HR can only see employee leave applications
      const employees = await User.find({ role: "employee" }, "code").lean();
      const employeeCodes = employees.map((emp) => emp.code);
      query.code = { $in: employeeCodes };
    }

    // Add other filters
    if (status) {
      query.status = status;
    }
    if (type) {
      query.leaveType = type;
    }
    if (fromDate && toDate) {
      query.fromDate = { $gte: new Date(fromDate), $lte: new Date(toDate) };
      query.toDate = { $gte: new Date(fromDate), $lte: new Date(toDate) };
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

    // Format leaves with employee details
    let formattedLeaves = await Promise.all(
      leaves.map(async (leave) => {
        const employee = await User.findOne(
          { code: leave.code },
          "name role"
        ).lean();
        return {
          ...leave,
          employeeName: employee ? employee.name : "Unknown",
          employeeCode: leave.code,
          employeeRole: employee ? employee.role : "Unknown",
        };
      })
    );

    // Apply search filter after pagination if search term exists
    if (search) {
      formattedLeaves = formattedLeaves.filter(
        (leave) =>
          leave.employeeName.toLowerCase().includes(search.toLowerCase()) ||
          leave.employeeCode.toLowerCase().includes(search.toLowerCase())
      );
    }

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
