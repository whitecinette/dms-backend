const express = require('express');
const {upload} = require('../services/fileUpload');
const { uploadFinanceVouchers, getFinanceVouchersForAdmin } = require('../controllers/admin/financeVoucherController');
const router = express.Router();

router.post("/finance-voucher/upload", upload.single("file"), uploadFinanceVouchers);
router.get("/finance-voucher/get", getFinanceVouchersForAdmin);

module.exports = router;