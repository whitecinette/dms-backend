const MetaData = require("../model/MetaData");
const PayrollPolicy = require("../model/PayrollPolicy");

// const calculatePayroll = async ({ user, attendanceRecords, salaryMonth, isAdmin = false }) => {
//   let present = 0;
//   let halfDay = 0;
//   let leave = 0;

//   console.log("🧾 Attendance Records:");
//   for (let r of attendanceRecords) {
//     console.log(`${r.date.toISOString().split("T")[0]} → ${r.status}`);
//   }

//   for (let record of attendanceRecords) {
//     const status = record.status?.toLowerCase();
//     if (status === "present") present++;
//     else if (status === "half day") halfDay++;
//     else if (status === "leave") leave++;
//   }

//   // ✅ Properly fetch MetaData from DB
//   let paidLeavesAllowed = 0;
//   try {
//     const meta = await MetaData.findOne({ code: user.code });
//     if (meta?.leavePolicy?.paidLeavesAllowedPerMonth != null) {
//       paidLeavesAllowed = meta.leavePolicy.paidLeavesAllowedPerMonth;
//     }
//   } catch (err) {
//     console.error("⚠️ Error fetching MetaData for code:", user.code, err.message);
//   }
  

//   const paidLeavesUsed = Math.min(leave, paidLeavesAllowed);
//   const workingDaysCounted = present + 0.5 * halfDay + paidLeavesUsed;

//   console.log("✅ Summary → Present:", present, "Half Day:", halfDay, "Leave:", leave);
//   console.log("✅ Paid Leaves Allowed:", paidLeavesAllowed);
//   console.log("✅ Paid Leaves Used:", paidLeavesUsed);
//   console.log("✅ Working Days Counted:", workingDaysCounted);

//   const [year, month] = salaryMonth.split("-");
//   const endDate = new Date(year, month, 0);
//   const totalDaysInMonth = endDate.getDate();

//   const baseSalary = 30000;
//   const calculatedSalary = (baseSalary * workingDaysCounted) / totalDaysInMonth;

//   let pf = 0, esi = 0;
//   if (isAdmin && user.state) {
//     const config = await PayrollPolicy.findOne({ state: user.state });
//     if (config) {
//       pf = (config.pf / 100) * calculatedSalary;
//       esi = (config.esi / 100) * calculatedSalary;
//     }
//   }

//   const totalDeductions = pf + esi;
//   const netPayable = calculatedSalary - totalDeductions;

//   return {
//     salaryDays: totalDaysInMonth,
//     workingDaysCounted,
//     calculatedSalary,
//     grossPay: calculatedSalary,
//     totalDeductions,
//     netPayable,
//     salaryDetails: {
//       baseSalary,
//       bonuses: [],
//       deductions: [
//         { name: "PF", type: "percentage", value: pf, isActive: pf > 0 },
//         { name: "ESI", type: "percentage", value: esi, isActive: esi > 0 },
//       ],
//       increments: [],
//       other: [],
//       reimbursedExpenses: 0,
//     },
//     attendanceBreakdown: {
//       present,
//       halfDay,
//       leave,
//       paidLeavesAllowed,
//       paidLeavesUsed,
//     },
//   };
// };
// const calculatePayroll = async ({
//  user,
//  attendanceRecords,
//  salaryMonth,
//  bonuses = [],
//  increments = [],
//  deductions = [],
//  reimbursedExpenses = 0,
//  isAdmin = false,
// }) => {
//  let present = 0;
//  let halfDay = 0;
//  let leave = 0;

//  for (let record of attendanceRecords) {
//    const status = record.status?.toLowerCase();
//    if (status === "present") present++;
//    else if (status === "half day") halfDay++;
//    else if (status === "leave") leave++;
//  }

//  let paidLeavesAllowed = 0;
//  try {
//    const meta = await MetaData.findOne({ code: user.code });
//    if (meta?.leavePolicy?.paidLeavesAllowedPerMonth != null) {
//      paidLeavesAllowed = meta.leavePolicy.paidLeavesAllowedPerMonth;
//    }
//  } catch (err) {
//    console.error("⚠️ Error fetching MetaData for code:", user.code, err.message);
//  }

//  const paidLeavesUsed = Math.min(leave, paidLeavesAllowed);
//  const workingDaysCounted = present + 0.5 * halfDay + paidLeavesUsed;

//  const [year, month] = salaryMonth.split("-");
//  const endDate = new Date(year, month, 0);
//  const totalDaysInMonth = endDate.getDate();

//  const baseSalary = 30000;
//  const calculatedSalary = (baseSalary * workingDaysCounted) / totalDaysInMonth;

//  // PF/ESI
//  let pf = 0, esi = 0;
//  if (isAdmin && user.state) {
//    const config = await PayrollPolicy.findOne({ state: user.state });
//    if (config) {
//      pf = (config.pf / 100) * calculatedSalary;
//      esi = (config.esi / 100) * calculatedSalary;
//    }
//  }

//  // Sum up
//  const bonusTotal = bonuses.reduce((sum, b) => sum + (b.value || 0), 0);
//  const incrementTotal = increments.reduce((sum, i) => sum + (i.value || 0), 0);
//  const extraEarnings = bonusTotal + incrementTotal + reimbursedExpenses;

//  const allDeductions = [
//    ...deductions,
//    { name: "PF", type: "percentage", value: pf, isActive: pf > 0 },
//    { name: "ESI", type: "percentage", value: esi, isActive: esi > 0 }
//  ];
//  const totalDeductions = allDeductions.reduce((sum, d) => sum + (d.value || 0), 0);

//  const grossPay = calculatedSalary + extraEarnings;
//  const netPayable = grossPay - totalDeductions;

//  return {
//    salaryDays: totalDaysInMonth,
//    workingDaysCounted,
//    calculatedSalary,
//    grossPay,
//    totalDeductions,
//    netPayable,
//    salaryDetails: {
//      baseSalary,
//      bonuses,
//      deductions: allDeductions,
//      increments,
//      other: [],
//      reimbursedExpenses,
//    },
//    attendanceBreakdown: {
//      present,
//      halfDay,
//      leave,
//      paidLeavesAllowed,
//      paidLeavesUsed,
//    },
//  };
// };

// this calculate increament, bonus, and deduction passes from the body as well 
// abhi Pf esi calcualte nahi ho rhe, naa hi body se aa  rhe h generate api ki
const calculatePayroll = async ({
 user,
 attendanceRecords,
 salaryMonth,
 isAdmin = false,
 bonuses = [],
 increments = [],
 deductions = [],
 reimbursedExpenses = 0
}) => {
 let present = 0, halfDay = 0, leave = 0;

 for (let record of attendanceRecords) {
   const status = record.status?.toLowerCase();
   if (status === "present") present++;
   else if (status === "half day") halfDay++;
   else if (status === "leave") leave++;
 }

 let paidLeavesAllowed = 0;
 try {
   const meta = await MetaData.findOne({ code: user.code });
   if (meta?.leavePolicy?.paidLeavesAllowedPerMonth != null) {
     paidLeavesAllowed = meta.leavePolicy.paidLeavesAllowedPerMonth;
   }
 } catch (err) {
   console.error("⚠️ Error fetching MetaData:", err.message);
 }

 const paidLeavesUsed = Math.min(leave, paidLeavesAllowed);
 const workingDaysCounted = present + 0.5 * halfDay + paidLeavesUsed;
  console.log("✅ Summary → Present:", present, "Half Day:", halfDay, "Leave:", leave);
  console.log("✅ Paid Leaves Allowed:", paidLeavesAllowed);
  console.log("✅ Paid Leaves Used:", paidLeavesUsed);
  console.log("✅ Working Days Counted:", workingDaysCounted);
 const [year, month] = salaryMonth.split("-");
 const endDate = new Date(year, month, 0);
 const totalDaysInMonth = endDate.getDate();

 const baseSalary = 30000;
 const calculatedSalary = (baseSalary * workingDaysCounted) / totalDaysInMonth;

 let pf = 0, esi = 0;
 if (isAdmin && user.state) {
   const config = await PayrollPolicy.findOne({ state: user.state });
   if (config) {
     pf = (config.pf / 100) * calculatedSalary;
     esi = (config.esi / 100) * calculatedSalary;
   }
 }

 const bonusTotal = bonuses.reduce((sum, b) => sum + (b.value || 0), 0);
 const incrementTotal = increments.reduce((sum, i) => sum + (i.value || 0), 0);
 const extraDeductions = deductions.reduce(
  (sum, d) => sum + (d.value || 0),
  0
);


 const grossPay = calculatedSalary + bonusTotal + incrementTotal;
 const totalDeductions = pf + esi + extraDeductions;
 const netPayable = grossPay - totalDeductions + reimbursedExpenses;

 return {
   salaryDays: totalDaysInMonth,
   workingDaysCounted,
   calculatedSalary,
   grossPay,
   totalDeductions,
   netPayable,
   salaryDetails: {
     baseSalary,
     bonuses,
     increments,
     deductions: [
       ...deductions,
       { name: "PF", type: "percentage", value: pf, isActive: pf > 0 },
       { name: "ESI", type: "percentage", value: esi, isActive: esi > 0 },
     ],
     reimbursedExpenses,
     other: [],
   },
   attendanceBreakdown: {
     present,
     halfDay,
     leave,
     paidLeavesAllowed,
     paidLeavesUsed,
   },
 };
};

module.exports = calculatePayroll;
