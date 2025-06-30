// model/MetaData.js
const mongoose = require('mongoose');

const metaDataSchema = new mongoose.Schema({}, { strict: false, timestamps: true });

module.exports = mongoose.model('MetaData', metaDataSchema);
