const mongoose = require('mongoose');

const TravelBillSchema = new mongoose.Schema(
  {
    billType: {
      type: String,
      enum: ['Restaurant', 'Travel', 'Hotel', 'Transport', 'Fuel', 'Other'],
      required: true,
    },
    billImages: {
      type: [String],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'paid'],
      default: 'pending',
    },
    isGenerated: {
      type: Boolean,
      default: false,
    },
    remarks: {
      type: String,
    },
    approvedAt: {
      type: Date,
    },
    paidAt: {
      type: Date,
    },
    code: {
     type: String,
   }
  },
  {
    timestamps: true, // createdAt (when uploaded), updatedAt (on any change)
    strict: false,
  }
);

module.exports = mongoose.model('Travels', TravelBillSchema);
