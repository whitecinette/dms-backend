const mongoose = require("mongoose");

const PayrollSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      ref: "ActorCode",
      required: true,
    },
    salaryDetails: {
      baseSalary: { type: Number },          // Auto-calculated field
      deductions: [
        {
          name: { type: String, required: true },
          type: { type: String, enum: ["percentage", "fixed"], required: true },
          value: { type: Number, required: true },
          isActive: { type: Boolean, default: false },
        },
      ],
      bonuses: [
        {
          name: { type: String },
          amount: { type: Number, default: 0 },
        },
      ],
      other: {
        type: [
          {
            name: { type: String, required: true },
            type: { type: String, enum: ["addition", "deduction"], required: true },
            amount: { type: Number, required: true },
          },
        ],
        default: [],  
      }
    },
    totalSalary: { type: Number },
    payrollDate: { type: Date, default: Date.now },
    salaryMonth: { type: String, required: true } 
  },
  { strict: false, timestamps: true }
);

// Salary Calculation Logic (Pre-save Hook)
PayrollSchema.pre("save", function (next) {
  const { CTC, other } = this.salaryDetails;

  // Auto-calculate baseSalary from CTC
  const baseSalary = Math.round(CTC / 12); 
  this.salaryDetails.baseSalary = baseSalary;

  let totalSalary = baseSalary;

  // Add Bonuses
  if (this.salaryDetails.bonuses) {
    this.salaryDetails.bonuses.forEach((bonus) => {
      totalSalary += bonus.amount;
    });
  }

  // Deduct Deductions
  if (this.salaryDetails.deductions) {
    this.salaryDetails.deductions.forEach((deduction) => {
      if (deduction.isActive) {
        totalSalary -=
          deduction.type === "percentage"
            ? totalSalary * (deduction.value / 100)
            : deduction.value;
      }
    });
  }

  // Handle 'Other' Dynamic Fields (e.g., House Allowance)
  if (other) {
    other.forEach((entry) => {
      if (entry.type === "addition") {
        totalSalary += entry.amount; 
      } else if (entry.type === "deduction") {
        totalSalary -= entry.amount; 
      }
    });
  }

  this.calculatedSalary = totalSalary;
  next();
});

module.exports = mongoose.model("Payroll", PayrollSchema);
