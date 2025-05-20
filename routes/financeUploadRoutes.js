const express = require('express');
const { upload } = require('../services/fileUpload');
const { userAuth } = require('../middlewares/authmiddlewares');
const { uploadFinanceData, getMainLabels, getFinanceDetailsByLabel } = require('../controllers/admin/financeUploadController');
const router = express.Router();

// Define the route
router.post('/finance/upload-data', uploadFinanceData);
router.get("/finance/main-labels", getMainLabels);
router.get("/finance/details/:label", getFinanceDetailsByLabel);



module.exports = router;
