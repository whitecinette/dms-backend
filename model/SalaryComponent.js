const mongoose = require("mongoose");

const salaryComponentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["earning", "deduction", "benefit", "reimbursement"],
      default: "earning",
    },
    calculationType: {
      type: String,
      enum: ["fixed_percent_ctc", "fixed_percent_basic", "fixed_flat", "variable_flat"],
      required: true,
    },
    value: {
      type: Number,
    },
    considerForEPF: {
      type: Boolean,
      default: false,
    },
    considerForESI: {
      type: Boolean,
      default: false,
    },
    taxable: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { timestamps: true, strict: false }
);

module.exports = mongoose.model("SalaryComponent", salaryComponentSchema);
