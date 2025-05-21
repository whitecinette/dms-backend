const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    brand: { type: String, required: true },
    product_name: { type: String, required: true },
    product_category: { type: String, required: true },
    price: { type: Number, required: true },
    segment: { type: String },
    model_code: { type: String },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "inactive",
    },
    isAvailable: {
     type: Boolean,
     default: true,
    },
  },
  { strict: false, timestamps: true }
);
module.exports = mongoose.model("Product", productSchema);
