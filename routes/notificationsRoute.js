const express = require("express");
const router = express.Router();
const { addNotification, getNotification, getNotificationCount, markAsSeen } = require("../controllers/common/notificationController");

router.post("/add/notification", addNotification)
router.get('/get/notification/:userId', getNotification)
router.get("/get/notification/count/:userId", getNotificationCount)
router.put("/mark/notification", markAsSeen)

module.exports = router;