const { io } = require("../server");
const User = require("../model/User");

exports.notifyAdmins = async (notification) => {
  try {
    let users = [];

    const hasTargetCodes = notification.targetCodes?.length > 0;
    const hasTargetRole = notification.targetRole?.length > 0;

    if (hasTargetRole) {
      if (notification.targetRole.includes("user")) {
        if (hasTargetCodes) {
          // Specific users with given codes
          users = await User.find({
            code: { $in: notification.targetCodes.map((c) => c.code) },
          });
        } else {
          // Global notification to all users
          users = await User.find();
        }
      } else {
        if (hasTargetCodes) {
          // Match users with specified codes (role doesn't matter in this case)
          users = await User.find({
            code: { $in: notification.targetCodes.map((c) => c.code) },
          });
        } else {
          // Match users by any of the specified roles
          users = await User.find({
            role: { $in: notification.targetRole },
          });
        }
      }
    } else if (hasTargetCodes) {
      // Only codes provided (no roles)
      users = await User.find({
        code: { $in: notification.targetCodes.map((c) => c.code) },
      });
    } else {
      // Fallback: notify all users
      users = await User.find();
    }

    // Emit to each user by socket room (userId)
    users.forEach((user) => {
      const userId = user._id.toString();
      io.to(userId).emit("notification", {
        notification,
      });
    });
  } catch (error) {
    console.error("Error sending WebSocket notification:", error);
  }
};
