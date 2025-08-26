const mongoose = require("mongoose");

const FirmSalaryTemplateSchema = new mongoose.Schema(
  {
    firm_code: { type: String, required: true, trim: true },
    position: { type: String, required: true, trim: true }, // e.g. "ste", "asm"

    baseSalary: { type: Number, required: true },

    // Optional components
    hra: { type: Number, default: 0 },
    da: { type: Number, default: 0 },
    pfPercent: { type: Number, default: 12 },
    pfAmount: { type: Number },
    esicPercent: { type: Number },
    tds: { type: Number },
    bonus: { type: Number, default: 0 },

    // Additions: Incentives, Arrears, Rewards, etc.
    otherAdditions: [
      {
        label: { type: String, required: true },
        amount: { type: Number, required: true },
      },
    ],

    // Deductions: Loan, Advance, Penalties, etc.
    otherDeductions: [
      {
        label: { type: String, required: true },
        amount: { type: Number, required: true },
      },
    ],

    salaryType: {
      type: String,
      enum: ["monthly", "daily"],
      default: "monthly",
    },

    effectiveFrom: { type: Date, default: Date.now },
  },
  { timestamps: true, strict: false }
);

module.exports = mongoose.model("FirmSalaryTemplate", FirmSalaryTemplateSchema);
