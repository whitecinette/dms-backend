const express = require("express");
const { registerSuperAdmin, loginSuperAdmin, editAdminProfile,  deleteUserBySuperAdmin, deactivateUserBySuperAdmin, deleteUserByAdmin, deactivateUserByAdmin, activateAndVerifyUser, registerAdminForSuperAdmin, registerUserBySuperAdmin, registerUserByAdmin, loginAdmin, loginAdminOrSuperAdmin, editUserBySuperAdmin, editUserByAdmin, getUsersForAdmin, getUsersForSuperAdmin } = require("../controllers/admin/userController");
const { superAdminAuth, findUserWithToken, adminOrSuperAdminAuth, adminAuth } = require("../middlewares/authmiddlewares");
const { loginUser, editProfileForUser } = require("../controllers/common/userController");
const router = express.Router();

// ============================ SUPER ADMIN ================================
router.post("/register-super-admin", registerSuperAdmin);
// router.post("/login-super-admin", loginSuperAdmin);
router.delete("/delete-User-by-super-admin/:id", superAdminAuth, deleteUserBySuperAdmin); // only by super admin
router.patch("/deactivate-user-by-super-admin/:id", superAdminAuth, deactivateUserBySuperAdmin);
router.post("/register-user-by-super-admin", superAdminAuth, registerUserBySuperAdmin);
router.post("/register-admin-by-super-admin", superAdminAuth, registerAdminForSuperAdmin);
router.put("/edit-admin-profile-by-super-admin/:id", superAdminAuth, editAdminProfile );
router.put("/user/edit-by-super-admin/:id", superAdminAuth, editUserBySuperAdmin );
router.get("/user/get-by-super-admin", superAdminAuth, getUsersForSuperAdmin);
// ============================ /SUPER ADMIN ================================


// ============================ ADMIN ================================
// router.post("/register-admin", superAdminAuth, registerAdmin);
// router.post("/login-admin", loginAdmin);
router.put("/edit-admin-profile/:id", editAdminProfile );
router.post("/register-user-by-admin", adminAuth, registerUserByAdmin);
router.patch("/deactivate-user-by-admin/:id", adminAuth, deactivateUserByAdmin);
router.delete("/delete-User-by-admin/:id", adminAuth, deleteUserByAdmin);
router.put("/user/edit-by-admin/:id", adminAuth, editUserByAdmin);
router.get("/user/get-by-admin", adminAuth, getUsersForAdmin);
//  =========================== /ADMIN ================================

//user
router.post("/login-admin-or-super-admin", loginAdminOrSuperAdmin)
router.post("/login-user", loginUser);
router.put("/edit-profile", findUserWithToken, editProfileForUser);
// Private: Only Admin or Super Admin can activate and verify an employee
router.patch("/activate-verify-user-by-admin-or-super-admin/:id", adminOrSuperAdminAuth, activateAndVerifyUser);


module.exports = router;    