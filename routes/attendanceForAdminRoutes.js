const express = require("express");
const router = express.Router();

const {
  getAttendanceAdminFilters,
  getAttendanceAdminOverview,
  getAttendanceAdminEmployees,
  getAttendanceAdminEmployeeDetail,
} = require("../controllers/admin/attendanceForAdminController");

const { userAuth, attendanceAdminAccess } = require("../middlewares/authmiddlewares");

router.get(
  "/attendance-admin/filters",
  userAuth,
  attendanceAdminAccess,
  getAttendanceAdminFilters
);

router.post(
  "/attendance-admin/overview",
  userAuth,
  attendanceAdminAccess,
  getAttendanceAdminOverview
);

router.post(
  "/attendance-admin/employees",
  userAuth,
  attendanceAdminAccess,
  getAttendanceAdminEmployees
);

router.get(
  "/attendance-admin/employee/:code",
  userAuth,
  attendanceAdminAccess,
  getAttendanceAdminEmployeeDetail
);

module.exports = router;