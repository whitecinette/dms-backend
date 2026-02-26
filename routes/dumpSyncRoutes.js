const express = require("express");
const { upload } = require("../services/fileUpload");
const { adminOrSuperAdminAuth } = require("../middlewares/authmiddlewares");

const {
  uploadSamsungDumpProducts,
  syncMddDealerFromDump,
} = require("../controllers/new/dumpSyncController");

const router = express.Router();

// POST /dump-sync/samsung-products/upload?dryRun=true
router.post(
  "/dump-sync/samsung-products/upload",
  upload.single("file"),
  adminOrSuperAdminAuth,
  uploadSamsungDumpProducts
);

router.post("/admin/sync-mdd-dealer-from-dump", upload.single("file"), adminOrSuperAdminAuth, syncMddDealerFromDump);


module.exports = router;