const mongoose = require("mongoose");

const hierarchyEntrySchema = new mongoose.Schema(
  {
    hierarchy_name: { type: String, required: true },
    // Other hierarchy levels (szd, asm, mdd, tse, etc.) will be dynamically added
  },
  {
    timestamps: true, // Automatically adds createdAt & updatedAt
    strict: false, // Allows flexible schema updates
  }
);

module.exports = mongoose.model("hierarchyentries", hierarchyEntrySchema);
