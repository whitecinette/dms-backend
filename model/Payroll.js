const mongoose = require("mongoose");

const PayrollSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      ref: "ActorCode",
      required: true,
    },
    salaryDetails: {
      baseSalary: { type: Number, required: true },
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
            value: { type: Number, required: false },
          },
        ],
        default: [],  
      }
      
    },
    calculatedSalary: { type: Number },
    payrollDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Salary Calculation Logic (Pre-save Hook)
PayrollSchema.pre("save", function (next) {
  let totalSalary = this.salaryDetails.baseSalary;

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

  // Add Overtime Pay
  totalSalary +=
    this.salaryDetails.overtimeHours * this.salaryDetails.overtimeRate;

  // Handle 'Other' Dynamic Fields
  if (this.salaryDetails.other) {
    this.salaryDetails.other.forEach((entry) => {
      if (entry.type === "addition") {
        totalSalary += entry.value;
      } else if (entry.type === "deduction") {
        totalSalary -= entry.value;
      }
    });
  }

  this.calculatedSalary = totalSalary;
  next();
});

module.exports = mongoose.model("Payroll", PayrollSchema);
