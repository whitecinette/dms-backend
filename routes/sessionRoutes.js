const express = require('express');
const { getUserWiseSessions } = require('../controllers/admin/sessionController');
const { userAuth } = require('../middlewares/authmiddlewares');
const router = express.Router();

router.post("/super-admin/sessions/get", userAuth, getUserWiseSessions);

module.exports = router;