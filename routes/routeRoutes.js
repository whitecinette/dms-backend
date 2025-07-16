// routes/routePlan.js
const express = require("express");
const router = express.Router();
const upload = require("../helpers/multerHelper");
const { uploadRoutes } = require("../controllers/common/routeController");

router.post("/upload-routes", upload.single("file"), uploadRoutes);

module.exports = router;
