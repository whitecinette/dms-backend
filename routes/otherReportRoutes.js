const express = require("express");
const {userAuth} = require("../middlewares/authmiddlewares");
const { getTopSellingBySegment } = require("../controllers/new/otherReportController");

const router = express.Router();

router.get("/other-reports/samsung/top-selling-products", userAuth, getTopSellingBySegment);

module.exports = router;