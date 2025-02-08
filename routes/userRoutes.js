const express = require("express");
const { registerSuperAdmin, loginSuperAdmin, registerAdmin } = require("../controllers/admin/userController");
const router = express.Router();


router.post("/register-super-admin", registerSuperAdmin);
router.post("/login-super-admin", loginSuperAdmin);

router.post("/register-admin", registerAdmin);

module.exports = router;