const express = require("express");
const { upload } = require("../services/fileUpload");
const { uploadDealerHierarchy, getDealerHierarchy, downloadDealerHierarchyFormat } = require("../controllers/new/dealerHierarchyController");
const { adminOrSuperAdminAuth } = require("../middlewares/authmiddlewares");



const router = express.Router();

// ===============================
// Upload Dealer Hierarchy
// ===============================
router.post(
  "/dealer-hierarchy/upload",
  adminOrSuperAdminAuth,
  upload.single("file"), uploadDealerHierarchy
);

// ===============================
// Download CSV Format
// ===============================
router.get(
  "/dealer-hierarchy/download-format",
  adminOrSuperAdminAuth,
  downloadDealerHierarchyFormat
);

router.get("/dealer-hierarchy", adminOrSuperAdminAuth, getDealerHierarchy);


module.exports = router;

