// routes/metadataRoutes.js
const express = require('express');
const { uploadMetadata, getEmployeesForAttendanceCount } = require('../controllers/common/metaDataController');
const upload = require("../helpers/multerHelper");
const router = express.Router();
router.post('/upload-metadata', upload.single('file'), uploadMetadata);
router.get('/get-total-employee', getEmployeesForAttendanceCount);

module.exports = router;
