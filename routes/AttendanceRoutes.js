const express = require("express");
const {
  punchIn,
  punchOut,
  getAttendanceForEmployee,
  getAttendance,
  requestLeave,
  getEmpLeave,
  getAllEmpLeaves,
  getAttendanceByDate,
  getAttendanceByEmployeeForAdmin,
  getLatestAttendance,
  editAttendanceByID,
  downloadAllAttendance,
  deleteAttendanceByID,
  getJaipurDealers,
  addAttendanceByAdmin,
  getAddedAttendanceByAdmin
} = require("../controllers/common/attendanceController");
const {
  userAuth,
  adminOrSuperAdminAuth,
  superAdminAuth,
} = require("../middlewares/authmiddlewares");
const { upload } = require("../services/fileUpload");
const upload_img = require("../middlewares/upload");
const router = express.Router();

router.post("/punch-in", upload_img.single("punchInImage"), userAuth, punchIn);
router.post(
  "/punch-out",
  upload_img.single("punchOutImage"),
  userAuth,
  punchOut
);

router.get("/get-attandance", userAuth, getAttendanceForEmployee);
router.get("/get-attendance/:code", getAttendanceByEmployeeForAdmin);
router.get("/get-all-attendance", getAttendance);
// router.get('/dealers/:code', getDealersByEmployeeCode);

router.get("/get-attendance-by-date/:date", userAuth, getAttendanceByDate);
router.get("/get-latest-attendance-by-date", userAuth, getLatestAttendance);
router.put("/edit-attendance/:id", userAuth, editAttendanceByID);
router.get(
  "/download-all-attendance",
  adminOrSuperAdminAuth,
  downloadAllAttendance
);
router.delete(
  "/delete-employee-attendance/:id",
  adminOrSuperAdminAuth,
  deleteAttendanceByID
);

// get jaipur dealers

router.get("/get-jaipur-dealers", getJaipurDealers);

// add attendance by admin
router.post("/add-attendance-by-admin", adminOrSuperAdminAuth, addAttendanceByAdmin);
//get all attendance add by admin
router.get("/get-all-attendance-add-by-admin", superAdminAuth, getAddedAttendanceByAdmin);

module.exports = router;
