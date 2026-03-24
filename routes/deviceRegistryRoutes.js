const express = require('express');
const { adminOrSuperAdminAuth, superAdminAuth } = require('../middlewares/authmiddlewares');
const { getDevicesAndSessions, updateDeviceStatus, deleteDevice, revokeSession } = require('../controllers/new/deviceRegistryController');
const router = express.Router();


// ===============================
// DEVICES + SESSIONS (MAIN)
// ===============================
router.get("/admin/devices-sessions", superAdminAuth, getDevicesAndSessions);

// ===============================
// DEVICE ACTIONS
// ===============================
router.post("/admin/delete-device", superAdminAuth, deleteDevice);
router.post("/admin/update-device-status", superAdminAuth, updateDeviceStatus);

// ===============================
// SESSION ACTIONS
// ===============================
router.post("/admin/revoke-session", superAdminAuth, revokeSession);

module.exports = router;