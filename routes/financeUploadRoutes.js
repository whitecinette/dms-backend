const express = require('express');
const { userAuth, adminOrSuperAdminAuth } = require('../middlewares/authmiddlewares');
const { uploadFinanceData, getMainLabels, getFinanceDetailsByLabel, deleteFinanceByLabel } = require('../controllers/admin/financeUploadController');
const upload = require('../services/multerMemory');
const router = express.Router();

// Define the route
router.post('/finance/upload-data', upload.single("file"),uploadFinanceData);
router.get("/finance/main-labels", getMainLabels);
router.get("/finance/details/:label", getFinanceDetailsByLabel);
router.delete("/finance/delete/:label", adminOrSuperAdminAuth, deleteFinanceByLabel);



module.exports = router;
