const express = require('express');
const { upload } = require('../services/fileUpload');
const { uploadSalesDataThroughCSV } = require('../controllers/admin/salesdataController');
const { getSalesReport } = require('../controllers/common/salesDataController');
const router = express.Router();

router.post("/sales-data/upload/csv", upload.single("file"), uploadSalesDataThroughCSV);
router.post("/sales-data/report", getSalesReport);

module.exports = router;