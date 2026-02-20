const express = require('express');
const { userAuth, adminOrSuperAdminAuth } = require('../middlewares/authmiddlewares');
const { uploadExternalExtraction, deleteExtractionData, shiftExtractionMonth } = require('../controllers/new/extractionTestController');
const {upload} = require("../services/fileUpload");

const router = express.Router();

router.post(
  "/upload-external-extraction", adminOrSuperAdminAuth, upload.single("file"), uploadExternalExtraction
);

router.post(
  "/delete-external-extraction", adminOrSuperAdminAuth,
  deleteExtractionData  
);

router.post(
  "/shift-extraction-month",
  adminOrSuperAdminAuth, shiftExtractionMonth
);

module.exports = router;