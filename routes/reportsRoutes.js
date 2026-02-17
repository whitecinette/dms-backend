const express = require("express");
const {userAuth} = require("../middlewares/authmiddlewares");
const { getDashboardSummary } = require("../controllers/new/reportsController");

const router = express.Router();

router.post("/reports/dashboard-summary", userAuth, getDashboardSummary);

module.exports = router;