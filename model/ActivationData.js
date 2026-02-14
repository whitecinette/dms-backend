const mongoose = require("mongoose");

const activationSchema = new mongoose.Schema(
  {
    activation_date_raw: String, // "2/1/26"

    year_month: String, // "2026-02"

    model_no: String,
    product_code: String,

    tertiary_buyer_code: String,
    tertiary_seller_code: String,

    qty: Number,
    val: Number,
  },
  {
    timestamps: true,
    strict: false,
  }
);

activationSchema.index({ year_month: 1 });
activationSchema.index({ tertiary_buyer_code: 1 });
activationSchema.index({ product_code: 1 });

module.exports = mongoose.model("ActivationData", activationSchema);
