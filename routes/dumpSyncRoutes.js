const express = require("express");
const { upload } = require("../services/fileUpload");
const { adminOrSuperAdminAuth } = require("../middlewares/authmiddlewares");

const {
  uploadSamsungDumpProducts,
  syncMddDealerFromDump,
  uploadTopDealerFromCsv,
} = require("../controllers/new/dumpSyncController");

const router = express.Router();

// POST /dump-sync/samsung-products/upload?dryRun=true
router.post(
  "/dump-sync/samsung-products/upload",
  upload.single("file"),
  adminOrSuperAdminAuth,
  uploadSamsungDumpProducts
);

router.post(
  "/admin/upload-top-dealer-from-csv",
  upload.single("file"),
  adminOrSuperAdminAuth,
  uploadTopDealerFromCsv
);

router.post("/admin/sync-mdd-dealer-from-dump", upload.single("file"), adminOrSuperAdminAuth, syncMddDealerFromDump);


module.exports = router;