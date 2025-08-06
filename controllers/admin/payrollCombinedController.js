const User = require("../../model/User");
const Attendance = require("../../model/Attendance");
const Leave = require("../../model/Leave");
const Firm = require("../../model/Firm");
const MetaData = require("../../model/MetaData");

exports.getAttendanceMatrix = async (req, res) => {
  try {
    console.log("Atten Matrix")
    const { month, year, firm_code } = req.query;

    // Default to current month and year if not provided
    const now = new Date();
    const selectedMonth = month ? Number(month) : now.getMonth() + 1;
    const selectedYear = year ? Number(year) : now.getFullYear();

    const start = new Date(`${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`);
    const end = new Date(selectedYear, selectedMonth, 0); // gets last date of month

    // Step 1: Get users (filter by firm_code via Metadata)
    let users = await User.find({
        status: "active",
        position: { $nin: ["mdd", "dealer", "smd"] }
    }).lean();


    const metadataList = await MetaData.find({}).lean();
    const firmMap = {};

    for (const meta of metadataList) {
      if (firm_code && meta.firm_code !== firm_code) continue;
      firmMap[meta.code] = meta.firm_code;
    }

    users = users.filter(u => firmMap[u.code]); // only users in selected firm (or all if firm_code not passed)

    // Step 2: Get attendance and leave data for all codes
    const codes = users.map(u => u.code);

    const attendance = await Attendance.find({
      code: { $in: codes },
      date: { $gte: start, $lte: end },
    }).lean();

    const leaves = await Leave.find({
      code: { $in: codes },
      status: "approved",
      fromDate: { $lte: end },
      toDate: { $gte: start },
    }).lean();

    // Step 3: Process into matrix
    const result = [];

    for (const user of users) {
      const dailyStatus = {};
      const totalDays = new Date(year, month, 0).getDate();

      // initialize all to A (Absent)
      for (let d = 1; d <= totalDays; d++) {
        dailyStatus[d] = "A";
      }

      // Mark Present from Attendance
      const att = attendance.filter(a => a.code === user.code);
      for (const entry of att) {
        const day = new Date(entry.date).getDate();
        dailyStatus[day] = "P";
      }

      // Mark Leave
      const userLeaves = leaves.filter(l => l.code === user.code);
      for (const leave of userLeaves) {
        const from = new Date(leave.fromDate);
        const to = new Date(leave.toDate);

        for (
          let d = new Date(from);
          d <= to && d.getMonth() + 1 === Number(month);
          d.setDate(d.getDate() + 1)
        ) {
          const day = d.getDate();
          dailyStatus[day] = "L";
        }
      }

      // Get Firm Name
      const firmInfo = await Firm.findOne({ code: firmMap[user.code] });
      const firmName = firmInfo?.name || "N/A";

      result.push({
        name: user.name,
        code: user.code,
        position: user.position,
        firm: firmName,
        days: dailyStatus,
      });
    }

    return res.status(200).json({ data: result });
  } catch (error) {
    console.error("Error in getAttendanceMatrix:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};
