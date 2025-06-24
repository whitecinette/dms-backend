const express = require('express');
const multer = require('multer');
const router = express.Router();
const { uploadHierarchyEntries, getHierarchEntriesForAdmin, editHierarchEntriesByAdmin, deleteHierarchEntriesByAdmin, addHierarchEntriesByAdmin, updateHierarchyEntries} = require('../controllers/admin/hierarchyEntriesController');
const { upload } = require('../services/fileUpload');
const { getSubordinatesByCode, getSubordinatesForUser, getDealersForUser, getHierarchyDataByFirmName } = require('../controllers/common/hierarchyEntriesController');
const { userAuth, adminOrSuperAdminAuth } = require('../middlewares/authmiddlewares');

// admin 
// API Route for CSV Upload
router.post('/hierarchy-entries/upload', upload.single('file'), uploadHierarchyEntries);
router.get("/hierarchy-entries/get-hierarchy-entries-for-admin", getHierarchEntriesForAdmin)
router.put("/hierarchy-entries/edit-hierarchy-entries-by-admin/:id", adminOrSuperAdminAuth, editHierarchEntriesByAdmin)
router.delete("/hierarchy-entries/delete-hierarchy-entries-by-admin/:id", adminOrSuperAdminAuth, deleteHierarchEntriesByAdmin)
router.post("/hierarchy-entries/add-hierarchy-entries-by-admin", adminOrSuperAdminAuth, addHierarchEntriesByAdmin)

// common 
router.post('/user/get-subordinates-by-code', getSubordinatesByCode);
router.post("/user/get-subordinates", userAuth, getSubordinatesForUser);

router.get("/user/get-dealers", userAuth, getDealersForUser);

router.put('/update-hierarchy-entries', userAuth, upload.single('file'),updateHierarchyEntries);
router.get("/get-flow-data", getHierarchyDataByFirmName);
module.exports = router;
