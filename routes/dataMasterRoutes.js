const express = require("express");
const {upload} = require("../services/fileUpload");
const {adminOrSuperAdminAuth} = require("../middlewares/authmiddlewares");
const { uploadCombinedData } = require("../controllers/new/dataMasterController");

const router = express.Router();

router.post("/combined-data-upload", upload.single("file"), adminOrSuperAdminAuth, uploadCombinedData);

module.exports = router;