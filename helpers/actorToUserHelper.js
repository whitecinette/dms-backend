const bcrypt = require("bcryptjs");
const ActorCode = require("../model/ActorCode");
const User = require("../model/User");

exports.assignActorToUser = async (code) => {
  //console.log("entering assign code");
  try {
    const actor = await ActorCode.findOne({ code });
    //console.log("Actor found:", actor);
    if (!actor) {
      console.error(`Actor code '${code}' not found.`);
      return { success: false, message: "Actor code not found." };
    }
    //console.log("actor is", actor);

    // Check if a user with this actor code already exists
    const existingUser = await User.findOne({ code });
    if (existingUser) {
      //console.log(`User with code '${code}' already exists.`);
      return {
        success: false,
        message: "User already exists with this actor code.",
      };
    }
    //console.log("existing user is ", existingUser);
    // Hash default password
    const hashedPassword = await bcrypt.hash("123456", 10);
    //create default email
    const formattedName = actor.name.replace(/\s+/g, "").toLowerCase(); // Remove spaces and lowercase
    const formattedPosition = actor.position
      ? actor.position.replace(/\s+/g, "").toLowerCase()
      : "unknown"; // Default if position is missing
    // Create a new user and associate the actorCode
    const newUser = await User.create({
      name: actor.name,
      code: actor.code,
      password: hashedPassword,
      status: "active",
      position: actor.position,
      role: actor.role,
      isVerified: true,
      email: `${formattedName}_${formattedPosition}@example.com`,
      actorCode: actor._id,
    });
    //console.log("new user is", newUser);
    //console.log(`Successfully saved user: ${newUser.name}`);
    return { success: true, message: "Successfully saved user." };
  } catch (error) {
    console.error("Error assigning actor code to users:", error);
    return { success: false, message: "Internal server error." };
  }
};

//delete user if actor codes get delete
exports.deleteUser = async (code) => {
  console.log("Entering unassignActorToUser...");

  try {
    // Check if the user exists
    const existingUser = await User.findOne({ code });
    if (!existingUser) {
      console.log(`❌ User with code '${code}' not found.`);
      return { success: false, message: "User not found." };
    }

    console.log("🔹 User found, deleting...");

    // Delete the user
    const deletedUser = await User.findOneAndDelete({ code });

    if (!deletedUser) {
      console.error(`⚠️ Failed to delete user with code '${code}'.`);
      return { success: false, message: "User deletion failed." };
    }

    console.log("✅ User deleted:", deletedUser);
    return { success: true, message: "User deleted successfully." };
  } catch (error) {
    console.error("❌ Error in unassignActorToUser:", error);
    return { success: false, message: "Internal server error." };
  }
};

// inactive actor when delete from user model
exports.inactiveActor = async (code) => {
  try {
    const existingActor = await ActorCode.findOne({code});

    if(!existingActor){
      return { success: false, message: "Actor code not found." };
    }
    existingActor.status ="inactive";
    await existingActor.save();
    return { success: true, message: "Actor code deactivated successfully." };

  }catch(err){
    console.error("Error in inactiveActor:", err);
    return { success: false, message: "Internal server error." };
  }
  
}

//edit actor codes
exports.editActorCode = async (oldCode, newCode, name, status, role, position) => {
  try {
    console.log("hello im here");
    console.log({ oldCode, newCode, name, status, role, position });

    // FIXED: Correct field name used in query
    const existingActor = await ActorCode.findOne({ code: oldCode });

    if (!existingActor) {
      return { success: false, message: "Actor code not found." };
    }

    // Update only if values are provided (optional: skip undefined)
    if (newCode !== undefined) existingActor.code = newCode;
    if (name !== undefined) existingActor.name = name;
    if (status !== undefined) existingActor.status = status;
    if (role !== undefined) existingActor.role = role;
    if (position !== undefined) existingActor.position = position;

    await existingActor.save();

    return { success: true, message: "Actor code updated successfully." };
  } catch (err) {
    console.error("Error in editActorCode:", err);
    return { success: false, message: "Internal server error." };
  }
};


//edit user codes
exports.editUser = async (oldCode, newCode, name, position, role, status) => {
  try {
    // Find the user associated with the old actor code
    const user = await User.findOne({ code: oldCode });
    
    if (!user) {
      console.log("User not found for actor code:", oldCode);
      return { success: false, message: "User not found." };
    }

    // Update user details
    user.code = newCode;
    user.name = name;
    user.position = position;
    user.role = role;
    user.status = status;
    
    await user.save();
    console.log("User updated successfully.");
    return { success: true, message: "User updated successfully." };
  } catch (error) {
    console.error("Error editing user:", error);
    return { success: false, message: "Internal server error." };
  }
};