// routes/metadataRoutes.js
const express = require('express');
const { uploadMetadata, getEmployeesForAttendanceCount, updateMetadata } = require('../controllers/common/metaDataController');
const upload = require("../helpers/multerHelper");
const router = express.Router();
router.post('/upload-metadata', upload.single('file'), uploadMetadata);
router.get('/get-total-employee-count', getEmployeesForAttendanceCount);
// router.put('/update-metadata', updateMetadata);

module.exports = router;
