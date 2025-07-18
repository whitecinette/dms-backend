const mongoose = require('mongoose');

const requestPlanSchema = new mongoose.Schema(
  {
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    code: {
      type: String,
      required: true,   
    },
    name: {
      type: String,
      required: true,
    },
    itinerary: {
      type: Map,
      of: [String], // Allows flexible fields: district, zone, state, province, etc.
      default: {},
    },
    status: {
      type: String,
      enum: ['approved', 'rejected', 'requested'],
      default: 'requested',
    },
    approved: {
      type: Boolean,
      default: false,
    },
  },
  {
    strict: false,   // Allows storing extra fields if needed
    timestamps: true // Adds createdAt and updatedAt
  }
);

module.exports = mongoose.model('RequestedRoutePlan', requestPlanSchema);
