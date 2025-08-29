const moment = require("moment");
const MetaData = require("../../model/MetaData");
const FirmMetaData = require("../../model/FirmMetadata");
const Attendance = require("../../model/Attendance");
const Leave = require("../../model/Leave");
const Travel = require("../../model/Travel");
const Payroll = require("../../model/Payroll");
const ActorCode = require("../../model/ActorCode");
const Firm = require("../../model/Firm");

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

