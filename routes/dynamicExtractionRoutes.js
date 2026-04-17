const express = require('express');
const { userAuth, adminOrSuperAdminAuth, sessionGuard } = require('../middlewares/authmiddlewares');
const { getExtractionGroupingOptions, getExtractionFilterValues, getDynamicExtractionReportForAdmin } = require('../controllers/new/dynamicExtractionController');
const router = express.Router();

// routes/extractionRoutes.js

router.get(
  "/grouping-options",
  userAuth,
  getExtractionGroupingOptions
);

router.get(
  "/filter-values",
  adminOrSuperAdminAuth,
  getExtractionFilterValues
);

router.get(
  "/dynamic-report",
  adminOrSuperAdminAuth,
  getDynamicExtractionReportForAdmin
);

module.exports = router;
module.exports = router;