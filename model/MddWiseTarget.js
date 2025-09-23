const mongoose = require("mongoose");

const mddWiseTargetsSchema = new mongoose.Schema(
  {
    mdd_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    model_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    vol_tgt: {
      type: Number,
      required: true,
      default: 0,
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: true,
    },
    uploaded_by: {
      type: String,
      required: true,
    },
  },
  {
    strict: false, // allows extra fields from CSV
    timestamps: true,
  }
);

module.exports = mongoose.model("MddWiseTarget", mddWiseTargetsSchema);
