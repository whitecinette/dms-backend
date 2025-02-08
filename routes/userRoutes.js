const express = require("express");
const { registerSuperAdmin, loginSuperAdmin, registerAdmin } = require("../controllers/admin/userController");
const { adminAuth } = require("../middlewares/authmiddlewares");
const router = express.Router();


router.post("/register-super-admin", registerSuperAdmin);
router.post("/login-super-admin", loginSuperAdmin);

router.post("/register-admin", adminAuth, registerAdmin);

module.exports = router;    