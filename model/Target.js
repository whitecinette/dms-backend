const mongoose = require('mongoose');

const targetSchema = new mongoose.Schema({
    entity: { type: String, required: true }, // Actor Code
    value: { type: mongoose.Schema.Types.Mixed, required: true }, // Can be String, Object, Array, or Number
    expiry: { type: Date, required: true }, // Expiry Date
    status: { 
        type: String, 
        enum: ['active', 'inactive'], 
        default: 'inactive' 
    }
}, { timestamps: true });

// Middleware to set expiry time to 23:59:59
targetSchema.pre('save', function(next) {
    if (this.expiry) {
        let date = new Date(this.expiry);
        date.setHours(23, 59, 59, 999); // Ensure expiry is end of day
        this.expiry = date;
    }
    next();
});

module.exports = mongoose.model('Target', targetSchema);
