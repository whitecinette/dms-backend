const express = require("express");
const router = express.Router();
const { getUpdatedData } = require("../controllers/admin/updatedController");

router.get("/updated-data/geo-tag", getUpdatedData);

module.exports = router;
