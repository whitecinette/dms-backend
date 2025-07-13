const mongoose = require("mongoose");

const policyConfigSchema = new mongoose.Schema({
  state: { type: String, required: true, unique: true },
  pf: { type: Number, default: 0 },  // e.g. 12
  esi: { type: Number, default: 0 }, // e.g. 0.75
});

module.exports = mongoose.model("PayrollPolicy", policyConfigSchema);
