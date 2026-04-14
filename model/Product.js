const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    brand: { type: String, required: true, trim: true, lowercase: true },
    product_name: { type: String, required: true, trim: true },
    product_category: { type: String, required: true, trim: true }, // smart_phone/tab/wearable
    price: { type: Number, required: true },

    segment: { type: String, trim: true },      // 6-10...100
    model_code: { type: String, trim: true },   // A066BG etc

    product_code: { type: String, trim: true },
    category: { type: String, trim: true },
    source: { type: String, trim: true },

    tags: {
      type: [String],
      default: [],
    },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "inactive",
    },
    isAvailable: { type: Boolean, default: true },
  },
  { strict: false, timestamps: true }
);

productSchema.index(
  { brand: 1, product_code: 1 },
  { unique: true, partialFilterExpression: { product_code: { $type: "string" } } }
);

module.exports = mongoose.model("Product", productSchema);