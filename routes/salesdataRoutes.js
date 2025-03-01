const express = require('express');
const { upload } = require('../services/fileUpload');
const { uploadSalesDataThroughCSV } = require('../controllers/admin/salesdataController');
const { getSalesReport, getDashboardSalesMetrics } = require('../controllers/common/salesDataController');
const router = express.Router();

router.post("/sales-data/upload/csv", upload.single("file"), uploadSalesDataThroughCSV);
router.post("/sales-data/report", getSalesReport);
router.post("/sales-data/dashboard/metrics", getDashboardSalesMetrics);

module.exports = router;