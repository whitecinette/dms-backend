const { DateTime } = require("luxon");
const Attendance = require("../../model/Attendance");
const User = require("../../model/User");
const MetaData = require("../../model/MetaData");
const Firm = require("../../model/Firm");

const IST_ZONE = "Asia/Kolkata";

const ATTENDANCE_STATUSES = ["Present", "Absent", "Half Day", "Leave", "Pending"];

const getDefaultMonthYearIST = () => {
  const now = DateTime.now().setZone(IST_ZONE);
  return {
    month: now.month,
    year: now.year,
  };
};

const getISTMonthRangeUTC = (month, year) => {
  const startIST = DateTime.fromObject(
    {
      year: Number(year),
      month: Number(month),
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    },
    { zone: IST_ZONE }
  );

  const endIST = startIST.endOf("month");

  return {
    startUTC: startIST.toUTC().toJSDate(),
    endUTC: endIST.toUTC().toJSDate(),
    startIST,
    endIST,
  };
};

const getISTTodayRangeUTC = () => {
  const todayIST = DateTime.now().setZone(IST_ZONE);
  const startIST = todayIST.startOf("day");
  const endIST = todayIST.endOf("day");

  return {
    startUTC: startIST.toUTC().toJSDate(),
    endUTC: endIST.toUTC().toJSDate(),
    dateKey: startIST.toFormat("yyyy-MM-dd"),
    startIST,
    endIST,
  };
};

const getISTDayRangeUTCFromDate = (dateString) => {
  const target = DateTime.fromISO(String(dateString), { zone: IST_ZONE });

  if (!target.isValid) {
    throw new Error("Invalid date format. Expected YYYY-MM-DD");
  }

  const startIST = target.startOf("day");
  const endIST = target.endOf("day");

  return {
    startUTC: startIST.toUTC().toJSDate(),
    endUTC: endIST.toUTC().toJSDate(),
    dateKey: startIST.toFormat("yyyy-MM-dd"),
    startIST,
    endIST,
  };
};

const resolveAttendanceRange = ({ viewMode, month, year, date }) => {
  const mode = String(viewMode || "month").toLowerCase();

  if (mode === "day") {
    if (!date) {
      throw new Error("date is required when viewMode is day");
    }

    const dayRange = getISTDayRangeUTCFromDate(date);
    const monthOfDay = dayRange.startIST;
    const monthRange = getISTMonthRangeUTC(monthOfDay.month, monthOfDay.year);

    return {
      viewMode: "day",
      selectedDateKey: dayRange.dateKey,
      selectedStartUTC: dayRange.startUTC,
      selectedEndUTC: dayRange.endUTC,
      month: monthOfDay.month,
      year: monthOfDay.year,
      monthStartUTC: monthRange.startUTC,
      monthEndUTC: monthRange.endUTC,
      monthStartIST: monthRange.startIST,
      monthEndIST: monthRange.endIST,
    };
  }

  const safeMonth = Number(month);
  const safeYear = Number(year);

  if (!safeMonth || !safeYear) {
    throw new Error("month and year are required when viewMode is month");
  }

  const monthRange = getISTMonthRangeUTC(safeMonth, safeYear);
  const todayRange = getISTTodayRangeUTC();

  return {
    viewMode: "month",
    selectedDateKey: todayRange.dateKey,
    selectedStartUTC: todayRange.startUTC,
    selectedEndUTC: todayRange.endUTC,
    month: safeMonth,
    year: safeYear,
    monthStartUTC: monthRange.startUTC,
    monthEndUTC: monthRange.endUTC,
    monthStartIST: monthRange.startIST,
    monthEndIST: monthRange.endIST,
  };
};

const formatISTTime = (date) => {
  if (!date) return null;
  return DateTime.fromJSDate(new Date(date), { zone: "utc" })
    .setZone(IST_ZONE)
    .toFormat("hh:mm a");
};

const formatISTDate = (date) => {
  if (!date) return null;
  return DateTime.fromJSDate(new Date(date), { zone: "utc" })
    .setZone(IST_ZONE)
    .toFormat("yyyy-MM-dd");
};

const getDayKeyFromAttendanceDate = (date) => {
  if (!date) return null;
  return DateTime.fromJSDate(new Date(date), { zone: "utc" })
    .setZone(IST_ZONE)
    .toFormat("yyyy-MM-dd");
};

const buildSearchRegex = (search) => {
  if (!search || !String(search).trim()) return null;
  return new RegExp(String(search).trim(), "i");
};

const normalizeStatuses = (statuses) => {
  if (!Array.isArray(statuses)) return [];
  return statuses.filter((x) => ATTENDANCE_STATUSES.includes(x));
};

const safeNum = (n) => {
  const num = Number(n);
  return Number.isFinite(num) ? num : 0;
};

const round2 = (n) => {
  return Math.round((safeNum(n) + Number.EPSILON) * 100) / 100;
};

const getSelectedDayCardFromAttendance = (attendanceDoc) => {
  if (!attendanceDoc) {
    return {
      status: "Absent",
      punchIn: null,
      punchOut: null,
      hoursWorked: 0,
      isManual: false,
      remark: "",
      punchInCode: "",
      punchInName: "",
      punchOutCode: "",
      punchOutName: "",
      notPunchedOut: false,
    };
  }

  return {
    status: attendanceDoc.status || "Pending",
    punchIn: attendanceDoc.punchIn ? formatISTTime(attendanceDoc.punchIn) : null,
    punchOut: attendanceDoc.punchOut ? formatISTTime(attendanceDoc.punchOut) : null,
    hoursWorked: round2(attendanceDoc.hoursWorked || 0),
    isManual: !!attendanceDoc.remark,
    remark: attendanceDoc.remark || "",
    punchInCode: attendanceDoc.punchInCode || "",
    punchInName: attendanceDoc.punchInName || "",
    punchOutCode: attendanceDoc.punchOutCode || "",
    punchOutName: attendanceDoc.punchOutName || "",
    notPunchedOut: !!attendanceDoc.punchIn && !attendanceDoc.punchOut,
  };
};

const getEmptyMonthSummary = () => ({
  present: 0,
  absent: 0,
  halfDay: 0,
  leave: 0,
  pending: 0,
  notPunchedOut: 0,
  avgHoursWorked: 0,
});

const incrementStatusBucket = (bucket, status) => {
  if (status === "Present") bucket.present += 1;
  else if (status === "Absent") bucket.absent += 1;
  else if (status === "Half Day") bucket.halfDay += 1;
  else if (status === "Leave") bucket.leave += 1;
  else bucket.pending += 1;
};

const ensureDailyTrendBucket = (map, dayKey) => {
  if (!map.has(dayKey)) {
    map.set(dayKey, {
      date: dayKey,
      totalEligible: 0,
      present: 0,
      absent: 0,
      halfDay: 0,
      leave: 0,
      pending: 0,
      notPunchedOut: 0,
    });
  }

  return map.get(dayKey);
};

const buildEligibleEmployees = async ({ firmCodes = [], positions = [], search = "" }) => {
  const metaQuery = { attendance: true };

  if (Array.isArray(firmCodes) && firmCodes.length > 0) {
    metaQuery.firm_code = { $in: firmCodes };
  }

  const metaRows = await MetaData.find(metaQuery).lean();

  if (!metaRows.length) {
    return {
      employees: [],
      metaMap: new Map(),
      userMap: new Map(),
      firmMap: new Map(),
      eligibleCodes: [],
    };
  }

  const eligibleCodes = [...new Set(metaRows.map((m) => m.code).filter(Boolean))];
  const metaMap = new Map(metaRows.map((m) => [m.code, m]));

  const userQuery = { code: { $in: eligibleCodes } };

  if (Array.isArray(positions) && positions.length > 0) {
    userQuery.position = { $in: positions };
  }

  const searchRegex = buildSearchRegex(search);
  if (searchRegex) {
    userQuery.$or = [{ name: searchRegex }, { code: searchRegex }, { position: searchRegex }];
  }

  const users = await User.find(userQuery).lean();
  const userMap = new Map(users.map((u) => [u.code, u]));

  const finalCodes = users.map((u) => u.code).filter(Boolean);
  const finalMetaRows = finalCodes.map((code) => metaMap.get(code)).filter(Boolean);

  const firmCodesUsed = [...new Set(finalMetaRows.map((m) => m.firm_code).filter(Boolean))];
  const firms = firmCodesUsed.length
    ? await Firm.find({ code: { $in: firmCodesUsed } }, "code name").lean()
    : [];

  const firmMap = new Map(firms.map((f) => [f.code, f]));

  const employees = finalCodes.map((code) => {
    const user = userMap.get(code);
    const meta = metaMap.get(code);
    const firm = firmMap.get(meta?.firm_code);

    return {
      code,
      name: user?.name || meta?.name || code,
      position: user?.position || "",
      firm_code: meta?.firm_code || "",
      firm_name: firm?.name || meta?.firm_code || "",
      attendance_access: meta?.attendance_access === true,
      metadata: meta || {},
      user: user || {},
    };
  });

  return {
    employees,
    metaMap,
    userMap,
    firmMap,
    eligibleCodes: finalCodes,
  };
};

const fetchAttendanceMaps = async ({
  eligibleCodes,
  selectedStartUTC,
  selectedEndUTC,
  monthStartUTC,
  monthEndUTC,
}) => {
  if (!eligibleCodes.length) {
    return {
      monthAttendance: [],
      selectedAttendance: [],
      selectedMap: new Map(),
      monthByCode: new Map(),
    };
  }

  const [monthAttendance, selectedAttendance] = await Promise.all([
    Attendance.find({
      code: { $in: eligibleCodes },
      date: { $gte: monthStartUTC, $lte: monthEndUTC },
    }).lean(),
    Attendance.find({
      code: { $in: eligibleCodes },
      date: { $gte: selectedStartUTC, $lte: selectedEndUTC },
    }).lean(),
  ]);

  const selectedMap = new Map();
  for (const row of selectedAttendance) {
    selectedMap.set(row.code, row);
  }

  const monthByCode = new Map();
  for (const row of monthAttendance) {
    if (!monthByCode.has(row.code)) {
      monthByCode.set(row.code, []);
    }
    monthByCode.get(row.code).push(row);
  }

  return {
    monthAttendance,
    selectedAttendance,
    selectedMap,
    monthByCode,
  };
};

exports.getAttendanceAdminFilters = async (req, res) => {
  try {
    const metaRows = await MetaData.find({ attendance: true }).lean();

    const firmCodes = [...new Set(metaRows.map((m) => m.firm_code).filter(Boolean))];
    const employeeCodes = [...new Set(metaRows.map((m) => m.code).filter(Boolean))];

    const [firms, users] = await Promise.all([
      firmCodes.length
        ? Firm.find({ code: { $in: firmCodes } }, "code name status").sort({ name: 1 }).lean()
        : [],
      employeeCodes.length
        ? User.find({ code: { $in: employeeCodes } }, "code position").lean()
        : [],
    ]);

    const positions = [...new Set(users.map((u) => u.position).filter(Boolean))].sort((a, b) =>
      String(a).localeCompare(String(b))
    );

    return res.status(200).json({
      success: true,
      message: "Attendance admin filters fetched successfully",
      data: {
        firms: firms.map((f) => ({
          code: f.code,
          name: f.name,
          status: f.status || "Active",
        })),
        positions,
        statuses: ATTENDANCE_STATUSES,
      },
    });
  } catch (error) {
    console.error("getAttendanceAdminFilters error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch attendance admin filters",
    });
  }
};

exports.getAttendanceAdminOverview = async (req, res) => {
  try {
    const defaultMY = getDefaultMonthYearIST();

    const viewMode = req.body?.viewMode || "month";
    const month = Number(req.body?.month || defaultMY.month);
    const year = Number(req.body?.year || defaultMY.year);
    const date = req.body?.date || null;

    const firmCodes = Array.isArray(req.body?.firmCodes) ? req.body.firmCodes : [];
    const positions = Array.isArray(req.body?.positions) ? req.body.positions : [];
    const search = req.body?.search || "";

    const range = resolveAttendanceRange({
      viewMode,
      month,
      year,
      date,
    });

    const { employees, eligibleCodes } = await buildEligibleEmployees({
      firmCodes,
      positions,
      search,
    });

    const { monthAttendance, selectedMap } = await fetchAttendanceMaps({
      eligibleCodes,
      selectedStartUTC: range.selectedStartUTC,
      selectedEndUTC: range.selectedEndUTC,
      monthStartUTC: range.monthStartUTC,
      monthEndUTC: range.monthEndUTC,
    });

    const selectedSummary = {
      date: range.selectedDateKey,
      totalEligible: employees.length,
      present: 0,
      absent: 0,
      halfDay: 0,
      leave: 0,
      pending: 0,
      notPunchedOut: 0,
      avgHoursWorked: 0,
    };

    const monthSummary = {
      month: range.month,
      year: range.year,
      totalEligible: employees.length,
      present: 0,
      absent: 0,
      halfDay: 0,
      leave: 0,
      pending: 0,
      notPunchedOut: 0,
      avgHoursWorked: 0,
    };

    const dailyTrendMap = new Map();
    const dailyRecordedCodesMap = new Map();
    const firmWiseSelectedMap = new Map();

    let selectedHoursTotal = 0;
    let selectedHoursCount = 0;
    let monthHoursTotal = 0;
    let monthHoursCount = 0;

    for (const emp of employees) {
      const selectedAttendance = selectedMap.get(emp.code);

      let firmBucket = firmWiseSelectedMap.get(emp.firm_code);
      if (!firmBucket) {
        firmBucket = {
          firm_code: emp.firm_code,
          firm_name: emp.firm_name,
          totalEligible: 0,
          present: 0,
          absent: 0,
          halfDay: 0,
          leave: 0,
          pending: 0,
          notPunchedOut: 0,
        };
        firmWiseSelectedMap.set(emp.firm_code, firmBucket);
      }

      firmBucket.totalEligible += 1;

      if (!selectedAttendance) {
        selectedSummary.absent += 1;
        firmBucket.absent += 1;
      } else {
        incrementStatusBucket(selectedSummary, selectedAttendance.status);
        incrementStatusBucket(firmBucket, selectedAttendance.status);

        if (selectedAttendance.punchIn && !selectedAttendance.punchOut) {
          selectedSummary.notPunchedOut += 1;
          firmBucket.notPunchedOut += 1;
        }

        if (safeNum(selectedAttendance.hoursWorked) > 0) {
          selectedHoursTotal += safeNum(selectedAttendance.hoursWorked);
          selectedHoursCount += 1;
        }
      }
    }

    for (const row of monthAttendance) {
      incrementStatusBucket(monthSummary, row.status);

      if (row.punchIn && !row.punchOut) {
        monthSummary.notPunchedOut += 1;
      }

      if (safeNum(row.hoursWorked) > 0) {
        monthHoursTotal += safeNum(row.hoursWorked);
        monthHoursCount += 1;
      }

      if (range.viewMode === "month") {
        const dayKey = getDayKeyFromAttendanceDate(row.date);
        const dayBucket = ensureDailyTrendBucket(dailyTrendMap, dayKey);
        incrementStatusBucket(dayBucket, row.status);

        if (row.punchIn && !row.punchOut) {
          dayBucket.notPunchedOut += 1;
        }

        if (!dailyRecordedCodesMap.has(dayKey)) {
          dailyRecordedCodesMap.set(dayKey, new Set());
        }
        dailyRecordedCodesMap.get(dayKey).add(row.code);
      }
    }

    selectedSummary.avgHoursWorked =
      selectedHoursCount > 0 ? round2(selectedHoursTotal / selectedHoursCount) : 0;

    monthSummary.avgHoursWorked =
      monthHoursCount > 0 ? round2(monthHoursTotal / monthHoursCount) : 0;

    if (range.viewMode === "month") {
      let cursor = range.monthStartIST.startOf("day");
      const end = range.monthEndIST.startOf("day");

      while (cursor <= end) {
        const key = cursor.toFormat("yyyy-MM-dd");
        const dayBucket = ensureDailyTrendBucket(dailyTrendMap, key);
        dayBucket.totalEligible = employees.length;

        const recordedCodes = dailyRecordedCodesMap.get(key);
        const recordedCount = recordedCodes ? recordedCodes.size : 0;
        const missingAbsent = employees.length - recordedCount;
        dayBucket.absent += missingAbsent > 0 ? missingAbsent : 0;

        cursor = cursor.plus({ days: 1 });
      }

      const explicitMonthAbsent = monthSummary.absent;
      const derivedMonthAbsent = dailyTrendMap.size > 0
        ? [...dailyTrendMap.values()].reduce((sum, day) => sum + safeNum(day.absent), 0)
        : 0;

      monthSummary.absent = Math.max(explicitMonthAbsent, derivedMonthAbsent);
    }

    return res.status(200).json({
      success: true,
      message: "Attendance admin overview fetched successfully",
      data: {
        viewMode: range.viewMode,
        selectedDate: range.selectedDateKey,
        today: selectedSummary,
        month: monthSummary,
        dailyTrend:
          range.viewMode === "month"
            ? [...dailyTrendMap.values()].sort((a, b) =>
                String(a.date).localeCompare(String(b.date))
              )
            : [],
        firmWiseToday: [...firmWiseSelectedMap.values()].sort((a, b) =>
          String(a.firm_name).localeCompare(String(b.firm_name))
        ),
      },
    });
  } catch (error) {
    console.error("getAttendanceAdminOverview error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch attendance admin overview",
    });
  }
};

exports.getAttendanceAdminEmployees = async (req, res) => {
  try {
    const defaultMY = getDefaultMonthYearIST();

    const viewMode = req.body?.viewMode || "month";
    const month = Number(req.body?.month || defaultMY.month);
    const year = Number(req.body?.year || defaultMY.year);
    const date = req.body?.date || null;

    const firmCodes = Array.isArray(req.body?.firmCodes) ? req.body.firmCodes : [];
    const positions = Array.isArray(req.body?.positions) ? req.body.positions : [];
    const statuses = normalizeStatuses(req.body?.statuses);
    const search = req.body?.search || "";
    const page = Math.max(Number(req.body?.page || 1), 1);
    const limit = Math.max(Number(req.body?.limit || 20), 1);
    const skip = (page - 1) * limit;

    const range = resolveAttendanceRange({
      viewMode,
      month,
      year,
      date,
    });

    const { employees, eligibleCodes } = await buildEligibleEmployees({
      firmCodes,
      positions,
      search,
    });

    const { monthByCode, selectedMap } = await fetchAttendanceMaps({
      eligibleCodes,
      selectedStartUTC: range.selectedStartUTC,
      selectedEndUTC: range.selectedEndUTC,
      monthStartUTC: range.monthStartUTC,
      monthEndUTC: range.monthEndUTC,
    });

    let rows = employees.map((emp) => {
      const monthlyEntries = monthByCode.get(emp.code) || [];
      const selectedAttendance = selectedMap.get(emp.code);
      const monthSummary = getEmptyMonthSummary();

      let hoursTotal = 0;
      let hoursCount = 0;

      for (const row of monthlyEntries) {
        incrementStatusBucket(monthSummary, row.status);

        if (row.punchIn && !row.punchOut) {
          monthSummary.notPunchedOut += 1;
        }

        if (safeNum(row.hoursWorked) > 0) {
          hoursTotal += safeNum(row.hoursWorked);
          hoursCount += 1;
        }
      }

      monthSummary.avgHoursWorked = hoursCount > 0 ? round2(hoursTotal / hoursCount) : 0;

      return {
        code: emp.code,
        name: emp.name,
        position: emp.position || "",
        firm_code: emp.firm_code || "",
        firm_name: emp.firm_name || "",
        today: getSelectedDayCardFromAttendance(selectedAttendance),
        monthSummary,
      };
    });

    if (statuses.length > 0) {
      rows = rows.filter((row) => statuses.includes(row.today.status));
    }

    rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));

    const total = rows.length;
    const paginatedRows = rows.slice(skip, skip + limit);

    return res.status(200).json({
      success: true,
      message: "Attendance admin employees fetched successfully",
      data: {
        viewMode: range.viewMode,
        selectedDate: range.selectedDateKey,
        month: range.month,
        year: range.year,
        rows: paginatedRows,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("getAttendanceAdminEmployees error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch attendance admin employees",
    });
  }
};

exports.getAttendanceAdminEmployeeDetail = async (req, res) => {
  try {
    const defaultMY = getDefaultMonthYearIST();

    const code = String(req.params?.code || "").trim();
    const viewMode = req.query?.viewMode || "month";
    const month = Number(req.query?.month || defaultMY.month);
    const year = Number(req.query?.year || defaultMY.year);
    const date = req.query?.date || null;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Employee code is required",
      });
    }

    const range = resolveAttendanceRange({
      viewMode,
      month,
      year,
      date,
    });

    const meta = await MetaData.findOne({
      code,
      attendance: true,
    }).lean();

    if (!meta) {
      return res.status(404).json({
        success: false,
        message: "Attendance-enabled employee not found",
      });
    }

    const [user, firm] = await Promise.all([
      User.findOne({ code }).lean(),
      meta.firm_code ? Firm.findOne({ code: meta.firm_code }, "code name").lean() : null,
    ]);

    const [monthEntries, selectedAttendance] = await Promise.all([
      Attendance.find({
        code,
        date: { $gte: range.monthStartUTC, $lte: range.monthEndUTC },
      })
        .sort({ date: -1 })
        .lean(),
      Attendance.findOne({
        code,
        date: { $gte: range.selectedStartUTC, $lte: range.selectedEndUTC },
      }).lean(),
    ]);

    const monthSummary = getEmptyMonthSummary();
    let hoursTotal = 0;
    let hoursCount = 0;

    for (const row of monthEntries) {
      incrementStatusBucket(monthSummary, row.status);

      if (row.punchIn && !row.punchOut) {
        monthSummary.notPunchedOut += 1;
      }

      if (safeNum(row.hoursWorked) > 0) {
        hoursTotal += safeNum(row.hoursWorked);
        hoursCount += 1;
      }
    }

    monthSummary.avgHoursWorked = hoursCount > 0 ? round2(hoursTotal / hoursCount) : 0;

    const entries = monthEntries.map((row) => ({
      _id: row._id,
      date: formatISTDate(row.date),
      status: row.status || "Pending",
      punchIn: row.punchIn ? formatISTTime(row.punchIn) : null,
      punchOut: row.punchOut ? formatISTTime(row.punchOut) : null,
      hoursWorked: round2(row.hoursWorked || 0),
      isManual: !!row.remark,
      remark: row.remark || "",
      punchInCode: row.punchInCode || "",
      punchInName: row.punchInName || "",
      punchOutCode: row.punchOutCode || "",
      punchOutName: row.punchOutName || "",
      punchInLatitude:
        row.punchInLatitude != null ? Number(row.punchInLatitude.toString()) : null,
      punchInLongitude:
        row.punchInLongitude != null ? Number(row.punchInLongitude.toString()) : null,
      punchOutLatitude:
        row.punchOutLatitude != null ? Number(row.punchOutLatitude.toString()) : null,
      punchOutLongitude:
        row.punchOutLongitude != null ? Number(row.punchOutLongitude.toString()) : null,
    }));

    return res.status(200).json({
      success: true,
      message: "Attendance admin employee detail fetched successfully",
      data: {
        viewMode: range.viewMode,
        selectedDate: range.selectedDateKey,
        profile: {
          code,
          name: user?.name || meta?.name || code,
          position: user?.position || "",
          firm_code: meta?.firm_code || "",
          firm_name: firm?.name || meta?.firm_code || "",
        },
        today: getSelectedDayCardFromAttendance(selectedAttendance),
        monthSummary,
        entries,
      },
    });
  } catch (error) {
    console.error("getAttendanceAdminEmployeeDetail error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch attendance admin employee detail",
    });
  }
};
