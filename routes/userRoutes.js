const express = require("express");
const { registerSuperAdmin, loginSuperAdmin, registerAdmin, editAdminProfile, deleteUser, editProfileForUser } = require("../controllers/admin/userController");
const { superAdminAuth, findUserWithToken } = require("../middlewares/authmiddlewares");
const router = express.Router();


router.post("/register-super-admin", registerSuperAdmin);
router.post("/login-super-admin", loginSuperAdmin);
router.delete("/delete-User-by-super-admin/:id", deleteUser); // only by super admin

router.post("/register-admin", superAdminAuth, registerAdmin);
router.put("/edit-admin-profile/:id", editAdminProfile );
router.put("/edit-admin-profile-by-super-admin/:id", superAdminAuth, editAdminProfile );

//user
router.put("/edit-profile",findUserWithToken,editProfileForUser);


module.exports = router;    