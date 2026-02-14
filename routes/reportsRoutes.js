const express = require("express");
const {userAuth} = require("../middlewares/authmiddlewares");
const { getReportSummary } = require("../controllers/new/reportsController");

const router = express.Router();

router.post("/reports/summary", userAuth, getReportSummary);

module.exports = router;