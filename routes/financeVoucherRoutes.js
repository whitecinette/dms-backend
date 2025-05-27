const express = require('express');
const {upload} = require('../services/fileUpload');
const { uploadFinanceVouchers, getFinanceVouchersForAdmin, getFinanceSummaryForUser, getFinanceOutstandingBreakup, getDebitNotesForPC, getInvoicesForPC, getCreditNotesForPC } = require('../controllers/admin/financeVoucherController');
const { userAuth } = require('../middlewares/authmiddlewares');
const { getCreditNotesForMdd } = require('../controllers/admin/financeUploadController');
const router = express.Router();

router.post("/finance-voucher/upload", upload.single("file"), uploadFinanceVouchers);
router.get("/finance-voucher/get", getFinanceVouchersForAdmin);

router.get("/finance/finance-overview", userAuth, getFinanceSummaryForUser);
router.get("/finance/outstanding-breakup", userAuth, getFinanceOutstandingBreakup);
router.get("/finance/pc/credit-notes", userAuth, getCreditNotesForPC);
router.get("/finance/pc/debit-notes", userAuth, getDebitNotesForPC);
router.get("/finance/pc/invoices", userAuth, getInvoicesForPC);


module.exports = router;