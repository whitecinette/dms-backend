const express = require("express");
const { userAuth } = require("../middlewares/authmiddlewares");
const {
  getMainDashboardOverview,
  getMainDashboardFilterOptions,
} = require("../controllers/new/mainDashboardController");

const router = express.Router();

router.post("/main-dashboard/overview", userAuth, getMainDashboardOverview);
router.post("/main-dashboard/filter-options", userAuth, getMainDashboardFilterOptions);

module.exports = router;
