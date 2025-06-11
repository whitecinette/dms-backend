const express = require("express");
const { requestLeave, getRequestLeaveForEmp, getLeaveApplications, editLeaveApplication } = require("../controllers/common/leaveController");
const { userAuth } = require("../middlewares/authmiddlewares");
const router = express.Router();
router.post("/request-leave", userAuth, requestLeave);
router.get("/get-requested-leave-emp", userAuth, getRequestLeaveForEmp);

// get all leave requests
router.get("/all-leaves/admin", userAuth, getLeaveApplications)
router.post("/edit-leave", userAuth, editLeaveApplication);
module.exports = router;