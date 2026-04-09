const express = require("express");
const { userAuth } = require("../middlewares/authmiddlewares");
const {
  getMarketCoverageDashboardRoles,
  getMarketCoverageDashboardOverview,
  getMarketCoverageDashboardDropdown,
  getMarketCoverageDashboardReport,
  getMarketCoverageDashboardAnalytics,
} = require("../controllers/admin/marketCoverageAdminController");

const router = express.Router();

router.get("/admin/market-coverage/dashboard/roles", userAuth, getMarketCoverageDashboardRoles);
router.post("/admin/market-coverage/dashboard/overview", userAuth, getMarketCoverageDashboardOverview);
router.get("/admin/market-coverage/dashboard/dropdown", userAuth, getMarketCoverageDashboardDropdown);
router.post("/admin/market-coverage/dashboard/report", userAuth, getMarketCoverageDashboardReport);
router.post("/admin/market-coverage/dashboard/analytics", userAuth, getMarketCoverageDashboardAnalytics);

module.exports = router;
