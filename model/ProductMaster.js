const mongoose = require("mongoose");

const productMasterSchema = new mongoose.Schema(
  {
    // =============================
    // BASIC PRODUCT INFO
    // =============================

    brand: {
      type: String,
      trim: true,
      index: true, // Market share & filtering
    },

    sku: {
      type: String,
      required: true,
      trim: true,
      unique: true, // SKU must be unique
      index: true,  // Critical for $lookup joins
    },

    model: {
      type: String,
      trim: true,
      index: true,
    },

    color: {
      type: String,
      trim: true,
    },

    family: {
      type: String,
      trim: true,
    },

    product_name: {
      type: String,
      trim: true,
    },

    dp: {
      type: Number,
    },

    mop: {
      type: Number,
    },

    model_age: {
      type: String,
      trim: true,
    },

    category: {
      type: String,
      trim: true,
      index: true,
    },

    sub_category: {
      type: String,
      trim: true,
    },

    segment: {
      type: String,
      trim: true,
      index: true, // Segment wise reporting
    },

    sub_segment: {
      type: String,
      trim: true,
      index: true, // Price bucket reporting
    },

    // =============================
    // CONTROL FLAGS (IMPORTANT)
    // =============================

    is_active: {
      type: Boolean,
      default: true,
      index: true, // Fast filtering
    },

    market_share_active: {
      type: Boolean,
      default: true,
      index: true, // Market share logic
    },

    is_accessory: {
      type: Boolean,
      default: false,
      index: true,
    },

    is_smartphone: {
      type: Boolean,
      default: true,
      index: true,
    },

    is_focus_model: {
      type: Boolean,
      default: false,
    },

    competitor_type: {
      type: String,
      enum: ["Own", "Competitor"],
      default: "Own",
      index: true,
    },

    launch_month: {
      type: String, // Format: "YYYY-MM"
    },

    // =============================
    // META
    // =============================

    in_billed_dis: {
      type: Number,
    },

    last_modified_date: {
      type: String, // Keep raw string (India time safe)
    },

    last_modified_by: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    strict: false,
  }
);

// =============================
// COMPOUND INDEXES (ADVANCED OPTIMIZATION)
// =============================

// Brand + Segment queries
productMasterSchema.index({ brand: 1, segment: 1 });

// Segment + Price Bucket queries
productMasterSchema.index({ segment: 1, sub_segment: 1 });

// Market share filtering
productMasterSchema.index({ brand: 1, market_share_active: 1 });

// Active product filtering
productMasterSchema.index({ is_active: 1, brand: 1 });

module.exports = mongoose.model("ProductMaster", productMasterSchema);
