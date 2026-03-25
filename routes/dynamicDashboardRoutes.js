const express = require('express');
const { userAuth, adminOrSuperAdminAuth, sessionGuard } = require('../middlewares/authmiddlewares');
const { getDynamicDashboard } = require('../controllers/new/dynamicDashboardController');
const router = express.Router();

router.get(
  "/app/dashboard-config",
  userAuth,
  sessionGuard,
  getDynamicDashboard
);

module.exports = router;