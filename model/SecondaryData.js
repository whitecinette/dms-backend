const mongoose = require("mongoose");

const secondarySchema = new mongoose.Schema(
  {
    mdd_code: String,
    mdd_name: String,

    invoice_no: String,
    invoice_date_raw: String,

    year_month: String,

    sku: String,
    model: String,

    qty: Number,
    net_value: Number,
  },
  {
    timestamps: true,
    strict: false,
  }
);

secondarySchema.index({ year_month: 1 });
secondarySchema.index({ mdd_code: 1 });

module.exports = mongoose.model("SecondaryData", secondarySchema);
