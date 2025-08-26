const mongoose = require('mongoose');

const userTypesAndConfigsSchema = new mongoose.Schema(
  {
    firmCode: { type: String, required: true }, // e.g. "SiddhaCorp_01"
    
    typeName: { type: String, required: true }, // e.g. "Type A", "Jockey Group", etc.
    
    userCodes: [{ type: String, required: true }], // e.g. ["SC-TSE001", "SC-TSE002"]
    
    flowName: { type: String, required: true }, // e.g. "jockey_flow", not a ref
    
    extraConfigs: { type: Object, default: {} }, // optional — for future flexibility
  },
  {
    timestamps: true,
    strict: false, // Allows adding other keys later without schema change
  }
);

module.exports = mongoose.model('UserTypesAndConfigs', userTypesAndConfigsSchema);
