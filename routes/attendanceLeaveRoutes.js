const express = require('express');
const { punchIn, punchOut,  getAttendanceByEmployee, getAttendance, requestLeave,getEmpLeave, getAllEmpLeaves, getDealersByEmployeeCode} = require('../controllers/common/attendanceLeaveController');
const { userAuth } = require('../middlewares/authmiddlewares');
const { upload } = require("../services/fileUpload");
const upload_img = require('../middlewares/upload');
const router = express.Router();

// punch in punch out routes
router.post('/punch-in', upload_img.single('punchInImage'), userAuth, punchIn);
router.post('/punch-out', upload_img.single('punchOutImage'), userAuth, punchOut);

// get attendance for all and employee
router.get('/get-attandance-by-emp', userAuth, getAttendanceByEmployee);
router.get('/get-all-attendance', getAttendance);

// leave routes
router.post('/request-leave',userAuth, requestLeave);
// router.get('/get-emp-leave', userAuth, getEmpLeave);
// router.get('/get-all-leaves', getAllEmpLeaves)

module.exports = router;
