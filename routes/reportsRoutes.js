const express = require("express");
const {userAuth} = require("../middlewares/authmiddlewares");
const {
  getDashboardSummary,
  getDashboardSummaryDrilldown,
  getDropdownOptions,
  getDashboardSummaryBatch,
  getSalesDashboardGroupingOptions,
} = require("../controllers/new/reportsController");

const router = express.Router();

router.post("/reports/dashboard-summary", userAuth, getDashboardSummary);
router.post("/reports/dashboard-summary/drilldown", userAuth, getDashboardSummaryDrilldown);
router.post("/filters/dropdown-options", userAuth, getDropdownOptions);
router.post("/reports/dashboard-summary-batch", userAuth, getDashboardSummaryBatch);
router.get("/reports/sales-dashboard/grouping-options", userAuth, getSalesDashboardGroupingOptions);

module.exports = router;
