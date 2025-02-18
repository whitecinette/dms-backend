const ActorCode = require("../../model/ActorCode");
const Payroll = require("../../model/Payroll");
const Attendance = require("../../model/Attendance")


exports.addSalary = async (req, res) => {
  try {
    const { actorCode, basicSalary, bonuses = 0, deductions = 0 } = req.body;

    // Validate inputs
    if (!actorCode || !basicSalary) {
      return res.status(400).json({ message: "Actor code and basic salary are required" });
    }

    // Find actor by code
    const actor = await ActorCode.findOne({ code: actorCode });
    if (!actor) {
      return res.status(404).json({ message: "Actor not found" });
    }

    // Calculate Tax (Example: 10% of Basic Salary)
    const taxAmount = basicSalary * 0.1;
    const netSalary = basicSalary + bonuses - deductions - taxAmount;

    // Create Payroll Record
    const payroll = new Payroll({
      actorId: actor._id,
      actorCode: actor.code,
      actorName: actor.name,
      position: actor.position,
      role: actor.role,
      basicSalary,
      bonuses,
      deductions,
      taxAmount,
      netSalary,
      paymentDate: new Date(),
    });

    await payroll.save();

    res.status(201).json({
      message: "Salary processed and saved successfully",
      data: payroll,
    });

  } catch (error) {
    console.error("Salary Processing Error:", error);
    res.status(500).json({
      message: "Error processing salary",
      error: error.message || error.toString(),
    });
  }
};


exports.getAllSalaries = async (req, res) => {
 try {
   const allSalaries = await Payroll.find().sort({ paymentDate: -1 }); // Latest first

   if (allSalaries.length === 0) {
     return res.status(404).json({ message: "No salary records found" });
   }

   res.status(200).json({
     message: "All employee salaries retrieved successfully",
     totalRecords: allSalaries.length,
     data: allSalaries,
   });
 } catch (error) {
   console.error("Error fetching salaries:", error);
   res.status(500).json({
     message: "Error fetching salaries",
     error: error.message || error.toString(),
   });
 }
};

exports.getPaySlipByEmp = async (req, res) => {
 try {
   const { id } = req.params;

   // Find Payroll record
   const payroll = await Payroll.findOne({ actorId: id }).sort({ paymentDate: -1 });
   if (!payroll) {
     return res.status(404).json({ message: "No payroll record found for this employee" });
   }

   // Find Employee Details
   const actor = await ActorCode.findById(id);
   if (!actor) {
     return res.status(404).json({ message: "Employee details not found" });
   }

   // Fetch attendance for the employee in the current month
   const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
   const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
   const attendance = await Attendance.find({
     employeeId: actor._id,
     date: { $gte: startOfMonth, $lte: endOfMonth },
   });

   // Calculate total days of leave, present, and half-days
   let leaveDays = 0;
   let presentDays = 0;
   let halfDays = 0;
   attendance.forEach((record) => {
     if (record.status === "Absent") {
       leaveDays++;
     } else if (record.status === "Present") {
       presentDays++;
     } else if (record.status === "Half-day") {
       halfDays++;
     }
   });

   // Calculate deductions based on leaves
   const dailySalary = payroll.basicSalary / 30;  // Assuming 30 days in a month for simplicity
   const leaveDeduction = leaveDays * dailySalary;
   const halfDayDeduction = halfDays * (dailySalary / 2); // Half day deduction

   // Calculate the final net salary after deductions
   const totalDeductions = leaveDeduction + halfDayDeduction;
   const netSalary = payroll.basicSalary + payroll.bonuses - payroll.deductions - payroll.taxAmount - totalDeductions;

   // Generate Payslip Object with deductions
   const paySlip = {
     employeeDetails: {
       name: actor.name,
       code: actor.code,
       position: actor.position,
       role: actor.role,
       status: actor.status,
     },
     salaryDetails: {
       basicSalary: payroll.basicSalary,
       bonuses: payroll.bonuses,
       deductions: payroll.deductions,
       taxAmount: payroll.taxAmount,
       leaveDays: leaveDays,
       halfDays: halfDays,
       leaveDeduction,
       halfDayDeduction,
       totalDeductions,
       netSalary,
       paymentDate: payroll.paymentDate,
     }
   };

   res.status(200).json({
     message: "Payslip retrieved successfully",
     paySlip,
   });
 } catch (error) {
   console.error("Error fetching payslip:", error);
   res.status(500).json({
     message: "Error fetching payslip",
     error: error.message || error.toString(),
   });
 }
};
