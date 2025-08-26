const express = require("express");
const { userAuth } = require("../middlewares/authmiddlewares");
const { getAllUsersToSelect } = require("../controllers/admin/userTypesAndConfigsController");
const router = express.Router();



// get all leave requests
router.get("/users/get/to-select", userAuth, getAllUsersToSelect)

module.exports = router;