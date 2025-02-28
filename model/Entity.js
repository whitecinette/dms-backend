const mongoose = require('mongoose');

const entitySchema = new mongoose.Schema({
    name: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true }, // Can be String, Object, or Array
    expiry: { type: Date, required: true }, // Proper Date field
    status: { 
        type: String, 
        enum: ['active', 'inactive'], 
        default: 'inactive' 
    }
}, { strict: false, timestamps: true });

// Middleware to ensure expiry time is always set to 23:59:59
entitySchema.pre('save', function(next) {
    if (this.expiry) {
        let date = new Date(this.expiry);
        date.setHours(23, 59, 59, 999); // Set time to 23:59:59.999
        this.expiry = date;
    }
    next();
});

module.exports = mongoose.model('Entity', entitySchema);
