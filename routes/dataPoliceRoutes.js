const express = require("express");
const { adminOrSuperAdminAuth } = require("../middlewares/authmiddlewares");
const { getUnmappedProducts, getExcludedRawData, getSalesReportFlags } = require("../controllers/new/dataPolice");
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



module.exports = router;