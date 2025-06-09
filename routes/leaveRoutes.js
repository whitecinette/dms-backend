const express = require("express");
const { requestLeave, getRequestLeaveForEmp } = require("../controllers/common/leaveController");
const { userAuth } = require("../middlewares/authmiddlewares");
const router = express.Router();
router.post("/request-leave", userAuth, requestLeave);
router.get("/get-requested-leave-emp", userAuth, getRequestLeaveForEmp);
module.exports = router;