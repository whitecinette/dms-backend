// routes/metadataRoutes.js
const express = require('express');
const { uploadMetadata, getEmployeesForAttendanceCount, updateMetadata, listMetadata, bulkUpsertMetadata, downloadMetadata, cleanExtraTimestamps, bulkUpdateLeavesConfig } = require('../controllers/common/metaDataController');
const upload = require("../helpers/multerHelper");
const router = express.Router();


router.post('/upload-metadata', upload.single('file'), uploadMetadata);
router.get('/get-total-employee-count', getEmployeesForAttendanceCount);

router.get('/metadata/list', listMetadata);
router.put('/upsert-metadata', upload.single('file'), bulkUpsertMetadata);
router.get("/metadata/download", downloadMetadata);
router.delete("/metadata/clean-timestamps", cleanExtraTimestamps);

router.put("/leaves-config/bulk/edit", bulkUpdateLeavesConfig);

module.exports = router;
