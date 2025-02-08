const express = require("express");
const { registerSuperAdmin, loginSuperAdmin, registerAdmin, editAdminProfile, deleteUser } = require("../controllers/admin/userController");
const { superAdminAuth } = require("../middlewares/authmiddlewares");
const router = express.Router();


router.post("/register-super-admin", registerSuperAdmin);
router.post("/login-super-admin", loginSuperAdmin);
router.delete("/delete-User-by-super-admin/:id", deleteUser); // only by super admin

router.post("/register-admin", superAdminAuth, registerAdmin);
router.put("/edit-admin-profile/:id", editAdminProfile );
module.exports = router;    