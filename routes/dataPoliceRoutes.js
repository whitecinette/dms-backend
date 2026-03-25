const express = require("express");
const { adminOrSuperAdminAuth } = require("../middlewares/authmiddlewares");
const { getUnmappedProducts, getExcludedRawData, getSalesReportFlags, recalculateProductSegmentsByFilter, renameSmartphoneCategoryToSmartPhone, downloadMarketSalesDataDownloadMonthWise, uploadUsersDataFromCsvMaster, recalculateExtractionSegmentsByDateRange } = require("../controllers/new/dataPolice");
const { upload } = require("../services/fileUpload");
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

router.put(
  "/police/rename-smartphone-to-smart-phone",
  adminOrSuperAdminAuth,
  renameSmartphoneCategoryToSmartPhone
);

router.post(
  "/download-market-sales-data-month-wise",
  adminOrSuperAdminAuth,
  downloadMarketSalesDataDownloadMonthWise
);

router.post("/master/update-users-from-csv",
  adminOrSuperAdminAuth,
  upload.single("file"),
  uploadUsersDataFromCsvMaster,
);

router.post(
  "/recalculate-extraction-segments-by-date-range",
  adminOrSuperAdminAuth,
  recalculateExtractionSegmentsByDateRange
);

module.exports = router;