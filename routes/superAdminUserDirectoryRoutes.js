const express = require("express");
const router = express.Router();

const {
  getFirmOptionsForUserDirectory,
  updateUserDirectoryFirm,
  getUserDirectoryMetadataByCode,
  upsertUserDirectoryMetadata,
  updateUserDirectoryStatus,
  getUserDirectory,
} = require("../controllers/admin/superAdminUserDirectoryController");

const { superAdminAuth } = require("../middlewares/authmiddlewares");

router.get(
  "/super-admin/user-directory",
  superAdminAuth,
  getUserDirectory
);

router.get(
  "/super-admin/user-directory/firms",
  superAdminAuth,
  getFirmOptionsForUserDirectory
);

router.patch(
  "/super-admin/user-directory/:code/firm",
  superAdminAuth,
  updateUserDirectoryFirm
);

router.get(
  "/super-admin/user-directory/:code/metadata",
  superAdminAuth,
  getUserDirectoryMetadataByCode
);

router.put(
  "/super-admin/user-directory/:code/metadata",
  superAdminAuth,
  upsertUserDirectoryMetadata
);

router.patch(
  "/super-admin/user-directory/:code/status",
  superAdminAuth,
  updateUserDirectoryStatus
);

module.exports = router;