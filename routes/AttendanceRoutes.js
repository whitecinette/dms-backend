const express = require('express');
const { markAttendance, getAttendanceByEmployee, getAttendance, requestLeave,getEmpLeave, getAllEmpLeaves } = require('../controllers/common/attendanceController');
const router = express.Router();

router.post('/mark-attendance', markAttendance);
router.get('/get-attandance/:employeeId', getAttendanceByEmployee);
router.get('/get-all-attendance', getAttendance);

// leave
router.post('/request-leave/:employeeId', requestLeave);
router.get('/get-emp-leave/:employeeId', getEmpLeave);
router.get('/get-all-leaves', getAllEmpLeaves)
module.exports = router;
