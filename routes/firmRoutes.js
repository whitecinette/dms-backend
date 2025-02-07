const express = require("express");
const { createFirm } = require("../controllers/admin/firmController");
const router = express.Router();


router.post("/create-firm", createFirm);

module.exports = router;