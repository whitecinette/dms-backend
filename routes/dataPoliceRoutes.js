const express = require("express");
const { adminOrSuperAdminAuth } = require("../middlewares/authmiddlewares");
const { getUnmappedProducts, getExcludedRawData, getSalesReportFlags, recalculateProductSegmentsByFilter } = require("../controllers/new/dataPolice");
const router = express.Router();


router.get("/police/unmapped-products", adminOrSuperAdminAuth, getUnmappedProducts);

router.post(
  "/police/excluded-raw-data",
  adminOrSuperAdminAuth,
  getExcludedRawData
);

router.post(
  "/reports/sales-report-flags",
  adminOrSuperAdminAuth,
  getSalesReportFlags
);

router.put("/police/recalculate-segments-by-filter", 
  adminOrSuperAdminAuth,
  recalculateProductSegmentsByFilter
);


module.exports = router;