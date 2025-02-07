const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid"); // Import UUID for unique ID generation

const firmSchema = new mongoose.Schema(
    {
        firmId: { type: String, unique: true, required: true }, // Unique firm ID
        name: { type: String, required: true, unique: true },
        owners: [
            {
                name: { type: String, required: true },
                phone: { type: String, required: true },
                email: { type: String, required: true, unique: true }
            }
        ],
        gstNumber: { type: String, required: true, unique: true },
        logo: {
            type: String
        },
        address: {
            street: { type: String, required: true },
            city: { type: String, required: true },
            state: { type: String, required: true },
            zipCode: { type: String, required: true },
        },
        contact: {
            phone: { type: String },
            email: { type: String },
        },
        accountDetails: {
            bankName: { type: String },
            accountNumber: { type: String },
            ifscCode: { type: String },
            branchName: { type: String },
            accountHolderName: { type: String },
        },
        website: String,
        registrationDate: { type: Date, default: Date.now },
        status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
    },
    { 
        timestamps: true,
        strict: false
     }
);

module.exports = mongoose.model("Firm", firmSchema);
