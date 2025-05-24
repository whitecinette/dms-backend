const { io } = require("../server");
const User = require("../model/User");

exports.notifyAdmins = async (notification) => {
  try {
    // console.log("Notification:", notification);
    let user = [];
    if (notification.targetRole) {
      if (notification.targetRole === "user") {
        if (notification.targetCodes.length > 0) {
          user = await User.find({
            code: { $in: notification.targetCodes.map((c) => c.code) },
          });
        } else {
          // Global notification to all users (treating "user" as global)
          user = await User.find();
        }
      } else {
        if (notification.targetCodes.length > 0) {
          user = await User.find({
            code: { $in: notification.targetCodes.map((c) => c.code) },
          });
        } else {
          user = await User.find({ role: notification.targetRole });
        }
      }
    } else if (
      (notification.targetCodes.length && notification.targetRole.length) > 0
    ) {
      user = await User.find({
        code: { $in: notification.targetCodes.map((c) => c.code) },
      });
    } else {
      user = await User.find();
    }

    // console.log("User:", user);
    // Emit to each admin by room name (userId)
    user.forEach((user) => {
      const userId = user._id.toString();
      io.to(userId).emit("notification", {
        notification,
      });
    });
  } catch (error) {
    console.error("Error sending WebSocket notification:", error);
  }
};
