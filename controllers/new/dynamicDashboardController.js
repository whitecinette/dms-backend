// controllers/common/dynamicDashboardController.js

const MetaData = require("../../model/MetaData");
const Attendance = require("../../model/Attendance"); // <-- change path only if needed

// ================= HELPERS =================
const getISTNow = () =>
  new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));

const getGreeting = () => {
  const now = getISTNow();
  const hour = now.getHours();

  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
};

const countWorkingDaysElapsed = (year, month, todayDate) => {
  let total = 0;

  for (let day = 1; day <= todayDate; day++) {
    const d = new Date(Date.UTC(year, month, day));
    const weekDay = d.getUTCDay(); // 0 = Sunday

    if (weekDay !== 0) {
      total += 1;
    }
  }

  return total;
};

const getAttendanceOverview = async (code) => {
  const nowIST = getISTNow();
  const year = nowIST.getFullYear();
  const month = nowIST.getMonth();
  const todayDate = nowIST.getDate();

  const monthStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const todayStart = new Date(Date.UTC(year, month, todayDate, 0, 0, 0, 0));
  const todayEnd = new Date(Date.UTC(year, month, todayDate, 23, 59, 59, 999));
  const todayKey = todayStart.toISOString().slice(0, 10);

  const records = await Attendance.find({
    code,
    date: { $gte: monthStart, $lte: todayEnd },
  })
    .sort({ date: 1 })
    .lean();

  const presentDaysSet = new Set();

  for (const record of records) {
    const status = String(record.status || "").toLowerCase();

    const isPresentLike =
      !!record.punchIn ||
      Number(record.hoursWorked || 0) > 0 ||
      status === "present" ||
      status === "half day";

    if (isPresentLike && record.date) {
      const dayKey = new Date(record.date).toISOString().slice(0, 10);
      presentDaysSet.add(dayKey);
    }
  }

  const todayRecord = records.find((record) => {
    if (!record.date) return false;
    return new Date(record.date).toISOString().slice(0, 10) === todayKey;
  });

  const currentlyPunchedIn = !!todayRecord?.punchIn && !todayRecord?.punchOut;

  const present = presentDaysSet.size;
  const total = countWorkingDaysElapsed(year, month, todayDate);
  const percentage =
    total > 0 ? Number(((present / total) * 100).toFixed(1)) : 0;

  return {
    punchIn: currentlyPunchedIn,
    attendance: {
      present,
      total,
      percentage,
    },
  };
};

// ================= BASE =================
const getBaseDashboard = (user) => ({
  greeting: getGreeting(),
  quote: "Track progress, close gaps, and grow smarter every day.",
  punchIn: false,

  userInfo: {
    name: user?.name || "",
    code: user?.code || "",
    role: user?.role || "",
    position: user?.position || "",
    firm: user?.firm_code || "",
  },

  visibleSections: [],

  attendance: {
    present: 0,
    total: 0,
    percentage: 0,
  },

  sales: {
    mtdValue: "₹0",
    mtdVolume: "0",
    growth: 0,
    targetAch: 0,
  },

  routes: {
    planned: 0,
    completed: 0,
    pending: 0,
    coverage: 0,
  },

  extraction: {
    total: 0,
    done: 0,
    pending: 0,
    donePercent: 0,
  },

  salesTrend: [],
  brandMix: [],
  topProducts: [],
  quickActions: [],
  notifications: [],
});

// ================= ADMIN =================
const adminDashboard = (user) => {
  const base = getBaseDashboard(user);

  return {
    ...base,
    visibleSections: [
      "hero_header",
      "attendance",
      "top_kpis",
      "sales_overview",
      "extraction_status",
      "brand_mix",
      "top_products",
      "quick_actions",
      "notifications",
    ],

    quickActions: [
      { title: "Sales Dashboard", route: "sales_dashboard_new", icon: "barChart2" },
      {
        title: "Attendance Dashboard",
        route: "attendance_admin_dashboard",
        icon: "calendarCheck2",
      },
      { title: "Extraction Status", route: "extraction_status_new", icon: "clipboardList" },
      { title: "Extraction Report", route: "extraction_report", icon: "fileText" },
      { title: "Add Data", route: "extraction_add", icon: "plusCircle" },
      { title: "Route Plan", route: "route_plan", icon: "route" },
      { title: "Coverage Dashboard", route: "market_coverage", icon: "map" },
      { title: "Market Coverage", route: "market_coverage_mark", icon: "mapPin" },
      { title: "My Timeline", route: "market_timeline_self", icon: "calendarCheck2" },
      { title: "Geotagging", route: "geo_tagging", icon: "map" },
      { title: "Punch In / Out", route: "punch_in_out", icon: "fingerprint" },
    ],

    notifications: [
      {
        title: "Welcome",
        message: "Dashboard loaded successfully.",
        type: "info",
      },
    ],
  };
};

// ================= ASM =================
const asmDashboard = (user) => {
  const base = getBaseDashboard(user);

  return {
    ...base,
    visibleSections: [
      "hero_header",
      "attendance",
      "top_kpis",
      "sales_overview",
      "extraction_status",
      "quick_actions",
      "notifications",
    ],

    quickActions: [
      { title: "Add Extraction", route: "extraction_add", icon: "plusCircle" },
      { title: "Extraction Status", route: "extraction_status_new", icon: "clipboardList" },
      { title: "Coverage Dashboard", route: "market_coverage", icon: "map" },
      { title: "Market Coverage", route: "market_coverage_mark", icon: "mapPin" },
      { title: "My Timeline", route: "market_timeline_self", icon: "calendarCheck2" },
      { title: "Geotagging", route: "geo_tagging", icon: "map" },
      { title: "Route Plan", route: "route_plan", icon: "route" },
      { title: "Punch In / Out", route: "punch_in_out", icon: "fingerprint" },
    ],

    notifications: [
      {
        title: "Reminder",
        message: "Please complete today’s planned activities.",
        type: "info",
      },
    ],
  };
};

// ================= MDD =================
const mddDashboard = (user) => {
  const base = getBaseDashboard(user);

  return {
    ...base,
    visibleSections: [
      "hero_header",
      "attendance",
      "top_kpis",
      "sales_overview",
      "quick_actions",
      "notifications",
    ],

    quickActions: [
      { title: "Add Extraction", route: "extraction_add", icon: "plusCircle" },
      { title: "Coverage Dashboard", route: "market_coverage", icon: "map" },
      { title: "My Timeline", route: "market_timeline_self", icon: "calendarCheck2" },
      { title: "Route Plan", route: "route_plan", icon: "route" },
      { title: "Punch In / Out", route: "punch_in_out", icon: "fingerprint" },
    ],

    notifications: [
      {
        title: "Reminder",
        message: "Keep your extraction updates timely.",
        type: "info",
      },
    ],
  };
};

// ================= ORION ASM =================
const orionAsmDashboard = (user) => {
  const base = getBaseDashboard(user);

  return {
    ...base,

    visibleSections: [
      "hero_header",
      "attendance",
      "quick_actions",
      "notifications",
    ],

    quickActions: [
      {
        title: "Coverage Dashboard",
        route: "market_coverage",
        icon: "map",
      },
      {
        title: "My Timeline",
        route: "market_timeline_self",
        icon: "calendarCheck2",
      },
      {
        title: "Punch In / Out",
        route: "punch_in_out",
        icon: "fingerprint",
      },
    ],

    notifications: [
      {
        title: "ORION ASM",
        message: "Complete attendance and market visits daily.",
        type: "info",
      },
    ],
  };
};

// ================= DEFAULT =================
const defaultDashboard = (user) => {
  const base = getBaseDashboard(user);

  return {
    ...base,
    visibleSections: [
      "hero_header",
      "attendance",
      "quick_actions",
      "notifications",
    ],

    quickActions: [
      { title: "Coverage Dashboard", route: "market_coverage", icon: "map" },
      { title: "My Timeline", route: "market_timeline_self", icon: "calendarCheck2" },
      { title: "Profile", route: "profile", icon: "user" },
      { title: "Punch In / Out", route: "punch_in_out", icon: "fingerprint" },
    ],

    notifications: [
      {
        title: "Welcome",
        message: "Your dashboard is being prepared.",
        type: "info",
      },
    ],
  };
};

const tseSoDashboard = (user) => {
  const base = getBaseDashboard(user);

  return {
    ...base,
    visibleSections: [
      "hero_header",
      "attendance",
      "quick_actions",
      "notifications",
    ],
    quickActions: [
      { title: "Add Extraction", route: "extraction_add", icon: "plusCircle" },
      { title: "Market Coverage", route: "market_coverage_mark", icon: "mapPin" }, // <-- add this
      { title: "My Timeline", route: "market_timeline_self", icon: "calendarCheck2" },
      { title: "Geotagging", route: "geo_tagging", icon: "map" },
      { title: "Route Plan", route: "route_plan", icon: "route" },
      { title: "Punch In / Out", route: "punch_in_out", icon: "fingerprint" },
    ],
    notifications: [
      {
        title: "Reminder",
        message: "Use timeline to track your market visits.",
        type: "info",
      },
    ],
  };
};

// ================= MAIN CONTROLLER =================
exports.getDynamicDashboard = async (req, res) => {
  try {
    console.log("Reaching dynamic dash");

    const authUser = req.user;

    const metadata = await MetaData.findOne({ code: authUser.code }).lean();

    const user = {
      ...authUser,
      name: metadata?.name || authUser?.name || "",
      code: metadata?.code || authUser?.code || "",
      role: metadata?.role || authUser?.role || "",
      position: metadata?.position || authUser?.position || "",
      firm_code: metadata?.firm_code || authUser?.firm_code || "",
    };

    const role = (user.role || "").toLowerCase();
    const position = (user.position || "").toLowerCase();
    const firm = (user.firm_code || "").toUpperCase();

    let dashboard;

    if (["admin", "super_admin"].includes(role)) {
      dashboard = adminDashboard(user);
    } else if (firm === "ORION" && position === "asm") {
      dashboard = orionAsmDashboard(user);
    } else if (position === "asm") {
      dashboard = asmDashboard(user);
    } else if (["tse", "so"].includes(position)) {
      dashboard = tseSoDashboard(user);
    } else if (position === "mdd") {
      dashboard = mddDashboard(user);
    } else {
      dashboard = defaultDashboard(user);
    }

    const attendanceOverview = await getAttendanceOverview(user.code);

    dashboard = {
      ...dashboard,
      greeting: getGreeting(),
      punchIn: attendanceOverview.punchIn,
      attendance: attendanceOverview.attendance,
    };

    return res.json({
      success: true,
      dashboard,
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load dashboard",
    });
  }
};
