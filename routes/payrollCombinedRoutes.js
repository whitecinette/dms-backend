const express = require('express');
const { getAttendanceMatrix } = require('../controllers/admin/payrollCombinedController');
const router = express.Router();


router.get("/admin/attendance-matrix", getAttendanceMatrix);

module.exports = router;
