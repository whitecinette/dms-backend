const express = require("express");
const router = express.Router();
const { addNotification, getNotification, getNotificationCount, markAsSeen } = require("../controllers/common/notificationController");
const { userAuth } = require("../middlewares/authmiddlewares");

router.post("/add/notification", addNotification)//just for testing
router.get('/get/notification', userAuth, getNotification)
router.get("/get/notification/count",userAuth, getNotificationCount)
router.put("/mark/notification", markAsSeen)

module.exports = router;