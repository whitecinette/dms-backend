const mongoose = require("mongoose");

const monthlySalarySchema = new mongoose.Schema(
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
    workingDays: {
      type: Number,
      required: true,
    },
    daysPresent: {
      type: Number,
      required: true,
    },
    unpaidLeaves: {
      type: Number,
      default: 0,
    },
    perDayRate: {
      type: Number,
    },
    calculatedSalary: {
      type: Number,
    },
    incentives: {
      type: Number,
      default: 0,
    },
    bonus: {
      type: Number,
      default: 0,
    },
    deductions: {
      type: Number,
      default: 0,
    },
    netPayable: {
      type: Number,
    },
    status: {
      type: String,
      enum: ["draft", "generated", "paid"],
      default: "draft",
    },
    generatedAt: Date,
    paidAt: Date,
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PayrollBatch",
    },
  },
  { timestamps: true, strict: false }
);

module.exports = mongoose.model("MonthlySalary", monthlySalarySchema);
