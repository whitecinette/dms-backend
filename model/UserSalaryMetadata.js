const mongoose = require("mongoose");

const userSalaryMetadataSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    baseSalary: {
      type: Number,
      required: true,
    },
    salaryType: {
      type: String,
      enum: ["monthly", "daily", "hourly"],
      default: "monthly",
    },
    effectiveFrom: {
      type: Date,
      required: true,
    },
    incentivePolicyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IncentivePolicy",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true, strict: false }
);

module.exports = mongoose.model("UserSalaryMetadata", userSalaryMetadataSchema);
