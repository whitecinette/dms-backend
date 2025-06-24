const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid"); // Import UUID for unique ID generation

const firmSchema = new mongoose.Schema(
 {
  firmId: {
    type: String,
    required: true,
    unique: true,
    default: uuidv4,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  owners: [
    {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, required: true },
    },
  ],

  gstNumber: { type: String, unique: true },
  logo: { type: String },

  address: {
    street: { type: String },
    city: { type: String },
    state: { type: String },
    zipCode: { type: String },
  },

  contact: {
    phone: { type: String },
    email: { type: String },
  },

  accountDetails: {
    bankName: String,
    accountNumber: String,
    ifscCode: String,
    branchName: String,
    accountHolderName: String,
  },

  website: String,
  registrationDate: { type: Date, default: Date.now },
  status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
  description: {
    type: String,
    default: "",
  },
  orgId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
  },
  // You can assign one or multiple hierarchy types
  flowTypes: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ActorTypesHierarchy",
    },
  ],
  branding: {
    logoUrl: String,
    primaryColor: String,
    secondaryColor: String,
  },
  config: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: undefined,
  },
},
{
  timestamps: true,
  strict: false,
}
);

// ✅ Compound index to ensure name is unique per org
firmSchema.index({ name: 1, orgId: 1 }, { unique: true });

module.exports = mongoose.model("Firm", firmSchema);
