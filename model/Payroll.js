const mongoose = require("mongoose");

// Flexible sub-schema for additions/deductions
const FlexEntrySchema = new mongoose.Schema({
  name: { type: String, trim: true },
  amount: { type: Number, default: 0 },
  remark: { type: String, trim: true, default: "" } // ✅ remark per entry
}, { _id: false, strict: false }); // allow extra fields

const PayrollSchema = new mongoose.Schema({
  code: { type: String, trim: true }, // employee code
  basic_salary: { type: Number, default: 0 },
  days_present: { type: Number, default: 0 },
  approved_leaves: { type: Number, default: 0 },
  leaves: { type: Number, default: 0 },
  hours_worked: { type: Number, default: 0 },

  additions: [FlexEntrySchema],   // ✅ flexible additions w/ remark
  deductions: [FlexEntrySchema],  // ✅ flexible deductions w/ remark

  month: { type: Number }, // 1-12
  year: { type: Number },

  gross_salary: { type: Number, default: 0 },
  net_salary: { type: Number, default: 0 },

  status: { 
    type: String, 
    enum: ["draft", "generated", "approved", "paid"], 
    default: "draft" 
  },

  leaves_adjustment: {type: Number},
  payout_date: { type: Date },
  payment_mode: { type: String, trim: true },
  remarks: { type: String, trim: true, default: "No remarks provided" }, // ✅ payroll-level remark

  generated_by: { type: String, trim: true }, // or ObjectId if linking User
}, { timestamps: true, strict: false }); // root-level strict: false

module.exports = mongoose.model("Payroll", PayrollSchema);
