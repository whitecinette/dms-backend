const express = require("express");
const { userAuth } = require("../middlewares/authmiddlewares");
const {
  getMarketCoverageDashboardRoles,
  getMarketCoverageDashboardOverview,
} = require("../controllers/admin/marketCoverageAdminController");

const router = express.Router();

router.get("/admin/market-coverage/dashboard/roles", userAuth, getMarketCoverageDashboardRoles);
router.post("/admin/market-coverage/dashboard/overview", userAuth, getMarketCoverageDashboardOverview);

module.exports = router;
