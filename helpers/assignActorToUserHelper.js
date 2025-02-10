const bcrypt = require("bcryptjs");
// const mongoose = require("mongoose");
const ActorCode = require("../model/ActorCode");
const User = require("../model/User");

exports.assignActorToUser = async (code) => {
  console.log("entering assign code");
  try {
    const actor = await ActorCode.findOne({ code });
    console.log("Actor found:", actor);
    if (!actor) {
      console.error(`Actor code '${code}' not found.`);
      return { success: false, message: "Actor code not found." };
    }
    console.log("actor is", actor);

    // Check if a user with this actor code already exists
    const existingUser = await User.findOne({ code });
    if (existingUser) {
      console.log(`User with code '${code}' already exists.`);
      return {
        success: false,
        message: "User already exists with this actor code.",
      };
    }
    console.log("existing user is ", existingUser);
    // Hash default password
    const hashedPassword = await bcrypt.hash("123456", 10);
    //create default email
    const formattedName = actor.name.replace(/\s+/g, "").toLowerCase(); // Remove spaces and lowercase
    const formattedPosition = actor.position ? actor.position.replace(/\s+/g, "").toLowerCase() : "unknown"; // Default if position is missing
    // Create a new user and associate the actorCode
    const newUser = await User.create({
      name: actor.name,
      code: actor.code,
      password: hashedPassword,
      status: "active",
      position: actor.position,
      role: actor.role,
      isVerified: true,
      email: `default_${formattedName}_${formattedPosition}@example.com`,
      actorCode: actor._id, 
    });
    console.log("new user is", newUser);
    console.log(`Successfully saved user: ${newUser.name}`);
    return { success: true, message: "Successfully saved user." };
  } catch (error) {
    console.error("Error assigning actor code to users:", error);
    return { success: false, message: "Internal server error." };
  }
};
