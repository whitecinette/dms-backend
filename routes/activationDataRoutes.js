const express = require('express');
const { upload } = require("../services/fileUpload");
const {adminOrSuperAdminAuth} = require("../middlewares/authmiddlewares");
const { uploadActivation, getActivation, downloadActivationFormat } = require('../controllers/new/activationDataController');

const router = express.Router();

router.post("/activation-data/upload", upload.single("file"), adminOrSuperAdminAuth, uploadActivation);
router.get("/activation-data", adminOrSuperAdminAuth, getActivation);
router.get("/activation-data/download-format", adminOrSuperAdminAuth, downloadActivationFormat);

module.exports = router;