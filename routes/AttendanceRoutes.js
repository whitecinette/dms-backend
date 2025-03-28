const express = require('express');
const { punchIn, punchOut,  getAttendanceByEmployee, getAttendance, requestLeave,getEmpLeave, getAllEmpLeaves, getAttendanceByDate, getAttendanceByEmployeeForAdmin, getLatestAttendance, editAttendanceByID, downloadAllAttendance, deleteAttendanceByID} = require('../controllers/common/attendanceController');
const { userAuth, adminOrSuperAdminAuth } = require('../middlewares/authmiddlewares');
const { upload } = require("../services/fileUpload");
const upload_img = require('../middlewares/upload');
const router = express.Router();

router.post('/punch-in', upload_img.single('punchInImage'), userAuth, punchIn);
router.post('/punch-out', upload_img.single('punchOutImage'), userAuth, punchOut);


// router.get('/get-attandance', userAuth, getAttendanceByEmployee);
router.get('/get-attendance/:code', getAttendanceByEmployeeForAdmin);
router.get('/get-all-attendance', getAttendance);

// leave
router.post('/request-leave/:employeeId', requestLeave);
router.get('/get-emp-leave/:employeeId', getEmpLeave);
router.get('/get-all-leaves', getAllEmpLeaves)

// router.get('/dealers/:code', getDealersByEmployeeCode);

router.get('/get-attendance-by-date/:date', getAttendanceByDate)
router.get('/get-latest-attendance-by-date', getLatestAttendance)
router.put('/edit-attendance/:id', adminOrSuperAdminAuth, editAttendanceByID)
router.get('/download-all-attendance', adminOrSuperAdminAuth, downloadAllAttendance)
router.delete('/delete-employee-attendance/:id', adminOrSuperAdminAuth, deleteAttendanceByID)

module.exports = router;
