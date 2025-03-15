const ActorCode = require("../../model/ActorCode");
const Payroll = require("../../model/Payroll");
const Attendance = require("../../model/Attendance");
const User = require("../../model/User");
const moment = require("moment");


// calculate salary for employee
exports.calculateSalary = async (req, res) => {
 const { code, salaryMonth, salaryDetails, deductionPreferences } = req.body;

 // Validation
 if (!code || !salaryMonth) {
     return res.status(400).json({ message: 'Employee code and salary month are required.' });
 }

 if (!moment(salaryMonth, 'MM/YYYY', true).isValid()) {
     return res.status(400).json({ message: 'Invalid salary month format. Use MM/YYYY.' });
 }

 try {
     // Check for existing payroll entry
     const existingPayroll = await Payroll.findOne({ code, salaryMonth });
     if (existingPayroll) {
         return res.status(400).json({ message: 'Salary already calculated for this month.' });
     }

     // Fetch employee CTC
     const user = await User.findOne({ code });
     if (!user || !user.CTC) {
         return res.status(404).json({ message: 'Employee or CTC not found.' });
     }

     // Base salary calculation
     const calculatedBaseSalary = Math.round(user.CTC / 12);
     const daysInMonth = moment(salaryMonth, 'MM/YYYY').daysInMonth();
     const perDaySalary = calculatedBaseSalary / daysInMonth;

     // Attendance deduction calculation
     const [startOfMonth, endOfMonth] = [
         moment(salaryMonth, 'MM/YYYY').startOf('month').toDate(),
         moment(salaryMonth, 'MM/YYYY').endOf('month').toDate(),
     ];

     const attendanceRecords = await Attendance.find({
         code,
         date: { $gte: startOfMonth, $lte: endOfMonth }
     });

     const attendanceDeduction = attendanceRecords.reduce((total, record) => {
         if (record.status === 'Absent') return total + perDaySalary;
         if (record.status === 'Half Day') return total + perDaySalary / 2;
         return total;
     }, 0);

     // Add attendance deduction to salary details
     salaryDetails.deductions = [
         ...(salaryDetails.deductions || []),
         { name: 'Attendance Deduction', type: 'fixed', value: attendanceDeduction, isActive: true }
     ];

     // Handle deduction preferences dynamically
     const deductionMap = {
         PF: { type: 'percentage', value: deductionPreferences?.pfPercentage || 12, isActive: deductionPreferences?.pfDeduct || false },
         ESI: { type: 'percentage', value: 1.75, isActive: deductionPreferences?.esiDeduct || false },
         'Professional Tax': { type: 'fixed', value: 200, isActive: deductionPreferences?.ptDeduct || false }
     };

     // Merge existing deductions with default ones efficiently
     salaryDetails.deductions = [
         ...salaryDetails.deductions,
         ...Object.entries(deductionMap)
             .filter(([name]) => !salaryDetails.deductions.some(d => d.name === name))
             .map(([name, deduction]) => ({ name, ...deduction }))
     ];

     // Salary calculation
     const totalSalary = [
         { amount: calculatedBaseSalary },
         ...(salaryDetails.bonuses || []),
         ...(salaryDetails.other || []).map(entry => ({
             amount: entry.type === 'addition' ? entry.amount : -entry.amount
         })),
         ...(salaryDetails.deductions || [])
             .filter(d => d.isActive)
             .map(deduction => ({
                 amount: deduction.type === 'percentage'
                     ? -(calculatedBaseSalary * (deduction.value / 100))
                     : -deduction.value
             }))
     ].reduce((total, entry) => total + entry.amount, 0);

     // Create and save Payroll entry
     const newPayroll = new Payroll({
         code,
         salaryMonth,
         salaryDetails: {
             ...salaryDetails,
             baseSalary: calculatedBaseSalary,
             CTC: user.CTC
         },
         totalSalary
     });

     await newPayroll.save();
     res.status(201).json({ message: 'Salary calculated successfully', data: newPayroll });

 } catch (error) {
     console.error('Error calculating salary:', error);
     res.status(500).json({ message: 'Internal server error' });
 }
};




// get All Salaries 
exports.getAllSalaries = async (req, res) => {
  try {
      // Fetch all payroll entries
      const payrolls = await Payroll.find();

      if (!payrolls || payrolls.length === 0) {
          return res.status(404).json({ message: 'No payroll entries found.' });
      }

      // Iterate through payroll records and calculate salaries
      const salaryDetails = await Promise.all(payrolls.map(async (payroll) => {
          const { code, salaryDetails } = payroll;

          // Fetch employee name from ActorCode model
          const actor = await ActorCode.findOne({ code });
          const employeeName = actor ? actor.name : 'Unknown';

          // Fetch attendance records
          const attendanceRecords = await Attendance.find({
              code,
              date: {
                  $gte: new Date(`${new Date().getFullYear()}-${new Date().getMonth() + 1}-01`),
                  $lt: new Date(`${new Date().getFullYear()}-${new Date().getMonth() + 1}-31`)
              }
          });

          const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
          const absentDays = attendanceRecords.filter(record => record.status === 'Absent').length;
          const halfDays = attendanceRecords.filter(record => record.status === 'Half Day').length;

          const salaryPerDay = salaryDetails.baseSalary / daysInMonth;

          // Deductions Calculation
          let totalDeductions = 0;
          salaryDetails.deductions.forEach(deduction => {
              if (deduction.isActive) {
                  totalDeductions += deduction.type === 'percentage'
                      ? (salaryDetails.baseSalary * deduction.value) / 100
                      : deduction.value;
              }
          });

          // Attendance deductions
          const absentDeduction = absentDays * salaryPerDay;
          const halfDayDeduction = halfDays * salaryPerDay * 0.5;
          const attendanceDeductions = absentDeduction + halfDayDeduction;

          // Additions Calculation
          const totalAdditions = salaryDetails.bonuses
              ? salaryDetails.bonuses.reduce((sum, bonus) => sum + bonus.amount, 0)
              : 0;

          // Final Salary Calculation
          const netSalary = Math.round(salaryDetails.baseSalary + totalAdditions - totalDeductions - attendanceDeductions);

          // Return salary details for each employee
          return {
              code,
              name: employeeName,  // Added employee name
              baseSalary: salaryDetails.baseSalary,
              totalAdditions,
              totalDeductions,
              absentDays,
              halfDays,
              absentDeduction,
              halfDayDeduction,
              attendanceDeductions,
              netSalary
          };
      }));

      res.status(200).json({
          message: 'All employee salaries fetched successfully',
          data: salaryDetails
      });

  } catch (error) {
      console.error('Error fetching employee salaries:', error);
      res.status(500).json({ message: 'Internal server error' });
  }
};

// generate pay slip for employee
exports.generatePayslipByEmp = async (req, res) => {
  const { month, year } = req.body;
  const { code } = req.user;

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

      // Fetch attendance data
      const attendanceRecords = await Attendance.find({
          code,
          date: {
              $gte: new Date(`${year}-${month}-01`),
              $lt: new Date(`${year}-${month}-31`)
          }
      });

      const daysInMonth = new Date(year, month, 0).getDate();
      const absentDays = attendanceRecords.filter(record => record.status === 'Absent').length;
      const halfDays = attendanceRecords.filter(record => record.status === 'Half Day').length;

      // Salary Calculations
      const baseSalary = payroll.salaryDetails.baseSalary;
      const salaryPerDay = baseSalary / daysInMonth;

      let totalDeductions = 0;
      payroll.salaryDetails.deductions.forEach(deduction => {
          if (deduction.isActive) {
              totalDeductions += deduction.type === 'percentage'
                  ? (baseSalary * deduction.value) / 100
                  : deduction.value;
          }
      });

      const attendanceDeductions = (absentDays * salaryPerDay) + (halfDays * salaryPerDay * 0.5);

      const totalAdditions = payroll.salaryDetails.bonuses
          ? payroll.salaryDetails.bonuses.reduce((sum, bonus) => sum + bonus.amount, 0)
          : 0;

      const netSalary = Math.round(baseSalary + totalAdditions - totalDeductions - attendanceDeductions);

      // Generate Payslip Structure
      const payslip = {
          employeeCode: code,
          month,
          year,
          baseSalary,
          CTC: payroll.salaryDetails.CTC,
          allowances: totalAdditions,
          deductions: totalDeductions,
          attendanceDeductions,
          netSalary,
          attendanceSummary: {
              totalDays: daysInMonth,
              presentDays: daysInMonth - (absentDays + halfDays),
              absentDays,
              halfDays
          }
      };

      res.status(200).json({
          message: 'Payslip generated successfully',
          data: payslip
      });

  } catch (error) {
      console.error('Error generating payslip:', error);
      res.status(500).json({ message: 'Internal server error' });
  }
};

