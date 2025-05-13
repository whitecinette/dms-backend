const express = require("express");
const router = express.Router();
const { getUpdatedDataGeoTag, getUpdatedGeoTagCount, MarkSeenToAllGeoTag } = require("../controllers/admin/updatedController");
const {adminOrSuperAdminAuth} = require("../middlewares/authmiddlewares")

router.get("/updated-data/geo-tag", getUpdatedDataGeoTag);
router.get("/updated-data/geo-tag/count", adminOrSuperAdminAuth, getUpdatedGeoTagCount);
router.post("/updated-data/geo-tag/mark-seen", adminOrSuperAdminAuth, MarkSeenToAllGeoTag);

module.exports = router;
