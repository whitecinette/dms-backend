const express = require('express');
const { upload } = require('../services/fileUpload');
const { userAuth } = require('../middlewares/authmiddlewares');
const { uploadFinanceData } = require('../controllers/admin/financeUploadController');
const router = express.Router();

// Define the route
router.post('/finance/upload-data', uploadFinanceData);

module.exports = router;
