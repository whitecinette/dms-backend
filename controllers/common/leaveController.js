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
     return res.status(400).json({ success: false, message: "From Date must be before To Date" });
   }

   // Check for overlapping leave for the same user
   const existingLeave = await Leave.findOne({
     code,
     $or: [
       {
         fromDate: { $lte: to },
         toDate: { $gte: from }
       }
     ]
   });

   if (existingLeave) {
     return res.status(409).json({
       success: false,
       message: `Leave already requested between ${existingLeave.fromDate.toDateString()} and ${existingLeave.toDate.toDateString()}`
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
     attachmentUrl
   });

   const savedLeave = await newLeave.save();

   const notification = {
     title: "Leave Request",
     message: `Employee ${code} requested leave from ${fromDate} to ${toDate}`,
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
   return res.status(500).json({ success: false, message: "Internal Server Error" });
 }
};
