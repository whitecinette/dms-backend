const moment = require("moment");
const MetaData = require("../../model/MetaData");
const FirmMetaData = require("../../model/FirmMetadata");
const Attendance = require("../../model/Attendance");
const Leave = require("../../model/Leave");
const Travel = require("../../model/Travel");
const Payroll = require("../../model/Payroll");
const ActorCode = require("../../model/ActorCode");
const Firm = require("../../model/Firm");
const csvParser = require("csv-parser");
const { Parser } = require("json2csv");
const { Readable } = require("stream");

// punch out considered in payroll generate
// exports.bulkGeneratePayroll = async (req, res) => {
//   try {
//     let { firmCodes, month, year } = req.body;

//     // Default → last month
//     if (!month || !year) {
//       const lastMonth = moment().subtract(1, "month");
//       month = lastMonth.month() + 1;
//       year = lastMonth.year();
//     }

//     if (!firmCodes || !firmCodes.length) {
//       return res.status(400).json({
//         success: false,
//         message: "firmCodes are required"
//       });
//     }

//     const startDate = new Date(year, month - 1, 1);
//     const endDate = new Date(year, month, 0);

//     // Count working days (exclude Sundays)
//     let workingDays = 0;
//     for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
//       if (d.getDay() !== 0) workingDays++; // Sunday = 0
//     }

//     // 1. Get employees
//     const employees = await MetaData.find({ firm_code: { $in: firmCodes } }).lean();

//     // 2. Load firm metadata map
//     const firmSettings = await FirmMetaData.find({ firmCode: { $in: firmCodes } }).lean();
//     const firmMap = new Map(firmSettings.map(f => [f.firmCode, f]));

//     let payrollDocs = [];

//     for (const emp of employees) {
//       const code = emp.code;
//       const firmCode = emp.firm_code;
//       const firmConfig = firmMap.get(firmCode) || {};

//       const basicSalary = emp.basic_salary || 0;

//       // 3. Attendance
//       const attendanceRecords = await Attendance.find({
//         code,
//         date: { $gte: startDate, $lte: endDate }
//       }).lean();

//       let daysPresent = 0;
//       let hoursWorked = 0;

//       attendanceRecords.forEach(rec => {
//         if (firmConfig.punchoutConsidered === false) {
//           if (rec.punchIn) daysPresent++;
//         } else {
//           if (rec.punchIn && rec.punchOut) daysPresent++;
//         }
//         hoursWorked += rec.hoursWorked || 0;
//       });

//       // 4. Leaves (only for reporting, not deductions now)
//       const leaves = await Leave.find({
//         code,
//         fromDate: { $lte: endDate },
//         toDate: { $gte: startDate },
//         status: "approved"
//       }).lean();

//       let totalLeaves = 0;
//       leaves.forEach(l => {
//         totalLeaves += l.totalDays || 0;
//       });

//       // 5. Expenses (approved)
//       const expenses = await Travel.find({
//         code,
//         createdAt: { $gte: startDate, $lte: endDate },
//         status: "approved"
//       }).lean();

//       let additions = [];
//       expenses.forEach(exp => {
//         additions.push({
//           name: `${exp.billType} Expenses`,
//           amount: exp.amount || 0,
//           remark: exp.remarks || ""
//         });
//       });

//       // ✅ Salary calculation (proportional to attendance only)
//       const dailyRate = basicSalary / 30;
//       const salaryEarned = dailyRate * daysPresent;

//       const grossSalary = salaryEarned + additions.reduce((a, b) => a + b.amount, 0);
//       const netSalary = grossSalary; // no leave deductions anymore

//       // ✅ Bulk upsert
//         payrollDocs.push({
//         updateOne: {
//             filter: { code, month, year },
//             update: {
//             $set: {
//                 code,
//                 firmCode,
//                 basic_salary: basicSalary,
//                 working_days: workingDays,
//                 days_present: daysPresent,
//                 leaves: totalLeaves,
//                 hours_worked: hoursWorked,
//                 additions,
//                 deductions: [],
//                 month,
//                 year,
//                 gross_salary: grossSalary,
//                 net_salary: netSalary,
//                 status: "generated",
//                 generated_by: req.user?.id || "system"
//             },
//             $setOnInsert: {
//                 leaves_adjustment: 0   // ✅ only if doc doesn’t exist
//             }
//             },
//             upsert: true
//         }
//         });

//     }

//     if (payrollDocs.length > 0) {
//       const result = await Payroll.bulkWrite(payrollDocs);
//       return res.status(200).json({
//         success: true,
//         message: "Payroll generated successfully",
//         result
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       message: "No employees found",
//       result: {}
//     });
//   } catch (error) {
//     console.error("❌ Payroll generation error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to generate payroll",
//       error: error.message
//     });
//   }
// };

// exports.bulkGeneratePayroll = async (req, res) => {
//   try {
//     let { firmCodes, month, year } = req.body;

//     if (!month || !year) {
//       const lastMonth = moment().subtract(1, "month");
//       month = lastMonth.month() + 1;
//       year = lastMonth.year();
//     }

//     if (!firmCodes || !firmCodes.length) {
//       return res.status(400).json({
//         success: false,
//         message: "firmCodes are required"
//       });
//     }

//     const startDate = new Date(year, month - 1, 1);
//     const endDate = new Date(year, month, 0);

//     // Count working days (exclude Sundays)
//     let workingDays = 0;
//     for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
//       if (d.getDay() !== 0) workingDays++;
//     }

//     const employees = await MetaData.find({ firm_code: { $in: firmCodes } }).lean();
//     const firmSettings = await FirmMetaData.find({ firmCode: { $in: firmCodes } }).lean();
//     const firmMap = new Map(firmSettings.map(f => [f.firmCode, f]));

//     let payrollDocs = [];

//     for (const emp of employees) {
//       const code = emp.code;
//       const firmCode = emp.firm_code;
//       const firmConfig = firmMap.get(firmCode) || {};

//       const basicSalary = emp.basic_salary || 0;

//       // Attendance
//       const attendanceRecords = await Attendance.find({
//         code,
//         date: { $gte: startDate, $lte: endDate }
//       }).lean();

//       let daysPresent = 0;
//       let hoursWorked = 0;

//       attendanceRecords.forEach(rec => {
//         // ✅ Temporarily ignore punchOut — just punchIn = present
//         if (rec.punchIn) {
//           daysPresent++;
//         }
//         hoursWorked += rec.hoursWorked || 0;
//       });

//       // Leaves
//       const leaves = await Leave.find({
//         code,
//         fromDate: { $lte: endDate },
//         toDate: { $gte: startDate },
//         status: "approved"
//       }).lean();

//       let totalLeaves = 0;
//       leaves.forEach(l => {
//         totalLeaves += l.totalDays || 0;
//       });

//       // Expenses
//       const expenses = await Travel.find({
//         code,
//         createdAt: { $gte: startDate, $lte: endDate },
//         status: "approved"
//       }).lean();

//       let additions = [];
//       expenses.forEach(exp => {
//         additions.push({
//           name: `${exp.billType} Expenses`,
//           amount: exp.amount || 0,
//           remark: exp.remarks || ""
//         });
//       });

//      // Salary calc
//       const dailyRate = basicSalary / 30;
//       const salaryEarned = dailyRate * daysPresent;

//       // Count Sundays in the month
//       let sundayCount = 0;
//       for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
//         if (d.getDay() === 0) sundayCount++; // Sunday = 0
//       }

//       // Get existing payroll doc (to keep leave_adjustment if exists)
//       const existingPayroll = await Payroll.findOne({ code, month, year }).lean();
//       const leaveAdjustment = existingPayroll?.leaves_adjustment || 0;

//       // Salary calculation
//       const grossSalary = salaryEarned + additions.reduce((a, b) => a + b.amount, 0);
//       const netSalary = grossSalary + (dailyRate * sundayCount) - (dailyRate * leaveAdjustment);

//       payrollDocs.push({
//         updateOne: {
//           filter: { code, month, year },
//           update: {
//             $set: {
//               code,
//               firmCode,
//               basic_salary: basicSalary,
//               working_days: workingDays,
//               days_present: daysPresent,
//               leaves: totalLeaves,
//               hours_worked: hoursWorked,
//               additions,
//               deductions: [],
//               month,
//               year,
//               gross_salary: grossSalary,
//               net_salary: netSalary,
//               status: "generated",
//               generated_by: req.user?.id || "system"
//             },
//             $setOnInsert: {
//               leaves_adjustment: 0 // only if new doc
//             }
//           },
//           upsert: true
//         }
//       });
//     }

//     if (payrollDocs.length > 0) {
//       const result = await Payroll.bulkWrite(payrollDocs);
//       return res.status(200).json({
//         success: true,
//         message: "Payroll generated successfully",
//         result
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       message: "No employees found",
//       result: {}
//     });
//   } catch (error) {
//     console.error("❌ Payroll generation error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to generate payroll",
//       error: error.message
//     });
//   }
// };

exports.bulkGeneratePayroll = async (req, res) => {
  try {
    let { firmCodes, month, year } = req.body;

    if (!month || !year) {
      const lastMonth = moment().subtract(1, "month");
      month = lastMonth.month() + 1;
      year = lastMonth.year();
    }

    if (!firmCodes || !firmCodes.length) {
      return res.status(400).json({
        success: false,
        message: "firmCodes are required"
      });
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    // Count working days (exclude Sundays)
    let workingDays = 0;
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 0) workingDays++;
    }

    const employees = await MetaData.find({ firm_code: { $in: firmCodes } }).lean();
    const firmSettings = await FirmMetaData.find({ firmCode: { $in: firmCodes } }).lean();
    const firmMap = new Map(firmSettings.map(f => [f.firmCode, f]));

    let payrollDocs = [];

    for (const emp of employees) {
      const code = emp.code;
      const firmCode = emp.firm_code;
      const firmConfig = firmMap.get(firmCode) || {};

      const basicSalary = emp.basic_salary || 0;

      // Attendance
      const attendanceRecords = await Attendance.find({
        code,
        date: { $gte: startDate, $lte: endDate }
      }).lean();

      let daysPresent = 0;
      let hoursWorked = 0;

      attendanceRecords.forEach(rec => {
        // ✅ Temporarily ignore punchOut — just punchIn = present
        if (rec.punchIn) {
          daysPresent++;
        }
        hoursWorked += rec.hoursWorked || 0;
      });

      // Leaves
      const leaves = await Leave.find({
        code,
        fromDate: { $lte: endDate },
        toDate: { $gte: startDate },
        status: "approved"
      }).lean();

      let totalLeaves = 0;
      leaves.forEach(l => {
        totalLeaves += l.totalDays || 0;
      });

      // Expenses
      const expenses = await Travel.find({
        code,
        createdAt: { $gte: startDate, $lte: endDate },
        status: "approved"
      }).lean();

      let additions = [];
      expenses.forEach(exp => {
        additions.push({
          name: `${exp.billType} Expenses`,
          amount: exp.amount || 0,
          remark: exp.remarks || ""
        });
      });

        // week offs/sundays
        const daysInMonth = new Date(year, month, 0).getDate(); // total days in month
        let weekOffs = 0;

        for (let d = 1; d <= daysInMonth; d++) {
        const day = new Date(year, month - 1, d).getDay();
        if (day === 0) weekOffs++; // Sunday = 0
        }

      // Salary calc
      const dailyRate = basicSalary / 30;
      

      // Absent = workingDays - daysPresent
      const absentDays = workingDays - daysPresent;

      // Get existing payroll doc (to keep leave_adjustment if exists)
      const existingPayroll = await Payroll.findOne({ code, month, year }).lean();
      const leaveAdjustment = existingPayroll?.leaves_adjustment || 0;

      // Total leaves = approved leaves + absent - adjustment
      const effectiveLeaves = absentDays + leaveAdjustment;
      

      // Expenses = additions
      const additionsTotal = additions.reduce((a, b) => a + b.amount, 0);

      // (later we can add real deductions; for now keep [])
      const deductions = [];
      const deductionsTotal = deductions.reduce((a, b) => a + b.amount, 0);

      // ✅ Final salary
      const netSalary = basicSalary - (dailyRate * effectiveLeaves) + additionsTotal + deductionsTotal;

      // grossSalary can represent before adjustments (basic + additions - leaves)
      const grossSalary = basicSalary  - (dailyRate * (absentDays));

      payrollDocs.push({
        updateOne: {
          filter: { code, month, year },
          update: {
            $set: {
              code,
              firmCode,
              basic_salary: basicSalary,
              working_days: workingDays,
              days_present: daysPresent,
              leaves: totalLeaves,
              hours_worked: hoursWorked,
              additions,
              deductions: [],
              month,
              year,
              gross_salary: grossSalary,
              net_salary: netSalary,
              status: "generated",
              generated_by: req.user?.id || "system"
            },
            $setOnInsert: {
              leaves_adjustment: 0 // only if new doc
            }
          },
          upsert: true
        }
      });
    }

    if (payrollDocs.length > 0) {
      const result = await Payroll.bulkWrite(payrollDocs);
      return res.status(200).json({
        success: true,
        message: "Payroll generated successfully",
        result
      });
    }

    return res.status(200).json({
      success: true,
      message: "No employees found",
      result: {}
    });
  } catch (error) {
    console.error("❌ Payroll generation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate payroll",
      error: error.message
    });
  }
};


exports.getAllPayrolls = async (req, res) => {
  try {
    console.log("gen pay")
    let { firmCodes, month, year, search, page = 1, limit = 20 } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const filter = {};

    // Filter by firmCodes if provided
    if (firmCodes) {
      const codesArray = Array.isArray(firmCodes)
        ? firmCodes
        : firmCodes.split(",");
      filter.firmCode = { $in: codesArray };
    }

    // Filter by month/year if provided
    if (month) filter.month = parseInt(month);
    if (year) filter.year = parseInt(year);

    // Base query
    let query = Payroll.find(filter);

    // Pagination
    const skip = (page - 1) * limit;
    query = query.skip(skip).limit(limit);

    // Execute payroll fetch
    const payrolls = await query.lean();

    // Collect employee codes & firmCodes for mapping
    const employeeCodes = payrolls.map((p) => p.code);
    const firmCodesList = payrolls.map((p) => p.firmCode);

    // Fetch Actor details
    const actors = await ActorCode.find({ code: { $in: employeeCodes } })
      .select("code name position role")
      .lean();
    const actorMap = new Map(actors.map((a) => [a.code, a]));

    // Fetch Firm details
    const firms = await Firm.find({ code: { $in: firmCodesList } })
      .select("code name")
      .lean();
    const firmMap = new Map(firms.map((f) => [f.code, f.name]));

    // Merge info
    let finalData = payrolls.map((p, idx) => {
      const actor = actorMap.get(p.code) || {};
      return {
        sNo: skip + idx + 1,
        ...p,
        employeeName: actor.name || "N/A",
        position: actor.position || "N/A",
        role: actor.role || "N/A",
        firmName: firmMap.get(p.firmCode) || "N/A",
      };
    });

    // Search filter (in-memory after join)
    if (search) {
      const s = search.toLowerCase();
      finalData = finalData.filter(
        (p) =>
          p.code?.toLowerCase().includes(s) ||
          p.employeeName?.toLowerCase().includes(s) ||
          p.position?.toLowerCase().includes(s) ||
          p.role?.toLowerCase().includes(s) ||
          p.firmCode?.toLowerCase().includes(s) ||
          p.firmName?.toLowerCase().includes(s)
      );
    }

    // Total count
    const totalCount = await Payroll.countDocuments(filter);
    // console.log("fin data: ", finalData)

    return res.status(200).json({
      success: true,
      message: "Payrolls fetched successfully",
      data: finalData,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching payrolls:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payrolls",
      error: error.message,
    });
  }
};



// =====================
// 1. DOWNLOAD PAYROLL
// =====================
exports.downloadPayroll = async (req, res) => {
  try {
    let { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ success: false, message: "month and year required" });
    }
    month = parseInt(month);
    year = parseInt(year);

    // fetch payrolls
    const payrolls = await Payroll.find({ month, year }).lean();
    if (!payrolls.length) {
      return res.status(404).json({ success: false, message: "No payroll data found" });
    }

    // map actor & firm info
    const codes = payrolls.map(p => p.code);
    const firmCodes = payrolls.map(p => p.firmCode);
    const actors = await ActorCode.find({ code: { $in: codes } }).select("code name position").lean();
    const firms = await Firm.find({ code: { $in: firmCodes } }).select("code name").lean();
    const actorMap = new Map(actors.map(a => [a.code, a]));
    const firmMap = new Map(firms.map(f => [f.code, f.name]));

    // collect all dynamic field names (additions + deductions together)
    const allDynamicCols = new Set();
    payrolls.forEach(p => {
      (p.additions || []).forEach(a => allDynamicCols.add(a.name));
      (p.deductions || []).forEach(d => allDynamicCols.add(d.name));
    });

    const dynamicCols = Array.from(allDynamicCols);

    // core fields
    const fields = [
      "code", "employeeName", "position",
      "firmCode", "firmName",
      "basic_salary", "days_present", "working_days",
      "gross_salary", "net_salary", "status",
      ...dynamicCols
    ];

    // format rows
    const data = payrolls.map(p => {
      const actor = actorMap.get(p.code) || {};
      const row = {
        code: p.code,
        employeeName: actor.name || "N/A",
        position: actor.position || "N/A",
        firmCode: p.firmCode,
        firmName: firmMap.get(p.firmCode) || "N/A",
        basic_salary: p.basic_salary,
        days_present: p.days_present,
        working_days: p.working_days,
        gross_salary: p.gross_salary,
        net_salary: p.net_salary,
        status: p.status,
      };

      dynamicCols.forEach(name => {
        const add = (p.additions || []).find(a => a.name === name);
        const ded = (p.deductions || []).find(d => d.name === name);

        if (add) row[name] = add.amount;               // positive
        else if (ded) row[name] = -Math.abs(ded.amount); // negative
        else row[name] = "";
      });

      return row;
    });

    // convert to CSV
    const parser = new Parser({ fields });
    const csvData = parser.parse(data);

    res.header("Content-Type", "text/csv");
    res.attachment(`payroll_${month}_${year}.csv`);
    return res.send(csvData);
  } catch (err) {
    console.error("❌ Payroll download error:", err);
    res.status(500).json({ success: false, message: "Download failed", error: err.message });
  }
};

exports.uploadPayrollThroughCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    let { month, year } = req.body;
    if (!month || !year) {
      return res.status(400).json({ success: false, message: "month and year required" });
    }
    month = parseInt(month);
    year = parseInt(year);

    let results = [];
    const stream = new Readable();
    stream.push(req.file.buffer);
    stream.push(null);

    let isFirstRow = true;
    let cleanedHeaders = [];

    stream
      .pipe(csvParser())
      .on("data", (row) => {
        if (isFirstRow) {
          cleanedHeaders = Object.keys(row).map((h) =>
            h.trim().replace(/\s+/g, "_").toLowerCase()
          );
          isFirstRow = false;
        }

        let payrollEntry = {};
        cleanedHeaders.forEach((header, index) => {
          const originalKey = Object.keys(row)[index];
          let value = row[originalKey]?.trim?.() ?? "";

          // convert numeric fields
          if (
            ["basic_salary", "days_present", "working_days", "gross_salary", "net_salary"].includes(header)
          ) {
            value = parseFloat(value) || 0;
          }

          payrollEntry[header] = value;
        });

        results.push(payrollEntry);
      })
      .on("end", async () => {
        try {
          if (results.length === 0) {
            return res.status(400).json({ success: false, message: "No valid data found in CSV." });
          }

          let newCount = 0, updatedCount = 0, unchangedCount = 0;

          for (const row of results) {
            const code = row.code;
            if (!code) continue;

            // split dynamic additions/deductions based on sign
            const additions = [];
            const deductions = [];

            Object.keys(row).forEach((key) => {
              if (
                ![
                  "code", "employeename", "position", "firmcode", "firmname",
                  "basic_salary", "days_present", "working_days",
                  "gross_salary", "net_salary", "status"
                ].includes(key)
              ) {
                const val = parseFloat(row[key]);
                if (!isNaN(val) && val !== 0) {
                  if (val > 0) additions.push({ name: key, amount: val, remark: "" });
                  else deductions.push({ name: key, amount: Math.abs(val), remark: "" });
                }
              }
            });

            // recalc salaries
            const basic = row.basic_salary || 0;
            const days_present = row.days_present || 0;
            const working_days = row.working_days || 0;
            const perDay = working_days > 0 ? basic / working_days : 0;

            const gross_salary = perDay * days_present + additions.reduce((a, b) => a + b.amount, 0);
            const net_salary = gross_salary - deductions.reduce((a, b) => a + b.amount, 0);

            const updateDoc = {
              code,
              firmCode: row.firmcode,
              basic_salary: basic,
              working_days,
              days_present,
              gross_salary,
              net_salary,
              status: row.status || "generated",
              additions,
              deductions,
              month,
              year,
            };

            // fetch existing
            let existing = await Payroll.findOne({ code, month, year });

            if (!existing) {
              await Payroll.create(updateDoc);
              newCount++;
            } else {
              // compare serialized version
              const oldDoc = JSON.stringify({
                basic_salary: existing.basic_salary,
                working_days: existing.working_days,
                days_present: existing.days_present,
                gross_salary: existing.gross_salary,
                net_salary: existing.net_salary,
                status: existing.status,
                additions: existing.additions,
                deductions: existing.deductions,
              });

              const newDoc = JSON.stringify({
                basic_salary: updateDoc.basic_salary,
                working_days: updateDoc.working_days,
                days_present: updateDoc.days_present,
                gross_salary: updateDoc.gross_salary,
                net_salary: updateDoc.net_salary,
                status: updateDoc.status,
                additions: updateDoc.additions,
                deductions: updateDoc.deductions,
              });

              if (oldDoc !== newDoc) {
                await Payroll.updateOne({ _id: existing._id }, { $set: updateDoc });
                updatedCount++;
              } else {
                unchangedCount++;
              }
            }
          }

          return res.status(201).json({
            success: true,
            message: "Payroll data processed successfully",
            new: newCount,
            updated: updatedCount,
            unchanged: unchangedCount,
            total: results.length,
          });
        } catch (error) {
          console.error("Error inserting payroll data:", error);
          res.status(500).json({ success: false, message: "Internal server error" });
        }
      });
  } catch (error) {
    console.error("Error in uploadPayrollThroughCSV:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.getPayrollSummary = async (req, res) => {
  try {
    let { month, year, codes } = req.body;
    if (!month || !year || !Array.isArray(codes)) {
      return res.status(400).json({ success: false, message: "month, year and codes[] required" });
    }

    month = parseInt(month);
    year = parseInt(year);

    // fetch only selected employees
    const payrolls = await Payroll.find({
      month,
      year,
      code: { $in: codes }
    }).select("code net_salary").lean();

    const selectedCount = payrolls.length;
    const totalAmount = payrolls.reduce((sum, p) => sum + (p.net_salary || 0), 0);

    return res.status(200).json({
      success: true,
      selectedCount,
      totalAmount,
      details: payrolls   // optional: return each employee net too
    });

  } catch (err) {
    console.error("❌ Payroll summary error:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};


exports.getLeavesInfo = async (req, res) => {
  try {
    const { month, year, firmCode } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: "month and year are required"
      });
    }

    const query = firmCode ? { firm_code: firmCode } : {};
    const employees = await MetaData.find(query).lean();

    if (!employees.length) {
      return res.status(404).json({ success: false, message: "No employees found" });
    }

    const codes = employees.map(e => e.code);
    const payrolls = await Payroll.find({
      code: { $in: codes },
      month: Number(month),
      year: Number(year)
    }).lean();

    const payrollMap = new Map(payrolls.map(p => [p.code, p]));

    const results = employees.map(emp => {
      const payroll = payrollMap.get(emp.code) || {};
      return {
        code: emp.code,
        name: emp.name,
        allowed_leaves: emp.allowed_leaves || 0,
        leaves_balance: emp.leaves_balance || 0,
        leaves_adjustment: payroll.leaves_adjustment || 0
      };
    });

    res.json({ success: true, data: results });
  } catch (error) {
    console.error("❌ Leaves info error:", error);
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};


exports.updateLeaveAdjustment = async (req, res) => {
  try {
    const { code, month, year, adjustment } = req.body;

    if (!code || !month || !year || adjustment === undefined) {
      return res.status(400).json({
        success: false,
        message: "code, month, year and adjustment are required"
      });
    }

    // Find existing payroll
    const payroll = await Payroll.findOne({ code, month, year });
    if (!payroll) {
      return res.status(404).json({ success: false, message: "Payroll not found" });
    }

    // Update leave_adjustment
    payroll.leaves_adjustment = adjustment;

    // --- Recalculate salary using SAME formula as bulkGeneratePayroll ---
    const basicSalary = payroll.basic_salary || 0;
    const dailyRate = basicSalary / 30;

    // Absent = workingDays - daysPresent
    const absentDays = (payroll.working_days || 0) - (payroll.days_present || 0);

    // Total leaves = absent + approved leaves - adjustment
    const effectiveLeaves = absentDays + adjustment;

    // Additions / Deductions
    const additionsTotal = (payroll.additions || []).reduce((a, b) => a + (b.amount || 0), 0);
    const deductionsTotal = (payroll.deductions || []).reduce((a, b) => a + (b.amount || 0), 0);

    // Final salaries
    const netSalary = basicSalary - (dailyRate * effectiveLeaves) + additionsTotal + deductionsTotal;
    const grossSalary = basicSalary - (dailyRate * absentDays);

    payroll.net_salary = Math.round(netSalary);
    payroll.gross_salary = Math.round(grossSalary);
    payroll.updatedAt = new Date();

    await payroll.save();

    res.json({
      success: true,
      message: "Leave adjustment updated and payroll recalculated",
      data: {
        code: payroll.code,
        month: payroll.month,
        year: payroll.year,
        leaves_adjustment: payroll.leaves_adjustment,
        gross_salary: payroll.gross_salary,
        net_salary: payroll.net_salary
      }
    });
  } catch (error) {
    console.error("❌ updateLeaveAdjustment error:", error);
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};




