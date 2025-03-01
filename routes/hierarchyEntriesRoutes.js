const express = require('express');
const multer = require('multer');
const router = express.Router();
const { uploadHierarchyEntries } = require('../controllers/admin/hierarchyEntriesController');
const { upload } = require('../services/fileUpload');
const { getSubordinatesByCode, getSubordinatesForUser } = require('../controllers/common/hierarchyEntriesController');
const { userAuth } = require('../middlewares/authmiddlewares');

// admin 
// API Route for CSV Upload
router.post('/hierarchy-entries/upload', upload.single('file'), uploadHierarchyEntries);

// common 
router.get('/user/get-subordinates-by-code', getSubordinatesByCode);
router.get("/user/get-subordinates", userAuth, getSubordinatesForUser);

module.exports = router;
