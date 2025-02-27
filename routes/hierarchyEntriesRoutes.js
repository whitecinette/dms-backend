const express = require('express');
const multer = require('multer');
const router = express.Router();
const { uploadHierarchyEntries } = require('../controllers/admin/hierarchyEntriesController');
const { upload } = require('../services/fileUpload');


// API Route for CSV Upload
router.post('/hierarchy-entries/upload', upload.single('file'), uploadHierarchyEntries);

module.exports = router;
