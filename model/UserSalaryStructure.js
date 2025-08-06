const mongoose = require("mongoose");

const userSalaryStructureSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    componentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalaryComponent",
      required: true,
    },
    valueOverride: {
      type: Number,
    },
    isCustom: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true, strict: false }
);

module.exports = mongoose.model("UserSalaryStructure", userSalaryStructureSchema);
