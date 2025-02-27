const express = require('express');
const { punchIn, punchOut,  getAttendanceByEmployee, getAttendance, requestLeave,getEmpLeave, getAllEmpLeaves, getDealersByEmployeeCode } = require('../controllers/common/attendanceController');
const router = express.Router();

router.post('/punch-in/:code', punchIn);
router.post('/punch-out/:code',punchOut)

router.get('/get-attandance/:employeeId', getAttendanceByEmployee);
router.get('/get-all-attendance', getAttendance);

// leave
router.post('/request-leave/:employeeId', requestLeave);
router.get('/get-emp-leave/:employeeId', getEmpLeave);
router.get('/get-all-leaves', getAllEmpLeaves)

// router.get('/dealers/:code', getDealersByEmployeeCode);
module.exports = router;
