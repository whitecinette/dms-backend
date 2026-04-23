const mongoose = require("mongoose");

const tertiarySchema = new mongoose.Schema(
  {
    mdd_code: String,
    mdd_name: String,

    dealer_code: String,
    dealer_name: String,

    invoice_no: String,
    invoice_date_raw: String,

    year_month: String,

    model: String,
    sku: String,

    qty: Number,
    net_value: Number,

    month_year: String,

    // Snapshot fields
    unit_price_snapshot: Number,
    segment_snapshot: String,
  },
  {
    timestamps: true,
    strict: false,
  }
);

tertiarySchema.index({ year_month: 1 });
tertiarySchema.index({ dealer_code: 1 });
tertiarySchema.index({ mdd_code: 1 });
tertiarySchema.index({ sku: 1 });
tertiarySchema.index({ model: 1 });
tertiarySchema.index({ year_month: 1, segment_snapshot: 1 });

module.exports = mongoose.model("TertiaryData", tertiarySchema);