const mongoose = require('mongoose');

const SalesDataSchema = new mongoose.Schema({
    spd: { type: String, required: true },
    mdd: { type: String, required: true },
    sales_type: { type: String, required: true },
    buyer_code: { type: String, required: true },
    buyer_type: { type: String, required: true },
    product_code: { type: String, required: true },
    quantity: { type: Number, required: true }, // Negative values allowed
    total_amount: { type: Number, required: true },
    channel: { type: String, required: true },
    date: { type: Date, required: true },
    month: { type: Number, required: true },
    year: { type: Number, required: true }
}, { 
    strict: false, 
    timestamps: true 
});

module.exports = mongoose.model('SalesData', SalesDataSchema);
