const express = require("express");
const { createFirm, createFirms, getHierarchyDataByFirmName, getFirms, getAttendanceByfirms, getAttendanceByFirms, getAttendanceCountByFirms } = require("../controllers/admin/firmController");
const router = express.Router();


// router.post("/create-firm", createFirm);
router.post("/create-firm", createFirm); //nameera
router.get("/get-all-firms", getFirms); //nameera
router.get("/get-attendance-count-by-firms", getAttendanceCountByFirms);
module.exports = router;