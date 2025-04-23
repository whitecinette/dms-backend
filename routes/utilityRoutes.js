const express = require("express");
const upload = require("../helpers/multerHelper");
const { AlphaMessages } = require("../controllers/admin/utilitycontoller");
const router = express.Router();

router.post("/upload/AlphaMessage", upload.single("file"), AlphaMessages)

module.exports = router;  