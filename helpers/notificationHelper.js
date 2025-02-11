const User = require("../model/User");

exports.sendNotificationToAdmins = async (changes, previousData, updatedUser) => {
  try {
    // Find all admins and super admins
    const admins = await User.find({ role: { $in: ["admin", "super_admin"] } });

    if (admins.length === 0) {
      console.log("No admins or super admins found.");
      return { success: false, message: "No admins or super admins found." };
    }

    const message = generateNotificationMessage(changes, previousData, updatedUser);

    // Send notifications (via email, in-app, etc.)
    // For this example, we'll assume an email function is available
    for (const admin of admins) {
      console.log(`Sending notification to ${admin.email}: ${message}`);
      // Uncomment the line below when email sending is implemented
      // sendEmail(admin.email, message); // Actual email sending logic goes here
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

