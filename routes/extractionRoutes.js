const express = require('express');
const { addExtractionRecord, getDealerDropdownForExtraction } = require('../controllers/common/extractionRecordControllers');
const router = express.Router();

// Define the route
router.post('/add-extraction', addExtractionRecord);
router.get('/get-all-dealers-for-dropdown', getDealerDropdownForExtraction)

module.exports = router;
