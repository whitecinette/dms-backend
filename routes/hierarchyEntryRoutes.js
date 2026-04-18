const express = require("express");
const router = express.Router();

const { superAdminAuth } = require("../middlewares/authmiddlewares");

const {
  getHierarchyMeta,
  getHierarchyEntries,
  updateHierarchyEntry,
  bulkUpdateHierarchyEntries,
} = require("../controllers/new/hierarchyEntryController");

// META
router.get(
  "/super-admin/hierarchy/meta",
  superAdminAuth,
  getHierarchyMeta
);

// LIST
router.get(
  "/super-admin/hierarchy",
  superAdminAuth,
  getHierarchyEntries
);

// SINGLE UPDATE
router.patch(
  "/super-admin/hierarchy/:id",
  superAdminAuth,
  updateHierarchyEntry
);

// BULK UPDATE
router.patch(
  "/super-admin/hierarchy/bulk-update",
  superAdminAuth,
  bulkUpdateHierarchyEntries
);

module.exports = router;