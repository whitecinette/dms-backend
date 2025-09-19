const mongoose = require("mongoose");

const modelWiseTargetsSchema = new mongoose.Schema(
  {
    model_code: {
      type: String,
      trim: true,
      uppercase: true, // optional, ensures consistency
    },
    vol_tgt: {
      type: Number,
      default: 0,
    },
    month: {
      type: Number, // 1 = Jan, 12 = Dec
      min: 1,
      max: 12,
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
  },
  {
    strict: false,
    timestamps: true,
  }
);

module.exports = mongoose.model("modelWiseTargets", modelWiseTargetsSchema);
