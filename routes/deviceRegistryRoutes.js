const express = require('express');
const { adminOrSuperAdminAuth } = require('../middlewares/authmiddlewares');
const { getPendingDevices, approveDeviceByAdmin, blockDeviceByAdmin, logoutSessionByAdmin, logoutAllSessionsByCode, getSessions } = require('../controllers/new/deviceRegistryController');
const router = express.Router();

router.get("/admin/pending-devices", adminOrSuperAdminAuth, getPendingDevices);
router.post("/admin/approve-device", adminOrSuperAdminAuth, approveDeviceByAdmin);
router.post("/admin/block-device", adminOrSuperAdminAuth, blockDeviceByAdmin);
router.post("/admin/logout-session/:sessionId", adminOrSuperAdminAuth, logoutSessionByAdmin);
router.post("/admin/logout-all/:code", adminOrSuperAdminAuth, logoutAllSessionsByCode);
router.get("/admin/sessions", adminOrSuperAdminAuth, getSessions);

module.exports = router;