const ActorCode = require("../../model/ActorCode");
const Payroll = require("../../model/Payroll");
const Attendance = require("../../model/Attendance")


// Controller to Add Salary
exports.addSalary = async (req, res) => {
  const { code, salaryDetails, deductionPreferences } = req.body;

  // Validation
  if (!code || !salaryDetails || !salaryDetails.baseSalary) {
      return res.status(400).json({ message: 'Employee code and base salary are required.' });
  }

  try {
      // Check if payroll entry already exists for this employee
      const existingPayroll = await Payroll.findOne({ code });
      if (existingPayroll) {
          return res.status(400).json({ message: 'Payroll entry already exists for this employee.' });
      }

      // Handle Deduction Preferences from HR
      const defaultDeductions = [
          { 
              name: 'PF', 
              type: 'percentage', 
              value: deductionPreferences?.pfPercentage || 12, // PF dynamic percentage
              isActive: deductionPreferences?.pfDeduct || false 
          },
          { name: 'ESI', type: 'percentage', value: 1.75, isActive: deductionPreferences?.esiDeduct || false },
          { name: 'Professional Tax', type: 'fixed', value: 200, isActive: deductionPreferences?.ptDeduct || false }
      ];

      // Combine provided deductions with defaults
      salaryDetails.deductions = salaryDetails.deductions || [];
      salaryDetails.deductions = [...salaryDetails.deductions, ...defaultDeductions];

      // Remove overtime details since it's not required here
      delete salaryDetails.overtimeHours;
      delete salaryDetails.overtimeRate;

      // Create new Payroll entry
      const newPayroll = new Payroll({
          code,
          salaryDetails,
      });

      await newPayroll.save();
      res.status(201).json({ message: 'Salary added successfully', data: newPayroll });

  } catch (error) {
      console.error('Error adding salary:', error);
      res.status(500).json({ message: 'Internal server error' });
  }
};

exports.calculateSalary = async (req, res) => {
  const { code, month, year } = req.body;

  // Validation
  if (!code || !month || !year) {
      return res.status(400).json({ message: 'Employee code, month, and year are required.' });
  }

  try {
      // Fetch payroll details
      const payroll = await Payroll.findOne({ code });
      if (!payroll) {
          return res.status(404).json({ message: 'Payroll entry not found for this employee.' });
      }

      // Fetch attendance data for the specified month and year
      const attendanceRecords = await Attendance.find({
          code,
          date: {
              $gte: new Date(`${year}-${month}-01`),
              $lt: new Date(`${year}-${month}-31`)
          }
      });

      const daysInMonth = new Date(year, month, 0).getDate(); // Total days in the month
      const totalDays = attendanceRecords.filter(record => record.status !== 'Pending').length || daysInMonth;

      const absentDays = attendanceRecords.filter((record) => record.status === 'Absent').length;
      const halfDays = attendanceRecords.filter((record) => record.status === 'Half Day').length;
console.log("absent:", absentDays);
console.log("halfDays:",halfDays)
      // Calculate salary per day based on total month days
      const baseSalary = payroll.salaryDetails.baseSalary;
      const salaryPerDay = baseSalary / daysInMonth; 

      // Calculate deductions
      let totalDeductions = 0;
      payroll.salaryDetails.deductions.forEach(deduction => {
          if (deduction.isActive) {
              totalDeductions += deduction.type === 'percentage'
                  ? (baseSalary * deduction.value) / 100
                  : deduction.value;
          }
      });

      // Calculate attendance-based salary deductions
      const attendanceDeductions = (absentDays * salaryPerDay) + (halfDays * salaryPerDay * 0.5);

      // Calculate additions (e.g., incentives)
      const totalAdditions = payroll.salaryDetails.bonuses
          ? payroll.salaryDetails.bonuses.reduce((sum, bonus) => sum + bonus.amount, 0)
          : 0;

      // Final salary calculation
      const netSalary = Math.round(baseSalary + totalAdditions - totalDeductions - attendanceDeductions);

      res.status(200).json({
          message: 'Salary calculated successfully',
          data: {
              baseSalary,
              totalAdditions,
              totalDeductions,
              attendanceDeductions,
              netSalary
          }
      });
  } catch (error) {
      console.error('Error calculating salary:', error);
      res.status(500).json({ message: 'Internal server error' });
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
