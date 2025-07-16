const mongoose = require("mongoose");

const userRouteSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    town: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    strict: false,
  }
);

module.exports = mongoose.model("UserRoute", userRouteSchema);
