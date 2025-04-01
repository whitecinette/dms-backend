const mongoose = require('mongoose');

const extractionRecordSchema = new mongoose.Schema({
    uploaded_by: {
        type: String, // employeeCode
        required: true
    },
    dealer: {
        type: String,
        required: true
    },
    brand: {
        type: String,
        required: true
    },
    priduct_name : {
        type: String
    },
    product_code: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    quantity: {
        type: Number,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    segment: {
        type: String
    },
    product_category: {
        type: String
    },

}, { timestamps: true, strict: false });

const ExtractionRecord = mongoose.model('ExtractionRecord', extractionRecordSchema);

module.exports = ExtractionRecord;
