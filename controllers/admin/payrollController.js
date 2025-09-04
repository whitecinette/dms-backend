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
const User = require("../../model/User");

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
//       // const expenses = await Travel.find({
//       //   code,
//       //   createdAt: { $gte: startDate, $lte: endDate },
//       //   status: "approved"
//       // }).lean();

//       // let additions = [];

//       // expenses.forEach(exp => {
//       //   additions.push({
//       //     name: `${exp.billType} Expenses`,
//       //     amount: exp.amount || 0,
//       //     remark: exp.remarks || ""
//       //   });
//       // });

//       let additions = [];


//         // week offs/sundays
//         const daysInMonth = new Date(year, month, 0).getDate(); // total days in month
//         let weekOffs = 0;

//         for (let d = 1; d <= daysInMonth; d++) {
//         const day = new Date(year, month - 1, d).getDay();
//         if (day === 0) weekOffs++; // Sunday = 0
//         }

//       // Salary calc
//       const dailyRate = basicSalary / 30;
      

//       // Absent = workingDays - daysPresent
//       const absentDays = workingDays - daysPresent;

//       // Get existing payroll doc (to keep leave_adjustment if exists)
//       const existingPayroll = await Payroll.findOne({ code, month, year }).lean();
//       const leaveAdjustment = existingPayroll?.leaves_adjustment || 0;

//       // Total leaves = approved leaves + absent - adjustment
//       const effectiveLeaves = absentDays + leaveAdjustment;
      

//       // Expenses = additions
//       const additionsTotal = additions.reduce((a, b) => a + b.amount, 0);

//       // (later we can add real deductions; for now keep [])
//       const deductions = [];
//       const deductionsTotal = deductions.reduce((a, b) => a + b.amount, 0);

//       // ✅ Final salary
//       const netSalary = basicSalary - (dailyRate * effectiveLeaves) + additionsTotal + deductionsTotal;

//       // grossSalary can represent before adjustments (basic + additions - leaves)
//       const grossSalary = basicSalary  - (dailyRate * (absentDays));

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

      // ✅ Preserve existing payroll additions & deductions
      const existingPayroll = await Payroll.findOne({ code, month, year }).lean();
      const leaveAdjustment = existingPayroll?.leaves_adjustment || 0;

      let additions = existingPayroll?.additions || [];
      let deductions = existingPayroll?.deductions || [];

      // week offs/sundays
      const daysInMonth = new Date(year, month, 0).getDate();
      let weekOffs = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const day = new Date(year, month - 1, d).getDay();
        if (day === 0) weekOffs++;
      }

      // Salary calc
      const dailyRate = basicSalary / 30;
      const absentDays = workingDays - daysPresent;
      const effectiveLeaves = absentDays + leaveAdjustment;

      const additionsTotal = additions.reduce((a, b) => a + (b.amount || 0), 0);
      const deductionsTotal = deductions.reduce((a, b) => a + (b.amount || 0), 0);

      const netSalary =
        basicSalary - dailyRate * effectiveLeaves + additionsTotal - deductionsTotal;

      const grossSalary = basicSalary - (dailyRate * absentDays);

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
              additions, // ✅ preserved
              deductions, // ✅ preserved
              month,
              year,
              gross_salary: grossSalary,
              net_salary: netSalary,
              status: "generated",
              generated_by: req.user?.id || "system"
            },
            $setOnInsert: {
              leaves_adjustment: 0
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

    const metadatas = await MetaData.find({ code: { $in: codes } })
      .select("code system_code")
      .lean();
    const metaMap = new Map(metadatas.map(m => [m.code, m.system_code]));


    // core fields
    const fields = [
      "code", "employeeName", "position",
      "firmCode", "firmName",
      "system_code",
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
        system_code: metaMap.get(p.code) || "", 
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
            [
              "basic_salary", "days_present", "working_days",
              "gross_salary", "net_salary"
            ].includes(header)
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
            return res.status(400).json({
              success: false,
              message: "No valid data found in CSV."
            });
          }

          let newCount = 0, updatedCount = 0, unchangedCount = 0;

          for (const row of results) {
            const code = row.code;
            if (!code) continue;

            const additions = [];
            const deductions = [];

            // ✅ Exclude known payroll fields, everything else = dynamic column
            const knownFields = [
              "code", "employeename", "position", "firmcode", "firmname", "system_code",
              "basic_salary", "days_present", "working_days", "gross_salary", "net_salary",
              "status", "approved_leaves", "leaves", "leaves_adjustment", "hours_worked",
              "remarks", "createdat", "updatedat", "firmcode", "generated_by"
            ];

            Object.keys(row).forEach((key) => {
              if (!knownFields.includes(key.toLowerCase())) {
                const val = parseFloat(row[key]);
                if (!isNaN(val) && val !== 0) {
                  if (val > 0) {
                    additions.push({ name: key, amount: val, remark: "" });
                  } else {
                    deductions.push({ name: key, amount: Math.abs(val), remark: "" });
                  }
                }
              }
            });

            // ✅ Recalculate salaries using your formulas
            const basic = row.basic_salary || 0;
            const days_present = row.days_present || 0;
            const working_days = row.working_days || 0;
            const dailyRate = basic / 30;

            const absentDays = working_days - days_present;
            const additionsTotal = additions.reduce((a, b) => a + (b.amount || 0), 0);
            const deductionsTotal = deductions.reduce((a, b) => a + (b.amount || 0), 0);

            const net_salary =
              basic - dailyRate * absentDays + additionsTotal - deductionsTotal;

            const gross_salary = basic - (dailyRate * absentDays);

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


// exports.uploadPayrollThroughCSV = async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ success: false, message: "No file uploaded" });
//     }

//     let { month, year } = req.body;
//     if (!month || !year) {
//       return res.status(400).json({ success: false, message: "month and year required" });
//     }
//     month = parseInt(month);
//     year = parseInt(year);

//     let results = [];
//     const stream = new Readable();
//     stream.push(req.file.buffer);
//     stream.push(null);

//     let isFirstRow = true;
//     let cleanedHeaders = [];

//     stream
//       .pipe(csvParser())
//       .on("data", (row) => {
//         if (isFirstRow) {
//           cleanedHeaders = Object.keys(row).map((h) =>
//             h.trim().replace(/\s+/g, "_").toLowerCase()
//           );
//           isFirstRow = false;
//         }

//         let payrollEntry = {};
//         cleanedHeaders.forEach((header, index) => {
//           const originalKey = Object.keys(row)[index];
//           let value = row[originalKey]?.trim?.() ?? "";

//           // convert numeric fields
//           if (
//             ["basic_salary", "days_present", "working_days", "gross_salary", "net_salary"].includes(header)
//           ) {
//             value = parseFloat(value) || 0;
//           }

//           payrollEntry[header] = value;
//         });

//         results.push(payrollEntry);
//       })
//       .on("end", async () => {
//         try {
//           if (results.length === 0) {
//             return res.status(400).json({ success: false, message: "No valid data found in CSV." });
//           }

//           let newCount = 0, updatedCount = 0, unchangedCount = 0;

//           for (const row of results) {
//             const code = row.code;
//             if (!code) continue;

//             // split dynamic additions/deductions based on sign
//             const additions = [];
//             const deductions = [];

//             Object.keys(row).forEach((key) => {
//               if (
//                 ![
//                   "code", "employeename", "position", "firmcode", "firmname",
//                   "basic_salary", "days_present", "working_days",
//                   "gross_salary", "net_salary", "status"
//                 ].includes(key)
//               ) {
//                 const val = parseFloat(row[key]);
//                 if (!isNaN(val) && val !== 0) {
//                   if (val > 0) additions.push({ name: key, amount: val, remark: "" });
//                   else deductions.push({ name: key, amount: Math.abs(val), remark: "" });
//                 }
//               }
//             });

//             // recalc salaries
//             const basic = row.basic_salary || 0;
//             const days_present = row.days_present || 0;
//             const working_days = row.working_days || 0;
//             const perDay = working_days > 0 ? basic / working_days : 0;

//             const gross_salary = perDay * days_present + additions.reduce((a, b) => a + b.amount, 0);
//             const net_salary = gross_salary - deductions.reduce((a, b) => a + b.amount, 0);

//             const updateDoc = {
//               code,
//               firmCode: row.firmcode,
//               basic_salary: basic,
//               working_days,
//               days_present,
//               gross_salary,
//               net_salary,
//               status: row.status || "generated",
//               additions,
//               deductions,
//               month,
//               year,
//             };

//             // fetch existing
//             let existing = await Payroll.findOne({ code, month, year });

//             if (!existing) {
//               await Payroll.create(updateDoc);
//               newCount++;
//             } else {
//               // compare serialized version
//               const oldDoc = JSON.stringify({
//                 basic_salary: existing.basic_salary,
//                 working_days: existing.working_days,
//                 days_present: existing.days_present,
//                 gross_salary: existing.gross_salary,
//                 net_salary: existing.net_salary,
//                 status: existing.status,
//                 additions: existing.additions,
//                 deductions: existing.deductions,
//               });

//               const newDoc = JSON.stringify({
//                 basic_salary: updateDoc.basic_salary,
//                 working_days: updateDoc.working_days,
//                 days_present: updateDoc.days_present,
//                 gross_salary: updateDoc.gross_salary,
//                 net_salary: updateDoc.net_salary,
//                 status: updateDoc.status,
//                 additions: updateDoc.additions,
//                 deductions: updateDoc.deductions,
//               });

//               if (oldDoc !== newDoc) {
//                 await Payroll.updateOne({ _id: existing._id }, { $set: updateDoc });
//                 updatedCount++;
//               } else {
//                 unchangedCount++;
//               }
//             }
//           }

//           return res.status(201).json({
//             success: true,
//             message: "Payroll data processed successfully",
//             new: newCount,
//             updated: updatedCount,
//             unchanged: unchangedCount,
//             total: results.length,
//           });
//         } catch (error) {
//           console.error("Error inserting payroll data:", error);
//           res.status(500).json({ success: false, message: "Internal server error" });
//         }
//       });
//   } catch (error) {
//     console.error("Error in uploadPayrollThroughCSV:", error);
//     res.status(500).json({ success: false, message: "Internal server error" });
//   }
// };

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

exports.bulkUpdateLeaves = async (req, res) => {
  try {
    const { updates } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ success: false, message: "updates array is required" });
    }

    let payrollOps = [];
    let metaOps = [];

    for (const u of updates) {
      // --- Payroll updates ---
      if (u.month && u.year && u.leaves_adjustment !== undefined) {
        payrollOps.push(async () => {
          const payroll = await Payroll.findOne({ code: u.code, month: u.month, year: u.year });
          if (payroll) {
            payroll.leaves_adjustment = u.leaves_adjustment;

            // same recalculation as updateLeaveAdjustment
            const basicSalary = payroll.basic_salary || 0;
            const dailyRate = basicSalary / 30;
            const absentDays = (payroll.working_days || 0) - (payroll.days_present || 0);
            const effectiveLeaves = absentDays + u.leaves_adjustment;

            const additionsTotal = (payroll.additions || []).reduce((a, b) => a + (b.amount || 0), 0);
            const deductionsTotal = (payroll.deductions || []).reduce((a, b) => a + (b.amount || 0), 0);

            payroll.net_salary = Math.round(
              basicSalary - (dailyRate * effectiveLeaves) + additionsTotal + deductionsTotal
            );
            payroll.gross_salary = Math.round(
              basicSalary - (dailyRate * absentDays)
            );

            payroll.updatedAt = new Date();
            await payroll.save();
          }
        });
      }

      // --- Metadata updates ---
      let metaFields = {};
      if (u.allowed_leaves !== undefined) metaFields.allowed_leaves = u.allowed_leaves;
      if (u.leaves_balance !== undefined) metaFields.leaves_balance = u.leaves_balance;

      if (Object.keys(metaFields).length > 0) {
        metaOps.push({
          updateOne: {
            filter: { code: u.code },
            update: { $set: metaFields }
          }
        });
      }
    }

    // Run all payroll ops in parallel
    await Promise.all(payrollOps.map(fn => fn()));

    // Bulk update metadata if any
    if (metaOps.length > 0) {
      await MetaData.bulkWrite(metaOps);
    }

    res.json({
      success: true,
      message: "Leaves updated successfully for multiple users"
    });
  } catch (err) {
    console.error("❌ bulkUpdateLeaves error:", err);
    res.status(500).json({ success: false, message: "Internal server error", error: err.message });
  }
};

exports.getUserExpenses = async (req, res) => {
  try {
    console.log("Expem")
    let { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({ success: false, message: "Month and year are required" });
    }

    month = Number(month);
    year = Number(year);

    // Months: current, -1, -2
    const months = [
      { year, month }, // current
      getPrevMonth(year, month, 1), // m-1
      getPrevMonth(year, month, 2), // m-2
    ];

    // Fetch payrolls for these months
    const payrolls = await Payroll.find({
      $or: months.map(({ year, month }) => ({ year, month })),
    }).lean();

    // Build map for user metadata
    const codes = [...new Set(payrolls.map(p => p.code))];
    const users = await User.find({ code: { $in: codes } }).lean();
    const metadata = await MetaData.find({ code: { $in: codes } }).lean();
    const firms = await Firm.find({}).lean();

    const userMap = {};
    for (const u of users) userMap[u.code] = u.name;
    const firmMap = {};
    for (const m of metadata) firmMap[m.code] = m.firm_code;
    const firmNameMap = {};
    for (const f of firms) firmNameMap[f.code] = f.name;

    // Group payrolls by code
    const result = [];
    for (const code of codes) {
      const userName = userMap[code] || "Unknown";
      const firmCode = firmMap[code] || null;
      const firmName = firmNameMap[firmCode] || "N/A";

      const expenses = { additions: {}, deductions: {} };

      for (let i = 0; i < months.length; i++) {
        const { year, month } = months[i];
        const key = i === 0 ? "current" : i === 1 ? "m1" : "m2";

        const payroll = payrolls.find(p => p.code === code && p.year === year && p.month === month);

        expenses.additions[key] = {
          total: payroll?.additions?.reduce((sum, a) => sum + (a.amount || 0), 0) || 0,
          list: payroll?.additions || [],
        };

        expenses.deductions[key] = {
          total: payroll?.deductions?.reduce((sum, d) => sum + (d.amount || 0), 0) || 0,
          list: payroll?.deductions || [],
        };
      }

      result.push({
        code,
        name: userName,
        firmCode,
        firmName,
        totalAdditions: {
          current: expenses.additions.current.total,
          m1: expenses.additions.m1.total,
          m2: expenses.additions.m2.total,
        },
        totalDeductions: {
          current: expenses.deductions.current.total,
          m1: expenses.deductions.m1.total,
          m2: expenses.deductions.m2.total,
        },
        additions: {
          current: expenses.additions.current.list,
          m1: expenses.additions.m1.list,
          m2: expenses.additions.m2.list,
        },
        deductions: {
          current: expenses.deductions.current.list,
          m1: expenses.deductions.m1.list,
          m2: expenses.deductions.m2.list,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "User expenses fetched successfully",
      data: result,
    });
  } catch (err) {
    console.error("❌ Error in getUserExpenses:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Helper function
function getPrevMonth(year, month, offset) {
  let newMonth = month - offset;
  let newYear = year;
  if (newMonth <= 0) {
    newMonth += 12;
    newYear -= 1;
  }
  return { year: newYear, month: newMonth };
}

// 📊 API: Payroll Overview (KPI Cards)
exports.getPayrollOverviewForCharts = async (req, res) => {
  try {
    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({ success: false, message: "month and year are required" });
    }

    // Helper to compute totals for any month/year
    const computeTotals = async (m, y) => {
      const data = await Payroll.find({ month: m, year: y });

      const additions = data.reduce(
        (sum, payroll) =>
          sum + payroll.additions.reduce((a, item) => a + (item.amount || 0), 0),
        0
      );

      const deductions = data.reduce(
        (sum, payroll) =>
          sum + payroll.deductions.reduce((a, item) => a + (item.amount || 0), 0),
        0
      );

      return {
        additions,
        deductions,
        net: additions - deductions,
      };
    };

    // Current month
    const current = await computeTotals(month, year);

    // Previous month (handle year wrap)
    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = year - 1;
    }
    const prev = await computeTotals(prevMonth, prevYear);

    // 2 months ago (handle year wrap)
    let prev2Month = month - 2;
    let prev2Year = year;
    if (prev2Month <= 0) {
      prev2Month += 12;
      prev2Year = year - 1;
    }
    const prev2 = await computeTotals(prev2Month, prev2Year);

    // % change vs last month
    const changePercent =
      prev.net !== 0 ? (((current.net - prev.net) / prev.net) * 100).toFixed(2) : 0;

    return res.status(200).json({
      success: true,
      data: {
        totals: {
          additions: current.additions,
          deductions: current.deductions,
          net: current.net,
          changePercent: parseFloat(changePercent),
          additionsTrend: [prev2.additions, prev.additions, current.additions],
          deductionsTrend: [prev2.deductions, prev.deductions, current.deductions],
          netTrend: [prev2.net, prev.net, current.net],
          changeTrend: [
            prev2.net !== 0 ? (((prev.net - prev2.net) / prev2.net) * 100).toFixed(2) : 0,
            prev.net !== 0 ? (((current.net - prev.net) / prev.net) * 100).toFixed(2) : 0,
            parseFloat(changePercent),
          ],
        },
      },
    });
  } catch (error) {
    console.error("Error in getPayrollOverview:", error);
    res.status(500).json({ success: false, message: "Server error", error });
  }
};

exports.getPayrollExpenseInsightsForCharts = async (req, res) => {
  try {
    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({ success: false, message: "month and year are required" });
    }

    // Helper → previous 2 months + current
    const monthsToFetch = [];
    for (let i = 2; i >= 0; i--) {
      let m = month - i;
      let y = year;
      if (m <= 0) {
        m += 12;
        y -= 1;
      }
      monthsToFetch.push({ month: m, year: y });
    }

    // Fetch payroll data for these 3 months
    const payrollData = await Payroll.find({
      $or: monthsToFetch.map(m => ({ month: m.month, year: m.year }))
    });

    // Utility → sum amounts grouped by category
    const aggregateByCategory = (data) => {
      const result = {};
      data.forEach(p => {
        (p.additions || []).forEach(a => {
          if (!a.name || !a.amount) return;
          result[a.name] = (result[a.name] || 0) + a.amount;
        });
        (p.deductions || []).forEach(d => {
          if (!d.name || !d.amount) return;
          result[d.name] = (result[d.name] || 0) + d.amount;
        });
      });
      return result;
    };

    // --- Current Month Breakdown (fetch directly for selected month)
    const currentMonthData = await Payroll.find({ month, year });
    const currentBreakdown = aggregateByCategory(currentMonthData);

    // --- Expense Trends (3 months stacked)
    const trendsRaw = monthsToFetch.map(({ month: m, year: y }) => {
      const monthlyData = payrollData.filter(p => p.month === m && p.year === y);
      const monthlyAgg = aggregateByCategory(monthlyData);
      return {
        month: `${y}-${m}`,
        ...monthlyAgg
      };
    });

    // Normalize → fill missing categories with 0
    const allCategories = new Set();
    trendsRaw.forEach(t => {
      Object.keys(t).forEach(k => {
        if (k !== "month") allCategories.add(k);
      });
    });

    const trends = trendsRaw.map(t => {
      const filled = {};
      allCategories.forEach(cat => {
        filled[cat] = t[cat] || 0;
      });
      return { month: t.month, ...filled };
    });

    // --- Top 5 (based only on selected month)
    const topExpenses = Object.entries(currentBreakdown)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return res.status(200).json({
      success: true,
      data: {
        currentBreakdown,
        trends,
        topExpenses
      }
    });
  } catch (error) {
    console.error("Error in getPayrollExpenseInsights:", error);
    res.status(500).json({ success: false, message: "Server error", error });
  }
};


// exports.getPayrollExpenseInsightsForCharts = async (req, res) => {
//   try {
//     const { month, year } = req.body;

//     if (!month || !year) {
//       return res.status(400).json({ success: false, message: "month and year are required" });
//     }

//     // Helper → previous 2 months + current
//     const monthsToFetch = [];
//     for (let i = 2; i >= 0; i--) {
//       let m = month - i;
//       let y = year;
//       if (m <= 0) {
//         m += 12;
//         y -= 1;
//       }
//       monthsToFetch.push({ month: m, year: y });
//     }

//     // Fetch payroll data for these 3 months
//     const payrollData = await Payroll.find({
//       $or: monthsToFetch.map(m => ({ month: m.month, year: m.year }))
//     });

//     // Utility → sum amounts grouped by category
//     const aggregateByCategory = (data) => {
//       const result = {};
//       data.forEach(p => {
//         (p.additions || []).forEach(a => {
//           if (!a.name || !a.amount) return;
//           result[a.name] = (result[a.name] || 0) + a.amount;
//         });
//         (p.deductions || []).forEach(d => {
//           if (!d.name || !d.amount) return;
//           result[d.name] = (result[d.name] || 0) + d.amount;
//         });
//       });
//       return result;
//     };

//     // --- Current Month Breakdown (fetch directly for selected month)
//     const currentMonthData = await Payroll.find({ month, year });
//     const currentBreakdown = aggregateByCategory(currentMonthData);

//     // --- Expense Trends (3 months stacked)
//     const trends = monthsToFetch.map(({ month: m, year: y }) => {
//       const monthlyData = payrollData.filter(p => p.month === m && p.year === y);
//       const monthlyAgg = aggregateByCategory(monthlyData);
//       return {
//         month: `${y}-${m}`,
//         ...monthlyAgg
//       };
//     });

//     // --- Top 5 (based only on selected month)
//     const topExpenses = Object.entries(currentBreakdown)
//       .map(([name, value]) => ({ name, value }))
//       .sort((a, b) => b.value - a.value)
//       .slice(0, 5);

//       //       console.log("cb: ", currentBreakdown);
// //       console.log("trends: ", trends);
// //       console.log("topExpenses: ", topExpenses);

//     return res.status(200).json({
//       success: true,
//       data: {
//         currentBreakdown,
//         trends,
//         topExpenses
//       }
//     });
//   } catch (error) {
//     console.error("Error in getPayrollExpenseInsights:", error);
//     res.status(500).json({ success: false, message: "Server error", error });
//   }
// };




// exports.getPayrollExpenseInsightsForCharts = async (req, res) => {
//   try {
//     const { month, year } = req.body;

//     if (!month || !year) {
//       return res.status(400).json({ success: false, message: "month and year are required" });
//     }

//     // Helper → previous 2 months (handle year boundaries)
//     const monthsToFetch = [];
//     for (let i = 2; i >= 0; i--) {
//       let m = month - i;
//       let y = year;
//       if (m <= 0) {
//         m += 12;
//         y -= 1;
//       }
//       monthsToFetch.push({ month: m, year: y });
//     }

//     // Fetch payroll data for these 3 months
//     const payrollData = await Payroll.find({
//       $or: monthsToFetch.map(m => ({ month: m.month, year: m.year }))
//     });

//     // Utility → sum amounts grouped by category
//     const aggregateByCategory = (data) => {
//       const result = {};
//       data.forEach(p => {
//         (p.additions || []).forEach(a => {
//           if (!a.name || !a.amount) return;
//           result[a.name] = (result[a.name] || 0) + a.amount;
//         });
//         (p.deductions || []).forEach(d => {
//           if (!d.name || !d.amount) return;
//           result[d.name] = (result[d.name] || 0) + d.amount;
//         });
//       });
//       return result;
//     };

//     // --- Current Month Breakdown ---
//     const currentMonthData = payrollData.filter(
//       p => p.month === month && p.year === year
//     );
//     const currentBreakdown = aggregateByCategory(currentMonthData);

//     // --- Expense Trends (3 months stacked) ---
//     const trends = monthsToFetch.map(({ month: m, year: y }) => {
//       const monthlyData = payrollData.filter(p => p.month === m && p.year === y);
//       const monthlyAgg = aggregateByCategory(monthlyData);
//       return {
//         month: `${y}-${m}`, // e.g. "2025-8"
//         ...monthlyAgg
//       };
//     });

//     // --- Top 5 Expense Types ---
//     const overallAgg = aggregateByCategory(payrollData);
//     const topExpenses = Object.entries(overallAgg)
//       .map(([name, value]) => ({ name, value }))
//       .sort((a, b) => b.value - a.value)
//       .slice(0, 5);

//       console.log("cb: ", currentBreakdown);
//       console.log("trends: ", trends);
//       console.log("topExpenses: ", topExpenses);

//     return res.status(200).json({
//       success: true,
//       data: {
//         currentBreakdown, // { transport_expenses: 4000, bonus: 2500, etc. }
//         trends,           // [{ month:"2025-6", transport:4000, bonus:2000,...}, {...}]
//         topExpenses       // [{ name:"transport_expenses", value:4000 }, ...]
//       }
//     });
//   } catch (error) {
//     console.error("Error in getPayrollExpenseInsights:", error);
//     res.status(500).json({ success: false, message: "Server error", error });
//   }
// };








