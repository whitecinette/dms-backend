const express = require('express');
const { uploadTotalSegmentChannelTargetsThroughCSV } = require('../controllers/admin/targetController');
const { upload } = require('../services/fileUpload');
const router = express.Router();

router.post("/targets/upload/csv", upload.single("file"), uploadTotalSegmentChannelTargetsThroughCSV );

module.exports = router;
