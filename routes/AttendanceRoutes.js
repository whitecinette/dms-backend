const express = require('express');
const { punchIn, punchOut,  getAttendanceByEmployee, getAttendance, requestLeave,getEmpLeave, getAllEmpLeaves, getDealersByEmployeeCode} = require('../controllers/common/attendanceController');
const { userAuth } = require('../middlewares/authmiddlewares');
const { upload } = require("../services/fileUpload");
const upload_img = require('../middlewares/upload');
const router = express.Router();

router.post('/punch-in', upload_img.single('punchInImage'), userAuth, punchIn);
router.post('/punch-out', userAuth, punchOut)

router.get('/get-attandance/:employeeId', getAttendanceByEmployee);
router.get('/get-all-attendance', getAttendance);

// leave
router.post('/request-leave/:employeeId', requestLeave);
router.get('/get-emp-leave/:employeeId', getEmpLeave);
router.get('/get-all-leaves', getAllEmpLeaves)

// router.get('/dealers/:code', getDealersByEmployeeCode);
module.exports = router;
