const mongoose = require("mongoose");

const dealerHierarchySchema = new mongoose.Schema(
  {
    // =========================
    // Dealer Info
    // =========================
    dealer_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    dealer_name: {
      type: String,
      trim: true,
    },
    dealer_category: {
      type: String,
      trim: true,
      uppercase: true,
    },

    // =========================
    // Beat Info
    // =========================
    beat_code: {
      type: String,
      trim: true,
      uppercase: true,
    },
    beat_name: {
      type: String,
      trim: true,
    },
    beat_days: {
      type: String,
      trim: true,
      uppercase: true,
    },

    // =========================
    // Location Info
    // =========================
    master_latitude: Number,
    master_longitude: Number,

  location: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point"
    },
    coordinates: [Number]
  },


    // =========================
    // Hierarchy Levels
    // =========================
    mdd_code: { type: String, trim: true, uppercase: true },
    mdd_name: { type: String, trim: true },

    tse_code: { type: String, trim: true, uppercase: true },
    tse_name: { type: String, trim: true },

    so_code: { type: String, trim: true, uppercase: true },
    so_name: { type: String, trim: true },

    smd_code: { type: String, trim: true, uppercase: true },
    smd_name: { type: String, trim: true },

    asm_code: { type: String, trim: true, uppercase: true },
    asm_name: { type: String, trim: true },

    acc_asm_code: { type: String, trim: true, uppercase: true },
    acc_asm_name: { type: String, trim: true },

    zm_code: { type: String, trim: true, uppercase: true },
    zm_name: { type: String, trim: true },

    acc_zm_code: { type: String, trim: true, uppercase: true },
    acc_zm_name: { type: String, trim: true },

    sh_code: { type: String, trim: true, uppercase: true },
    sh_name: { type: String, trim: true },

    bm_code: { type: String, trim: true, uppercase: true },
    bm_name: { type: String, trim: true },

    abm_code: { type: String, trim: true, uppercase: true },
    abm_name: { type: String, trim: true },

    zsm_code: { type: String, trim: true, uppercase: true },
    zsm_name: { type: String, trim: true },

    ase_code: { type: String, trim: true, uppercase: true },
    ase_name: { type: String, trim: true },

    zse_code: { type: String, trim: true, uppercase: true },
    zse_name: { type: String, trim: true },

    rm_code: { type: String, trim: true, uppercase: true },
    rm_name: { type: String, trim: true },

    rsm_code: { type: String, trim: true, uppercase: true },
    rsm_name: { type: String, trim: true },

    rso_code: { type: String, trim: true, uppercase: true },
    rso_name: { type: String, trim: true },

    dam_code: { type: String, trim: true, uppercase: true },
    dam_name: { type: String, trim: true },

    sss_code: { type: String, trim: true, uppercase: true },
    sss_name: { type: String, trim: true },

    rasm_code: { type: String, trim: true, uppercase: true },
    rasm_name: { type: String, trim: true },
  },
  {
    timestamps: true,
    strict: false,
  }
);


// =========================
// INDEXING STRATEGY
// =========================

// Unique dealer identity
dealerHierarchySchema.index({ dealer_code: 1 }, { unique: true });

// Core hierarchy indexes
dealerHierarchySchema.index({ asm_code: 1 });
dealerHierarchySchema.index({ tse_code: 1 });
dealerHierarchySchema.index({ zm_code: 1 });
dealerHierarchySchema.index({ rm_code: 1 });
dealerHierarchySchema.index({ mdd_code: 1 });
dealerHierarchySchema.index({ smd_code: 1 });
dealerHierarchySchema.index({ rsm_code: 1 });
dealerHierarchySchema.index({ rso_code: 1 });

// Beat & category reporting
dealerHierarchySchema.index({ beat_code: 1 });
dealerHierarchySchema.index({ dealer_category: 1 });

// Compound index (VERY IMPORTANT for ASM → TSE reports)
dealerHierarchySchema.index({ asm_code: 1, tse_code: 1 });

// Geo index
dealerHierarchySchema.index({ location: "2dsphere" });

module.exports = mongoose.model("DealerHierarchy", dealerHierarchySchema);
