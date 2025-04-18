const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    OrderNumber:{ type: String, required: true, unique: true },
    UserId: { type: String, ref: 'User', required: true }, // Name of the dealer
    Products: [
        {
            ProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true }, // Reference to Product model
            Quantity: { type: Number, required: true }, // Quantity ordered
        }
    ],
    TotalPrice: { type: Number, required: true }, // Calculated total price of the order
    OrderStatus: {
        type: String,
        enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'],
        default: 'pending'
    },
    OrderDate: { type: Date, default: Date.now }, // Date of order placement
    DeliveryDate: { type: Date, required: false }, // Optional field for expected delivery date
    Remarks: { type: String, required: false } // Optional field for dealer comments or special instructions
}, { strict: false, timestamps: true });

module.exports = mongoose.model('Order', orderSchema);