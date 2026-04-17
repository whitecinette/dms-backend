const mongoose = require("mongoose");

const hierarchyEntrySchema = new mongoose.Schema(
  {
    hierarchy_name: { type: String, required: true, trim: true, index: true },
    // Other hierarchy levels (szd, asm, mdd, tse, etc.) will be dynamically added
  },
  {
    timestamps: true,
    strict: false,
  }
);

// optional but recommended compound index for your main scope query
hierarchyEntrySchema.index({ hierarchy_name: 1 });

module.exports =
  mongoose.models.HierarchyEntries ||
  mongoose.model("HierarchyEntries", hierarchyEntrySchema);