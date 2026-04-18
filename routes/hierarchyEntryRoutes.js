const express = require("express");
const router = express.Router();

const { superAdminAuth } = require("../middlewares/authmiddlewares");

const {
  getHierarchyMeta,
  getHierarchyEntries,
  updateHierarchyEntry,
  bulkUpdateHierarchyEntries,
} = require("../controllers/new/hierarchyEntryController");

router.get(
  "/super-admin/hierarchy/meta",
  superAdminAuth,
  getHierarchyMeta
);

router.get(
  "/super-admin/hierarchy",
  superAdminAuth,
  getHierarchyEntries
);

router.patch(
  "/super-admin/hierarchy/bulk-update",
  superAdminAuth,
  bulkUpdateHierarchyEntries
);

router.patch(
  "/super-admin/hierarchy/:id",
  superAdminAuth,
  updateHierarchyEntry
);

module.exports = router;