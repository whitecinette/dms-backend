const ActorCode = require("../../model/ActorCode");
const Payroll = require("../../model/Payroll");
const Attendance = require("../../model/Attendance");
const User = require("../../model/User");
const Metadata = require("../../model/MetaData");
const moment = require("moment");
const calculatePayroll = require("../../helpers/payrollCalculation");


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

// generate salary  calculation in this 

// exports.generateSalary = async (req, res) => {
//  try {
//    // Ensure only admin can generate salary
//    if (req.user?.role !== "admin") {
//      return res.status(403).json({ message: "Only admin can generate salary" });
//    }

//    const code = req.query.code;
//    const salaryMonth = req.query.salaryMonth;

//    if (!code || !salaryMonth) {
//      return res.status(400).json({ message: "Missing employee code or salaryMonth in query" });
//    }

//    const user = await User.findOne({ code });
//    if (!user) return res.status(404).json({ message: "Employee not found" });

//    const [year, month] = salaryMonth.split("-");
//    const startDate = new Date(year, month - 1, 1);
//    const endDate = new Date(year, month, 0);

//    const attendanceRecords = await Attendance.find({
//      code,
//      date: { $gte: startDate, $lte: endDate },
//    });

//    // let present = 0;
//    // let halfDay = 0;
//    // let leave = 0;

//    // for (let record of attendanceRecords) {
//    //   if (record.status === "Present") present++;
//    //   else if (record.status === "Half Day") halfDay++;
//    //   else if (record.status === "Leave") leave++;
//    // }

//    // const workingDaysCounted = present + 0.5 * halfDay + leave;
//    let present = 0;
//    let halfDay = 0;
//    let leave = 0;

// for (let record of attendanceRecords) {
//   if (record.status === "Present") present++;
//   else if (record.status === "Half Day") halfDay++;
//   else if (record.status === "Leave") leave++;
// }

// // ✅ Get allowed paid leaves from user's leave policy
// const userMetadata = await Metadata.findOne({ code });
// const paidLeavesAllowed = userMetadata?.leavePolicy?.paidLeavesAllowedPerMonth || 0;

// // ✅ Count only allowed leaves as paid
// const paidLeavesUsed = Math.min(leave, paidLeavesAllowed);

// // ✅ Final working days counted for salary
// const workingDaysCounted = present + 0.5 * halfDay + paidLeavesUsed;

//    const totalDaysInMonth = endDate.getDate();
//    const baseSalary = 30000;

//    const calculatedSalary = (baseSalary * workingDaysCounted) / totalDaysInMonth;
//    const existingPayroll = await Payroll.findOne({ code, salaryMonth });

//    if (existingPayroll) {
//     if (existingPayroll.status === "Paid") {
//       return res.status(400).json({
//         message: "Salary for this employee and month has already been paid. Cannot regenerate.",
//       });
//     }
  
//     // ✅ Safe to update if not paid
//     existingPayroll.salaryDays = totalDaysInMonth;
//     existingPayroll.workingDaysCounted = workingDaysCounted;
//     existingPayroll.calculatedSalary = calculatedSalary;
//     existingPayroll.grossPay = calculatedSalary;
//     existingPayroll.totalDeductions = 0;
//     existingPayroll.netPayable = calculatedSalary;
//     existingPayroll.salaryDetails = {
//       baseSalary,
//       bonuses: [],
//       deductions: [],
//       other: [],
//       increments: [],
//       reimbursedExpenses: 0,
//     };
//     existingPayroll.status = "Generated";
//     existingPayroll.createdBy = req.user?.code || "admin";
  
//     await existingPayroll.save();
  
//     return res.status(200).json({
//       message: "Payroll updated successfully",
//       data: existingPayroll,
//     });
//   }
  

//    const payroll = await Payroll.create({
//      code,
//      salaryMonth,
//      salaryDays: totalDaysInMonth,
//      workingDaysCounted,
//      calculatedSalary,
//      grossPay: calculatedSalary,
//      totalDeductions: 0,
//      netPayable: calculatedSalary,
//      salaryDetails: {
//        baseSalary,
//        bonuses: [],
//        deductions: [],
//        other: [],
//        increments: [],
//        reimbursedExpenses: 0,
//      },
//      status: "Generated",
//      createdBy: req.user?.code || "admin",
//    });

//    res.status(200).json({
//      message: "Payroll generated successfully",
//      data: payroll,
//    });
//  } 
//  catch (err) {
//    console.error("Payroll generation failed:", err);
//    res.status(500).json({ message: "Internal server error", error: err.message });
//  }
// };

// calculation in payrollCalculation.js function
// exports.generateSalary = async (req, res) => {
//  try {
//    // ✅ Only admin can generate salary
//    if (req.user?.role !== "admin") {
//      return res.status(403).json({ message: "Only admin can generate salary" });
//    }

//    const code = req.query.code;
//    const salaryMonth = req.query.salaryMonth;

//    if (!code || !salaryMonth) {
//      return res.status(400).json({ message: "Missing employee code or salaryMonth in query" });
//    }

//    const user = await User.findOne({ code });
//    if (!user) return res.status(404).json({ message: "Employee not found" });

//    const [year, month] = salaryMonth.split("-");
//    const startDate = new Date(year, month - 1, 1);
//    const endDate = new Date(year, month, 0);

//    const attendanceRecords = await Attendance.find({
//      code,
//      date: { $gte: startDate, $lte: endDate },
//    });

//    // ✅ Use calculateSalary function
//    const payrollData = await calculatePayroll({
//      user,
//      attendanceRecords,
//      salaryMonth,
//    });

//    const existingPayroll = await Payroll.findOne({ code, salaryMonth });

//    if (existingPayroll) {
//      if (existingPayroll.status === "Paid") {
//        return res.status(400).json({
//          message: "Salary for this employee and month has already been paid. Cannot regenerate.",
//        });
//      }

//      // ✅ Update existing payroll
//      Object.assign(existingPayroll, {
//        ...payrollData,
//        status: "Generated",
//        createdBy: req.user?.code || "admin",
//      });

//      await existingPayroll.save();

//      return res.status(200).json({
//        message: "Payroll updated successfully",
//        data: existingPayroll,
//      });
//    }

//    // ✅ Create new payroll
//    const payroll = await Payroll.create({
//      code,
//      salaryMonth,
//      ...payrollData,
//      status: "Generated",
//      createdBy: req.user?.code || "admin",
//    });

//    res.status(200).json({
//      message: "Payroll generated successfully",
//      data: payroll,
//    });

//  } catch (err) {
//    console.error("Payroll generation failed:", err);
//    res.status(500).json({ message: "Internal server error", error: err.message });
//  }
// };

// if salary is generated in same month then it calculate the attendance last day and if generated in next month that it check the last month attendance 
// exports.generateSalary = async (req, res) => {
//  try {
//    // ✅ Only admin can generate salary
//    if (req.user?.role !== "admin") {
//      return res.status(403).json({ message: "Only admin can generate salary" });
//    }

//    const code = req.query.code;
//    const salaryMonth = req.query.salaryMonth;

//    if (!code || !salaryMonth) {
//      return res.status(400).json({ message: "Missing employee code or salaryMonth in query" });
//    }

//    const user = await User.findOne({ code });
//    if (!user) return res.status(404).json({ message: "Employee not found" });

//    // const [year, month] = salaryMonth.split("-");
//    // const startDate = new Date(year, month - 1, 1);
//    // const endDate = new Date(year, month, 0);

//    // const attendanceRecords = await Attendance.find({
//    //   code,
//    //   date: { $gte: startDate, $lte: endDate },
//    // });

//    const [year, month] = salaryMonth.split("-");
// const startDate = new Date(year, month - 1, 1);

// // 👇 Replace this block right here
// let endDate;
// const today = new Date();
// const salaryGenMonth = parseInt(month); // from salaryMonth
// const salaryGenYear = parseInt(year);

// if (
//   today.getFullYear() === salaryGenYear &&
//   today.getMonth() + 1 === salaryGenMonth
// ) {
//   endDate = new Date();
//   endDate.setDate(endDate.getDate() - 1);
//   endDate.setHours(23, 59, 59, 999);
// } else {
//   endDate = new Date(year, month, 0); // full month
// }

// // Fetch attendance only till adjusted endDate
// const attendanceRecords = await Attendance.find({
//   code,
//   date: { $gte: startDate, $lte: endDate },
// });


//    // ✅ Use calculateSalary function
//    const payrollData = await calculatePayroll({
//      user,
//      attendanceRecords,
//      salaryMonth,
//    });

//    const existingPayroll = await Payroll.findOne({ code, salaryMonth });

//    if (existingPayroll) {
//      if (existingPayroll.status === "Paid") {
//        return res.status(400).json({
//          message: "Salary for this employee and month has already been paid. Cannot regenerate.",
//        });
//      }

//      // ✅ Update existing payroll
//      Object.assign(existingPayroll, {
//        ...payrollData,
//        status: "Generated",
//        createdBy: req.user?.code || "admin",
//      });

//      await existingPayroll.save();

//      return res.status(200).json({
//       message: "Payroll updated successfully",
//       data: {
//         ...existingPayroll.toObject(),
//         attendanceBreakdown: payrollData.attendanceBreakdown,
//       },
//     });
    
//    }

//    // ✅ Create new payroll
//    const payroll = await Payroll.create({
//      code,
//      salaryMonth,
//      ...payrollData,
//      status: "Generated",
//      createdBy: req.user?.code || "admin",
//    });

//    // res.status(200).json({
//    //   message: "Payroll generated successfully",
//    //   data: payroll,
//    // });
//    res.status(200).json({
//     message: "Payroll generated successfully",
//     data: {
//       ...payroll.toObject(),
//       attendanceBreakdown: payrollData.attendanceBreakdown,
//     },
//   });
  

//  } catch (err) {
//    console.error("Payroll generation failed:", err);
//    res.status(500).json({ message: "Internal server error", error: err.message });
//  }
// };

exports.generateSalary = async (req, res) => {
 try {
   // // ✅ Only admin can generate salary
   // if (req.user?.role !== "admin") {
   //   return res.status(403).json({ message: "Only admin can generate salary" });
   // }
   // admin superadmin and hr can generate a salary
   if (!["admin", "super_admin", "hr"].includes(req.user?.role)) {
    return res.status(403).json({ message: "Only admin, superadmin and hr can generate salary" });
   }

   const code = req.query.code;
   const salaryMonth = req.query.salaryMonth;
      // ✅ Get salary extras from body
      const {
       bonuses = [],
       increments = [],
       deductions = [],
       other = [],
       reimbursedExpenses = 0,
     } = req.body;
  

   if (!code || !salaryMonth) {
     return res.status(400).json({ message: "Missing employee code or salaryMonth in query" });
   }

   const user = await User.findOne({ code });
   if (!user) return res.status(404).json({ message: "Employee not found" });

   // ✅ Date range for salary
   const [year, month] = salaryMonth.split("-");
   const startDate = new Date(year, month - 1, 1);

   let endDate;
   const today = new Date();
   const salaryGenMonth = parseInt(month);
   const salaryGenYear = parseInt(year);

   if (today.getFullYear() === salaryGenYear && today.getMonth() + 1 === salaryGenMonth) {
     endDate = new Date();
     endDate.setDate(endDate.getDate() - 1);
     endDate.setHours(23, 59, 59, 999);
   } else {
     endDate = new Date(year, month, 0);
   }

   // ✅ Fetch attendance
   const attendanceRecords = await Attendance.find({
     code,
     date: { $gte: startDate, $lte: endDate },
   });

   // ✅ Call calculator
   const payrollData = await calculatePayroll({
     user,
     attendanceRecords,
     salaryMonth,
     bonuses,
     increments,
     deductions,
     reimbursedExpenses,
     other,
     isAdmin: true,
   });

   const existingPayroll = await Payroll.findOne({ code, salaryMonth });

   if (existingPayroll) {
     if (existingPayroll.status === "Paid") {
       return res.status(400).json({
         message: "Salary for this employee and month has already been paid. Cannot regenerate.",
       });
     }

     Object.assign(existingPayroll, {
       ...payrollData,
       status: "Generated",
       createdBy: req.user?.code || "admin",
     });

     await existingPayroll.save();

     return res.status(200).json({
       message: "Payroll updated successfully",
       data: {
         ...existingPayroll.toObject(),
         attendanceBreakdown: payrollData.attendanceBreakdown,
       },
     });
   }

   // ✅ Create new payroll
   const payroll = await Payroll.create({
     code,
     salaryMonth,
     ...payrollData,
     status: "Generated",
     createdBy: req.user?.code || "admin",
   });

   res.status(200).json({
     message: "Payroll generated successfully",
     data: {
       ...payroll.toObject(),
       attendanceBreakdown: payrollData.attendanceBreakdown,
     },
   });
 } catch (err) {
   console.error("Payroll generation failed:", err);
   res.status(500).json({ message: "Internal server error", error: err.message });
 }
};
