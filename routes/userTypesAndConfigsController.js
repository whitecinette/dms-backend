const express = require("express");
const { userAuth } = require("../middlewares/authmiddlewares");
const { getAllUsersToSelect, bulkUploadUserTypeConfigs } = require("../controllers/admin/userTypesAndConfigsController");
const { upload } = require('../services/fileUpload');
const router = express.Router();



// get all leave requests
router.get("/users/get/to-select", userAuth, getAllUsersToSelect);
router.put("/groups/add/upload/csv", upload.single("file"), bulkUploadUserTypeConfigs);

module.exports = router; 