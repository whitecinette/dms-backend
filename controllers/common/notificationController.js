const Notification = require("../../model/Notification");
const User = require("../../model/User");
const mongoose = require("mongoose");

exports.addNotification = async (req, res) => {
  try {
    // Dummy data for testing code getting from req.body
    const dummyTargetCodes = req.body.targetCodes || [];
    const dummyTargetRole = req.body.targetRole || "";
    const dummyTitle = "Test Notification";
    const dummyMessage =
      "This is a test notification for WebSocket and TTL testing.";

    const notification = await Notification.create({
      targetCodes: dummyTargetCodes,
      targetRole: dummyTargetRole,
      title: dummyTitle,
      message: dummyMessage,
    });

    res.status(200).json({
      success: true,
      message: "Dummy notification added successfully",
      notification,
    });
  } catch (err) {
    console.error("Error adding dummy notification:", err);
    res.status(500).json({
      success: false,
      message: "Failed to add dummy notification",
      error: err.message,
    });
  }
};

///get notification
exports.getNotification = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const notifications = await Notification.find();

    const filteredNotifications = notifications.filter((notification) => {
      const codes = notification.targetCodes?.map((c) => c.code) || [];

      // Global broadcast if targetRole is "user" with no codes
      if (notification.targetRole === "user") {
        if (codes.length > 0) {
          return codes.includes(user.code);
        } else {
          return true; // Treat as global
        }
      }

      // If targetRole matches user's role
      if (notification.targetRole === user.role) {
        if (codes.length > 0) {
          return codes.includes(user.code);
        }
        return true; // Role matches and no code restriction
      }

      // If only targetCodes provided
      if (!notification.targetRole && codes.length > 0) {
        return codes.includes(user.code);
      }

      // No role or codes specified — treat as global
      if (!notification.targetRole && codes.length === 0) {
        return true;
      }

      return false;
    });

    return res.status(200).json({
      success: true,
      notifications: filteredNotifications,
    });
  } catch (err) {
    console.error("Error getting notification:", err);
    return res.status(500).json({
      success: false,
      message: "Error getting notifications",
      error: err.message,
    });
  }
};

//mark seen
exports.markAsSeen = async (req, res) => {
  try {
    const { userId, notificationIds } = req.body;

    if (
      !userId ||
      !Array.isArray(notificationIds) ||
      notificationIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "User ID and an array of Notification IDs are required",
      });
    }

    // Filter valid ObjectId strings only
    const validIds = notificationIds.filter((id) =>
      mongoose.Types.ObjectId.isValid(id)
    );

    if (validIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid notification IDs provided",
      });
    }

    const notifications = await Notification.find({ _id: { $in: validIds } });

    if (notifications.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No notifications found for the provided IDs",
      });
    }

    const updatePromises = notifications.map((notification) => {
      if (!notification.readBy.includes(userId)) {
        notification.readBy.push(userId);
        return notification.save();
      }
      return Promise.resolve(); // Already marked as seen
    });

    await Promise.all(updatePromises);

    return res.status(200).json({
      success: true,
      message: "Notifications marked as seen",
    });
  } catch (err) {
    console.error("Error marking notifications as seen:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to mark notifications as seen",
      error: err.message,
    });
  }
};

//get notification count
exports.getNotificationCount = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const notifications = await Notification.find();

    const count = notifications.filter((notification) => {
      const codes = notification.targetCodes?.map((c) => c.code) || [];

      const isVisible =
        (notification.targetRole === "user" &&
          (codes.length === 0 || codes.includes(user.code))) ||
        (notification.targetRole === user.role &&
          (codes.length === 0 || codes.includes(user.code))) ||
        (!notification.targetRole &&
          (codes.length === 0 || codes.includes(user.code)));

      const isUnseen = !notification.readBy.some(
        (seenUserId) => seenUserId.toString() === userId
      );

      return isVisible && isUnseen;
    }).length;

    return res.status(200).json({
      success: true,
      count,
    });
  } catch (err) {
    console.error("Error getting notification count:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to get notification count",
      error: err.message,
    });
  }
};
