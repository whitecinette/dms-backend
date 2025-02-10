const mongoose = require("mongoose");

// Define the schema
const actorCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true, // Ensures the code is stored in uppercase
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    position: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      required: true,
      trim: true,
    },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true, strict: false }
);

// Create the model
module.exports = mongoose.model("ActorCode", actorCodeSchema);
