const express = require("express");
const {upload} = require("../services/fileUpload");
const {adminOrSuperAdminAuth} = require("../middlewares/authmiddlewares");
const { uploadTertiary, getTertiary, downloadTertiaryFormat } = require("../controllers/new/tertiaryDataController");

const router = express.Router();

router.post("/tertiary-data/upload", adminOrSuperAdminAuth, upload.single("file"), uploadTertiary);
router.get("/tertiary-data", adminOrSuperAdminAuth, getTertiary);
router.get("/tertiary-data/download-format", adminOrSuperAdminAuth, downloadTertiaryFormat);

module.exports = router;