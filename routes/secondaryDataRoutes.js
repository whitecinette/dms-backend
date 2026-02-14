const express = require("express");
const {upload} = require("../services/fileUpload");
const {adminOrSuperAdminAuth} = require("../middlewares/authmiddlewares");
const { uploadSecondary, getSecondary, downloadSecondaryFormat } = require("../controllers/new/secondaryDataController");

const router = express.Router();

router.post("/secondary-data/upload", adminOrSuperAdminAuth, upload.single("file"), uploadSecondary);
router.get("/secondary-data", adminOrSuperAdminAuth, getSecondary);
router.get("/secondary-data/download-format", adminOrSuperAdminAuth, downloadSecondaryFormat);

module.exports = router;