const ActorCode = require("../../model/ActorCode");
const Payroll = require("../../model/Payroll");
const Attendance = require("../../model/Attendance")


// Controller to Add Salary
exports.addSalary = async (req, res) => {
  const { code, salaryDetails, deductionPreferences } = req.body;

  // Validation
  if (!code || !salaryDetails || !salaryDetails.CTC) {
      return res.status(400).json({ message: 'Employee code and CTC are required.' });
  }

  try {
      // Check if payroll entry already exists for this employee
      const existingPayroll = await Payroll.findOne({ code });
      if (existingPayroll) {
          return res.status(400).json({ message: 'Payroll entry already exists for this employee.' });
      }

      // Auto-calculate baseSalary (CTC / 12)
      const calculatedBaseSalary = Math.round(salaryDetails.CTC / 12);

      // Handle Deduction Preferences from HR
      const defaultDeductions = [
          { 
              name: 'PF', 
              type: 'percentage', 
              value: deductionPreferences?.pfPercentage || 12, 
              isActive: deductionPreferences?.pfDeduct || false 
          },
          { name: 'ESI', type: 'percentage', value: 1.75, isActive: deductionPreferences?.esiDeduct || false },
          { name: 'Professional Tax', type: 'fixed', value: 200, isActive: deductionPreferences?.ptDeduct || false }
      ];

      // Combine provided deductions with defaults
      salaryDetails.deductions = salaryDetails.deductions || [];
      salaryDetails.deductions = [...salaryDetails.deductions, ...defaultDeductions];

      // // Remove overtime details since it's not required here
      // delete salaryDetails.overtimeHours;
      // delete salaryDetails.overtimeRate;

      // Create new Payroll entry
      const newPayroll = new Payroll({
          code,
          salaryDetails: {
              ...salaryDetails,
              baseSalary: calculatedBaseSalary,  // Auto-set Base Salary
          }
      });

      await newPayroll.save();
      res.status(201).json({ message: 'Salary added successfully', data: newPayroll });

  } catch (error) {
      console.error('Error adding salary:', error);
      res.status(500).json({ message: 'Internal server error' });
  }
};

// calculate salary for employee
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
      const absentDays = attendanceRecords.filter(record => record.status === 'Absent').length;
      const halfDays = attendanceRecords.filter(record => record.status === 'Half Day').length;

      // Calculate salary per day
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

      // Update Payroll model with calculated salary
      payroll.totalSalary = netSalary;
      await payroll.save();

      res.status(200).json({
          message: 'Salary calculated and saved successfully',
          data:{
            attendanceDeductions,
            payroll
          }
      });

  } catch (error) {
      console.error('Error calculating and saving salary:', error);
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

