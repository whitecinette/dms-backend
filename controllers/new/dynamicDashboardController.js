// controllers/common/dynamicDashboardController.js

const getBaseDashboard = (user) => ({
  greeting: "Good Morning",
  userInfo: {
    name: user?.name || "",
    code: user?.code || "",
    role: user?.role || "",
    position: user?.position || "",
  },

  visibleSections: [],

  stats: [
    { title: "MTD Sales", value: "₹0", clickable: false },
    { title: "Active Dealers", value: "0", clickable: false },
  ],

  salesTrend: [
    { label: "Mon", value: 0 },
    { label: "Tue", value: 0 },
    { label: "Wed", value: 0 },
    { label: "Thu", value: 0 },
    { label: "Fri", value: 0 },
    { label: "Sat", value: 0 },
    { label: "Sun", value: 0 },
  ],

  extractionStatus: {
    total: 0,
    done: 0,
    pending: 0,
  },

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
    console.log("Reaching dynamic dash");

    const user = req.user;
    let dashboard;

    if (["admin", "super_admin"].includes(user.role)) {
      dashboard = adminDashboard(user);
    } else if (["asm", "tse"].includes((user.position || "").toLowerCase())) {
      dashboard = asmDashboard(user);
    } else if ((user.position || "").toLowerCase() === "mdd") {
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