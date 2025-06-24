const express = require("express");
const { createFirm, createFirms, getHierarchyDataByFirmName, getFirms } = require("../controllers/admin/firmController");
const router = express.Router();


router.post("/create-firm", createFirm);
router.post("/create-firms", createFirms);
router.get("/get-all-firms", getFirms);
module.exports = router;