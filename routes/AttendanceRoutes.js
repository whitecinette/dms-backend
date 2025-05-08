const express = require('express');
const { punchIn, punchOut,  getAttendanceForEmployee, getAttendance, requestLeave,getEmpLeave, getAllEmpLeaves, getAttendanceByDate, getAttendanceByEmployeeForAdmin, getLatestAttendance, editAttendanceByID, downloadAllAttendance, deleteAttendanceByID, getJaipurDealers} = require('../controllers/common/attendanceController');
const { userAuth, adminOrSuperAdminAuth } = require('../middlewares/authmiddlewares');
const { upload } = require("../services/fileUpload");
const upload_img = require('../middlewares/upload');
const imageCompressor = require('../middlewares/imageCompressor');
const router = express.Router();

router.post('/punch-in', upload_img.single('punchInImage'), imageCompressor, userAuth, punchIn);
router.post('/punch-out', upload_img.single('punchOutImage'), userAuth, imageCompressor, punchOut);


router.get('/get-attandance', userAuth, getAttendanceForEmployee);
router.get('/get-attendance/:code', getAttendanceByEmployeeForAdmin);
router.get('/get-all-attendance', getAttendance);

// leave
router.post('/request-leave/:employeeId', requestLeave);
router.get('/get-emp-leave/:employeeId', getEmpLeave);
router.get('/get-all-leaves', getAllEmpLeaves)

// router.get('/dealers/:code', getDealersByEmployeeCode);

router.get('/get-attendance-by-date/:date', userAuth, getAttendanceByDate)
router.get('/get-latest-attendance-by-date', userAuth, getLatestAttendance)
router.put('/edit-attendance/:id', userAuth, editAttendanceByID)
router.get('/download-all-attendance', adminOrSuperAdminAuth, downloadAllAttendance)
router.delete('/delete-employee-attendance/:id', adminOrSuperAdminAuth, deleteAttendanceByID)


// get jaipur dealers

router.get('/get-jaipur-dealers', getJaipurDealers);
module.exports = router;
