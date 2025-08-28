const mongoose = require("mongoose");

const PayrollSchema = new mongoose.Schema({
  code: { type: String, trim: true }, // employee code
  basic_salary: { type: Number, default: 0 },
  days_present: { type: Number, default: 0 },
  leaves: { type: Number, default: 0 },
  hours_worked: { type: Number, default: 0 },

  additions: [{
    name: { type: String, trim: true },
    amount: { type: Number, default: 0 }
  }],

  deductions: [{
    name: { type: String, trim: true },
    amount: { type: Number, default: 0 }
  }],

  month: { type: Number }, // 1-12
  year: { type: Number },

  gross_salary: { type: Number, default: 0 },
  net_salary: { type: Number, default: 0 },

  status: { type: String, enum: ["draft", "generated", "approved", "paid"], default: "draft" },
  payout_date: { type: Date },
  payment_mode: { type: String, trim: true },
  remarks: { type: String, trim: true },

  generated_by: { type: String, trim: true }, // or ObjectId if linking User
}, { timestamps: true, strict: false });

module.exports = mongoose.model("Payroll", PayrollSchema);
