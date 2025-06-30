const mongoose = require("mongoose");

const voucherSchema = new mongoose.Schema({
  userCode: {
    type: String,
    required: true,
    ref: "User", // Reference to your user system
  },
  routePlanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RoutePlan",
    required: true,
  },
  from: {
    type: String,
    required: true,
  },
  to: {
    type: String,
    required: true,
  },
  distanceInKm: {
    type: Number,
    required: true,
  },
  ratePerKm: {
    type: Number,
    default: 10,
  },
  calculatedAmount: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ["Pending", "Approved", "Rejected"],
    default: "Pending",
  },
  remarks: {
    type: String,
    default: "",
  },
  approvedBy: {
    type: String, // can hold admin code or ID
  },
  approvedAt: {
    type: Date,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  attachedBills: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillUpload", // if bills are stored in another model
    },
  ],
}, {
  timestamps: true, // adds createdAt and updatedAt
});

module.exports = mongoose.model("Voucher", voucherSchema);
