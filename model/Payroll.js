const mongoose = require("mongoose");

const payrollSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ActorCode",
      required: true,
    },
    actorCode: { type: String, required: true },
    actorName: { type: String, required: true },
    position: { type: String, required: true },
    role: { type: String, required: true },
    basicSalary: { type: Number, required: true },
    bonuses: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 },
    taxAmount: { type: Number },
    netSalary: { type: Number },
    paymentDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payroll", payrollSchema);
