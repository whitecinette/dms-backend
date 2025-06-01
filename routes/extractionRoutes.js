const express = require('express');
const { addExtractionRecord, getDealerDropdownForExtraction, addExtractionRecordsFromApp, getCurrentMonthExtractionsForUser, getExtractionStatus, getExtractionRecords,getExtractionRecordsForDownload, getExtractionReport, getExtractionReportForAdmin, getExtractionReportForAsm, getExtractionReportForMdd, getHierarchyFilters } = require('../controllers/common/extractionRecordControllers');
const { userAuth } = require('../middlewares/authmiddlewares');
const router = express.Router();

// Define the route
router.post('/add-extraction', addExtractionRecord);
router.get('/get-all-dealers-for-dropdown', getDealerDropdownForExtraction);

router.post("/user/extraction-record/add", userAuth, addExtractionRecordsFromApp);
router.get("/user/get-extraction-records/month", userAuth, getCurrentMonthExtractionsForUser);


router.post("/admin/extraction-status", getExtractionStatus);
// router.get('/admin/get-extraction-for-uploaded-by', getExtractionRecords)
router.get("/admin/get-extraction-records/download",  getExtractionRecordsForDownload);

router.get("/get-extraction-report-for-admin", getExtractionReportForAdmin);
router.get("/get-extraction-report-for-asm", getExtractionReportForAsm);
router.get("/get-extraction-report-for-mdd", getExtractionReportForMdd);
router.get("/get-hierarchy-filter", getHierarchyFilters);
module.exports = router;
