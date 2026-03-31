// controllers/common/dynamicDashboardController.js

const MetaData = require("../../model/MetaData");

const getBaseDashboard = (user) => ({
  greeting: "Good Morning",
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

  salesTrend: [
    { label: "Mon", value: 0 },
    { label: "Tue", value: 0 },
    { label: "Wed", value: 0 },
    { label: "Thu", value: 0 },
    { label: "Fri", value: 0 },
    { label: "Sat", value: 0 },
    { label: "Sun", value: 0 },
  ],

  brandMix: [],
  topProducts: [],
  quickActions: [],
  notifications: [],
});

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
      {
        title: "Sales Dashboard",
        route: "sales_dashboard_new",
        clickable: true,
        icon: "barChart2",
      },
      {
        title: "Extraction Status",
        route: "extraction_status_new",
        clickable: true,
        icon: "clipboardList",
      },
      {
        title: "Extraction Report",
        route: "extraction_report",
        clickable: true,
        icon: "fileText",
      },
      {
        title: "Add Data",
        route: "extraction_add",
        clickable: true,
        icon: "plusCircle",
      },
      {
        title: "Route Plan",
        route: "route_plan",
        clickable: true,
        icon: "route",
      },
      {
        title: "Market Coverage",
        route: "market_coverage",
        clickable: true,
        icon: "mapPin",
      },
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

const asmDashboard = (user) => {
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
      {
        title: "Add Extraction",
        route: "extraction_add",
        clickable: true,
        icon: "plusCircle",
      },
      {
        title: "Market Coverage",
        route: "market_coverage_mark",
        clickable: true,
        icon: "route",
      },
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
      {
        title: "Add Extraction",
        route: "extraction_add",
        clickable: true,
        icon: "plusCircle",
      },
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

    notifications: [
      {
        title: "Welcome",
        message: "Your dashboard is being prepared.",
        type: "info",
      },
    ],
  };
};

exports.getDynamicDashboard = async (req, res) => {
  try {
    console.log("Reaching dynamic dash asm");

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
    } else if (["asm", "tse"].includes(position)) {
      dashboard = asmDashboard(user);
    } else if (position === "mdd") {
      dashboard = mddDashboard(user);
    } else {
      dashboard = defaultDashboard(user);
    }

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

const orionAsmDashboard = (user) => {
  const base = getBaseDashboard(user);
  console.log("Orion ASM")

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
        title: "Punch In / Out",
        route: "attendance",
        clickable: true,
        icon: "plusCircle",
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