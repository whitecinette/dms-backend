const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true
    },
    description: {
      type: String,
      default: ''
    },
    // Firms will be connected via ref in Firm model
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed // for future custom fields (e.g., head office, location, GST, etc.)
    }
  },
  {
    timestamps: true,
    strict: false // allows dynamic fields later if needed
  }
);

module.exports = mongoose.model('Organization', organizationSchema);
