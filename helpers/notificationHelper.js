// notificationHelper.js
const User = require("../model/User");
const { sendEmail } = require("./emailHelper");

exports.sendNotificationToAdmins = async (changes, previousData, updatedUser, userMakingChangesEmail) => {
  try {
    // Find all admins and super admins
    const admins = await User.find({ role: { $in: ["admin", "super_admin"] } });

    if (admins.length === 0) {
      console.log("No admins or super admins found.");
      return { success: false, message: "No admins or super admins found." };
    }

    const message = generateNotificationMessage(changes, previousData, updatedUser);

    // Send notifications (via email)
    for (const admin of admins) {
      console.log(`Sending notification to ${admin.email}: ${message}`);
      console.log(`Sending from: ${userMakingChangesEmail}`);  // Log the sender's email for debugging
      await sendEmail(admin.email, "User Profile Update Notification", message, userMakingChangesEmail);  // Send email dynamically to admin's email
    }

    return { success: true, message: "Notifications sent successfully." };
  } catch (error) {
    console.error("Error sending notifications:", error);
    return { success: false, message: "Failed to send notifications." };
  }
};

// Helper function to generate the notification message
function generateNotificationMessage(changes, previousData, updatedUser) {
  let message = `The following changes have been made to the user profile of ${updatedUser.name} (${updatedUser.code}):\n\n`;

  changes.forEach(change => {
    message += `Field: ${change.field}\nOld Value: ${change.oldValue || "Not provided"}\nNew Value: ${change.newValue || "Not provided"}\n\n`;
  });

  message += `Updated by: ${updatedUser.name} (${updatedUser.code})\n`;
  message += `Date: ${new Date().toLocaleString()}\n`; // Add date and time of update

  return message;
}
