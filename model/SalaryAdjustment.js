const mongoose = require("mongoose");

const salaryAdjustmentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    month: {
      type: Number,
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: ["bonus", "deduction", "incentive"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true, strict: false }
);

module.exports = mongoose.model("SalaryAdjustment", salaryAdjustmentSchema);
