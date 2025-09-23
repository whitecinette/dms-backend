const express = require('express');
const { upload } = require('../services/fileUpload');
const { uploadSalesDataThroughCSV, getSalesDataToAdmin } = require('../controllers/admin/salesDataController');
const { getSalesReportByCode, getDashboardSalesMetricsByCode, getSalesReportForUser,  getDashboardSalesMetricsForUser, masterSalesAPI, getSalesWithHierarchyCSV, getSalesReportProductWise, fixAbove100KSegment } = require('../controllers/common/salesDataController');
const { userAuth, authMiddleware, adminOrSuperAdminAuth } = require('../middlewares/authmiddlewares');
const router = express.Router();

router.post("/sales-data/upload/csv", upload.single("file"), uploadSalesDataThroughCSV);

// common 
router.post("/user/sales-data/report/by-code", getSalesReportByCode);
router.post("/user/sales-data/dashboard/metrics/by-code", getDashboardSalesMetricsByCode);


router.post("/user/sales/master", authMiddleware, masterSalesAPI);

router.get("/sales/hierarchy/csv", getSalesWithHierarchyCSV);

// final apis 
router.post("/user/sales-data/report/self", userAuth, getSalesReportForUser);
router.post("/user/sales-data/dashboard/metrics/self", userAuth, getDashboardSalesMetricsForUser);
router.post("/user/sales-data/product-wise", userAuth, getSalesReportProductWise);


router.get("/admin/getSalesRecords", adminOrSuperAdminAuth, getSalesDataToAdmin);

router.get("/super-admin/fix-100k-in-mddwise", fixAbove100KSegment);

module.exports = router;