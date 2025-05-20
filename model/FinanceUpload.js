const mongoose = require("mongoose");

const financeUploadSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    type: { type: String, required: true },
    function: { type: String, enum: ["credit", "debit"], required: true },
    role: { type: String, enum: ["main", "sub"], required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    // Dynamic fields will be added per row
  },
  { strict: false, timestamps: true }
);

module.exports = mongoose.model("FinanceUpload", financeUploadSchema);
