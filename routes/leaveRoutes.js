const express = require("express");
const { requestLeave } = require("../controllers/common/leaveController");
const { userAuth } = require("../middlewares/authmiddlewares");
const router = express.Router();
router.post("/request-leave", userAuth, requestLeave);
module.exports = router;