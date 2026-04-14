const express = require("express");
const { upload } = require("../services/fileUpload");
const { adminOrSuperAdminAuth } = require("../middlewares/authmiddlewares");

const {
  uploadSamsungDumpProducts,
  uploadSamsungProductTagsFromCsv,
  syncMddDealerFromDump,
  uploadTopDealerFromCsv,
  uploadSamsungDumpHierarchy,
  uploadExtractionActiveFromCsv,
  updateDealerCatgoryFromCSV,
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
  "/dump-sync/samsung-products/tags/upload",
  upload.single("file"),
  adminOrSuperAdminAuth,
  uploadSamsungProductTagsFromCsv
);

router.post("/admin/sync-mdd-dealer-from-dump", upload.single("file"), adminOrSuperAdminAuth, syncMddDealerFromDump);

router.post("/admin/sync-heirarchy-from-dump", upload.single("file"), adminOrSuperAdminAuth, uploadSamsungDumpHierarchy)

router.post(
  "/admin/upload-top-dealer-from-csv",
  upload.single("file"),
  adminOrSuperAdminAuth,
  uploadTopDealerFromCsv
);

router.post(
  "/upload-extraction-active--dealer-from-csv",
  adminOrSuperAdminAuth,
  upload.single("file"),
  uploadExtractionActiveFromCsv
);

router.post(
  "/update-dealer-category-from-csv",
  adminOrSuperAdminAuth,
  upload.single("file"),
  updateDealerCatgoryFromCSV
);


module.exports = router;
