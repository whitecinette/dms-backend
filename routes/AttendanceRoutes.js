const express = require('express');
const { markAttendance, getAttendanceByEmployee, getAttendance,requestLeave } = require('../controllers/common/attendanceController');
const router = express.Router();

router.post('/mark-attendance', markAttendance);
router.get('/get-attandance/:employeeId', getAttendanceByEmployee);
router.get('/get-all-attendance', getAttendance);

// leave
router.post('/request-leave',requestLeave);

module.exports = router;
