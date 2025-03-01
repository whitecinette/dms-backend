const express = require('express');
const { upload } = require('../services/fileUpload');
const { uploadSalesDataThroughCSV } = require('../controllers/admin/salesdataController');
const { getSalesReportByCode, getDashboardSalesMetricsByCode, getSalesReportForUser, getDashboardSalesMetricsForUser } = require('../controllers/common/salesDataController');
const { userAuth } = require('../middlewares/authmiddlewares');
const router = express.Router();

router.post("/sales-data/upload/csv", upload.single("file"), uploadSalesDataThroughCSV);

// common 
router.post("/user/sales-data/report/by-code", getSalesReportByCode);
router.post("/user/sales-data/report/self", userAuth, getSalesReportForUser);
router.post("/user/sales-data/dashboard/metrics/by-code", getDashboardSalesMetricsByCode);
router.post("/user/sales-data/dashboard/metrics/self", userAuth, getDashboardSalesMetricsForUser);

module.exports = router;