const express = require("express");
const {userAuth} = require("../middlewares/authmiddlewares");
const {
  getDashboardSummary,
  getDashboardSummaryDrilldown,
} = require("../controllers/new/reportsController");

const router = express.Router();

router.post("/reports/dashboard-summary", userAuth, getDashboardSummary);
router.post("/reports/dashboard-summary/drilldown", userAuth, getDashboardSummaryDrilldown);

module.exports = router;
