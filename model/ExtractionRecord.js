const mongoose = require('mongoose');

const extractionRecordSchema = new mongoose.Schema({
    uploadedBy: {
        type: String, // employeeCode
        required: true
    },
    dealerCode: {
        type: String,
        required: true
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    model_code: {
        type: String,
        required: true
    },
    quantity: {
        type: Number,
        required: true
    },
    amount: {
        type: Number,
        required: true
    }
}, { timestamps: true });

const ExtractionRecord = mongoose.model('ExtractionRecord', extractionRecordSchema);

module.exports = ExtractionRecord;
