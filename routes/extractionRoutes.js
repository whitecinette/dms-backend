const express = require('express');
const { addExtractionRecord, getDealerDropdownForExtraction, addExtractionRecordsFromApp, getCurrentMonthExtractionsForUser, getExtractionStatus } = require('../controllers/common/extractionRecordControllers');
const { userAuth } = require('../middlewares/authmiddlewares');
const router = express.Router();

// Define the route
router.post('/add-extraction', addExtractionRecord);
router.get('/get-all-dealers-for-dropdown', getDealerDropdownForExtraction);

router.post("/user/extraction-record/add", userAuth, addExtractionRecordsFromApp);
router.get("/user/get-extraction-records/month", userAuth, getCurrentMonthExtractionsForUser);


router.post("/admin/extraction-status", getExtractionStatus);

module.exports = router;
