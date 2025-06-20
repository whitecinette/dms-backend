const mongoose = require("mongoose");
const { notifyAdmins } = require("../services/websocketService");

const notificationSchema = new mongoose.Schema(
  {
    targetCodes: [
      {
        code: { type: String, required: true },
      },
    ],
    targetRole: [
      {
        type: String,
        enum: ["admin", "super_admin", "dealer", "employee", "mdd", "user", "hr", ""],
        default: "", // Set a default value if needed
        required: false,
      },
    ],
    title: { type: String, required: true },
    message: { type: String, required: true },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    createdAt: { type: Date, default: Date.now },
  },
  { strict: false }
);

// Create TTL index (7days)
notificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 7 }
);

notificationSchema.pre("save", function (next) {
  if (this.isNew) {
    notifyAdmins(this);
  }
  next();
});

module.exports = mongoose.model("Notification", notificationSchema);
