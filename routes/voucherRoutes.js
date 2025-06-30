const express = require("express");
const { getRoutePlansToGenerateVoucher, generateVoucher, getVoucherStatusByDateRange } = require("../controllers/common/voucherController");
const { userAuth } = require("../middlewares/authmiddlewares");
const router = express.Router();

router.post("/generate-voucher", userAuth, generateVoucher);
router.get("/get-route-plan-for-user", getRoutePlansToGenerateVoucher);
router.get("/get-vouchers-for-user", getVoucherStatusByDateRange);
 

module.exports = router;