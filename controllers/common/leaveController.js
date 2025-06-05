const Leave = require("../../model/Leave");
const Notification = require("../../model/Notification");


exports.requestLeave = async (req, res) => {
  try {
    const { code } = req.user; // extracted from token
    const {
      leaveType,
      fromDate,
      toDate,
      reason,
      attachmentUrl,
      isHalfDay 
    } = req.body;

    // Basic validation
    if (!leaveType || !fromDate || !toDate || !reason) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const from = new Date(fromDate);
    const to = new Date(toDate);

    if (from > to) {
      return res.status(400).json({ success: false, message: "fromDate must be before toDate" });
    }

    // Calculate total leave days (can be refined later)
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
      attachmentUrl
    });

    const savedLeave = await newLeave.save();

    const notification = {
     title: "Leave Request",
     message: `Employee ${code} requested leave from ${fromDate} to ${toDate}`,
     // filters: [name, fromDate, toDate],
     targetRole: ["admin", "super_admin"],
   };
   await Notification.create(notification);
    res.status(200).json({
      success: true,
      message: "Leave requested successfully",
      leave: savedLeave
    });
  } catch (error) {
    console.error("Error requesting leave:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

