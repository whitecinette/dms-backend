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


exports.bulkGeneratePayroll = async (req, res) => {
  try {
    let { firmCodes, month, year } = req.body;

    // Default → last month
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
      if (d.getDay() !== 0) workingDays++; // Sunday = 0
    }

    // 1. Get employees
    const employees = await MetaData.find({ firm_code: { $in: firmCodes } }).lean();

    // 2. Load firm metadata map
    const firmSettings = await FirmMetaData.find({ firmCode: { $in: firmCodes } }).lean();
    const firmMap = new Map(firmSettings.map(f => [f.firmCode, f]));

    let payrollDocs = [];

    for (const emp of employees) {
      const code = emp.code;
      const firmCode = emp.firm_code;
      const firmConfig = firmMap.get(firmCode) || {};

      const basicSalary = emp.basic_salary || 0;

      // 3. Attendance
      const attendanceRecords = await Attendance.find({
        code,
        date: { $gte: startDate, $lte: endDate }
      }).lean();

      let daysPresent = 0;
      let hoursWorked = 0;

      attendanceRecords.forEach(rec => {
        if (firmConfig.punchoutConsidered === false) {
          if (rec.punchIn) daysPresent++;
        } else {
          if (rec.punchIn && rec.punchOut) daysPresent++;
        }
        hoursWorked += rec.hoursWorked || 0;
      });

      // 4. Leaves (only for reporting, not deductions now)
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

      // 5. Expenses (approved)
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

      // ✅ Salary calculation (proportional to attendance only)
      const dailyRate = basicSalary / workingDays;
      const salaryEarned = dailyRate * daysPresent;

      const grossSalary = salaryEarned + additions.reduce((a, b) => a + b.amount, 0);
      const netSalary = grossSalary; // no leave deductions anymore

      // ✅ Bulk upsert
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
              deductions: [], // no leave deduction now
              month,
              year,
              gross_salary: grossSalary,
              net_salary: netSalary,
              status: "generated",
              generated_by: req.user?.id || "system"
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

    // collect all dynamic addition/deduction names
    const allAdditions = new Set();
    const allDeductions = new Set();
    payrolls.forEach(p => {
      (p.additions || []).forEach(a => allAdditions.add(a.name));
      (p.deductions || []).forEach(d => allDeductions.add(d.name));
    });

    const additionCols = Array.from(allAdditions);
    const deductionCols = Array.from(allDeductions);

    // core fields
    const fields = [
      "code", "employeeName", "position",
      "firmCode", "firmName",
      "basic_salary", "days_present", "working_days",
      "gross_salary", "net_salary", "status",
      ...additionCols,
      ...deductionCols
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

      // additions
      additionCols.forEach(name => {
        const found = (p.additions || []).find(a => a.name === name);
        row[name] = found ? found.amount : "";
      });
      // deductions
      deductionCols.forEach(name => {
        const found = (p.deductions || []).find(d => d.name === name);
        row[name] = found ? found.amount : "";
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
          console.log("Headers: ", cleanedHeaders);
          isFirstRow = false;
        }

        let payrollEntry = {};
        cleanedHeaders.forEach((header, index) => {
          const originalKey = Object.keys(row)[index];
          let value = row[originalKey]?.trim?.() ?? "";

          // convert numeric fields
          if (
            [
              "basic_salary",
              "days_present",
              "working_days",
              "gross_salary",
              "net_salary",
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
            return res
              .status(400)
              .json({ success: false, message: "No valid data found in CSV." });
          }

          let newCount = 0,
            updatedCount = 0;

          for (const row of results) {
            const code = row.code;
            if (!code) continue;

            // split dynamic additions/deductions
            const additions = [];
            const deductions = [];
            Object.keys(row).forEach((key) => {
              if (
                ![
                  "code",
                  "employeename",
                  "position",
                  "firmcode",
                  "firmname",
                  "basic_salary",
                  "days_present",
                  "working_days",
                  "gross_salary",
                  "net_salary",
                  "status",
                ].includes(key)
              ) {
                const val = parseFloat(row[key]) || 0;
                if (val > 0) {
                  if (
                    key.includes("deduction") ||
                    key.includes("penalty") ||
                    key.includes("fine")
                  ) {
                    deductions.push({ name: key, amount: val });
                  } else {
                    additions.push({ name: key, amount: val });
                  }
                }
              }
            });

            const updateDoc = {
              code,
              firmCode: row.firmcode,
              basic_salary: row.basic_salary || 0,
              working_days: row.working_days || 0,
              days_present: row.days_present || 0,
              gross_salary: row.gross_salary || 0,
              net_salary: row.net_salary || 0,
              status: row.status || "generated",
              additions,
              deductions,
              month,
              year,
            };

            // upsert
            const existing = await Payroll.findOneAndUpdate(
              { code, month, year },
              { $set: updateDoc },
              { upsert: true, new: true }
            );

            if (existing.createdAt && existing.createdAt.getTime() === existing.updatedAt.getTime()) {
              newCount++;
            } else {
              updatedCount++;
            }
          }

          return res.status(201).json({
            success: true,
            message: "Payroll data processed successfully",
            new: newCount,
            updated: updatedCount,
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



