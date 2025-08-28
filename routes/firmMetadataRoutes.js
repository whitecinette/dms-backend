const express = require("express");
const { createFirmMetaData, getFirmMetaData, upsertFirmMetaData } = require("../controllers/admin/firmMetadataController");
const router = express.Router();

// POST → create firm metadata
router.post("/create-firm-metadata", createFirmMetaData);
router.put("/upsert-firm-metadata", upsertFirmMetaData);
router.get("/firm-metadata/:firmCode", getFirmMetaData);

module.exports = router;
