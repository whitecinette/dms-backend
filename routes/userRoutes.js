const express = require("express");
const { registerSuperAdmin, loginSuperAdmin, editAdminProfile,  deactivateUserBySuperAdmin, deleteUserByAdmins, deactivateUserByAdmin, activateAndVerifyUser, registerAdminForSuperAdmin, registerUserBySuperAdmin, registerUserByAdmin, loginAdmin, loginAdminOrSuperAdmin, getUsersForAdmins, editUserByAdmins, registerOrUpdateUsersFromActorCodes, updateBulkDealers, activateAllUsersInAllCases, getAllDealerForAdmin, updateBulkLatLongForAdmin, 
    updateUserLabelsFromCSV, 
    updateBulkDealersFromCSV} = require("../controllers/admin/userController");
const { superAdminAuth, findUserWithToken, adminOrSuperAdminAuth, adminAuth, userAuth } = require("../middlewares/authmiddlewares");
const { loginUser, editProfileForUser, editUsers, getUsersDetails, getUsersByPositions } = require("../controllers/common/userController");
const { loginUserForApp, registerUserForApp } = require("../controllers/web/userController");
const upload = require("../helpers/multerHelper");
const router = express.Router();

// ============================ SUPER ADMIN ================================
router.post("/register-super-admin", registerSuperAdmin);
// router.post("/login-super-admin", loginSuperAdmin);
 // only by super admin
router.patch("/deactivate-user-by-super-admin/:id", superAdminAuth, deactivateUserBySuperAdmin);
router.post("/register-user-by-super-admin", superAdminAuth, registerUserBySuperAdmin);
router.post("/register-admin-by-super-admin", superAdminAuth, registerAdminForSuperAdmin);
router.put("/edit-admin-profile-by-super-admin/:id", superAdminAuth, editAdminProfile );
// ============================ /SUPER ADMIN ================================


// ============================ ADMIN ================================
// router.post("/register-admin", superAdminAuth, registerAdmin);
// router.post("/login-admin", loginAdmin);
router.put("/edit-admin-profile/:id", editAdminProfile );
router.post("/register-user-by-admin", adminAuth, registerUserByAdmin);
router.patch("/deactivate-user-by-admin/:id", adminAuth, deactivateUserByAdmin);

// router.put("/bulk-lats-longs-upload", upload.single("file"), updateBulkLatLongForAdmin);

router.put("/bulk-update-dealers", upload.single("file"), updateBulkDealersFromCSV);

//  =========================== /ADMIN ================================

//user
router.post("/login-admin-or-super-admin", loginAdminOrSuperAdmin)
router.post("/login-user", loginUser);
router.put("/edit-profile", findUserWithToken, editProfileForUser);

//admin and super admin common routes
router.put("/user/edit-by-admins/:id", adminOrSuperAdminAuth, editUserByAdmins);
router.delete("/user/delete-by-admins/:id", adminOrSuperAdminAuth, deleteUserByAdmins);
router.get("/user/get-by-admins", adminOrSuperAdminAuth, getUsersForAdmins);
router.post('/user/update-dealer-using-csv-by-admin', adminOrSuperAdminAuth, upload.single("file"), updateBulkDealers)
// Private: Only Admin or Super Admin can activate and verify an employee
router.patch("/activate-verify-user-by-admin-or-super-admin/:id", adminOrSuperAdminAuth, activateAndVerifyUser);

router.put("/activate-all-users-in-all-cases", activateAllUsersInAllCases);

router.put("/admin/register-update-from-actor-codes", registerOrUpdateUsersFromActorCodes);

//get dealer
router.get("/user/get-dealer-for-admin", adminOrSuperAdminAuth, getAllDealerForAdmin)


    


// USER APIS 
router.post("/app/user/login", loginUserForApp);
router.post("/app/user/register", registerUserForApp);

// edit user by thier role 

router.put("/edit-users-by-code",userAuth, editUsers);
router.get('/get-users-by-code', userAuth, getUsersDetails);


router.post("/admin/get-users-by-positions", getUsersByPositions);

router.put("/admin/update-user-labels", upload.single('file'), updateUserLabelsFromCSV);





module.exports = router;    