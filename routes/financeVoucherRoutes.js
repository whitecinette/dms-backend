const express = require('express');
const {upload} = require('../services/fileUpload');
const { uploadFinanceVouchers, getFinanceVouchersForAdmin, getFinanceSummaryForUser, getFinanceOutstandingBreakup } = require('../controllers/admin/financeVoucherController');
const { userAuth } = require('../middlewares/authmiddlewares');
const router = express.Router();

router.post("/finance-voucher/upload", upload.single("file"), uploadFinanceVouchers);
router.get("/finance-voucher/get", getFinanceVouchersForAdmin);

router.get("/finance/finance-overview", userAuth, getFinanceSummaryForUser);
router.get("/finance/outstanding-breakup", userAuth, getFinanceOutstandingBreakup);

module.exports = router;