const mongoose = require("mongoose");

const payrollBatchSchema = new mongoose.Schema(
  {
    month: {
      type: Number,
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    status: {
      type: String,
      enum: ["pending", "generated", "approved", "paid"],
      default: "pending",
    },
    totalPayout: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true, strict: false }
);

module.exports = mongoose.model("PayrollBatch", payrollBatchSchema);
