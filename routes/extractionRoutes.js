const express = require('express');
const { addExtractionRecord } = require('../controllers/common/extractionRecordControllers');
const router = express.Router();

// Define the route
router.post('/add-extraction', addExtractionRecord);

module.exports = router;
