const axios = require('axios');
const ExtractionRecord = require('../../model/ExtractionRecord');
const Product = require('../../model/Product'); // Adjust path as needed

const { BACKEND_URL } = process.env;
exports.addExtractionRecord = async (req, res) => {
    try {
        console.log("Reaching extraction record API");
        const { products, dealerCode, code } = req.body;
        // const { code } = req; // Employee Code

        if (!products || !dealerCode || !code) {
            return res.status(400).json({
                error: 'Please provide all required fields: products (array), dealerCode, and employee code.'
            });
        }

        if (!Array.isArray(products) || products.length === 0) {
            return res.status(400).json({
                error: 'The products field should be a non-empty array.'
            });
        }

        let extractionRecords = [];
        let modelCodeMap = new Map();

        for (const productData of products) {
            const { productId, quantity } = productData;

            if (!productId || !quantity) {
                return res.status(400).json({
                    error: 'Each product must have productId and quantity.'
                });
            }

            // Fetch product details
            const productResponse = await axios.get(`${BACKEND_URL}/product/by-id/${productId}`);
            if (!productResponse.data.product) {
                return res.status(404).json({ error: `Product not found with id: ${productId}` });
            }

            const product = productResponse.data.product;
            const amount = product.price * quantity;
            const model_code = product.model_code; // Assuming the product has a model_code field
            const brand = product.brand;

            // Ensure each model_code gets only one entry
            if (modelCodeMap.has(model_code)) {
                // Update existing quantity and amount
                let existingRecord = modelCodeMap.get(model_code);
                existingRecord.quantity += quantity;
                existingRecord.amount += amount;
            } else {
                // Create new entry for this model_code
                let newRecord = new ExtractionRecord ({
                    productId,
                    brand,
                    dealerCode,
                    quantity,
                    uploadedBy: code,
                    amount,
                    model_code
                });

                modelCodeMap.set(model_code, newRecord);
            }
        }

        // Save all records to the database
        for (let record of modelCodeMap.values()) {
            const savedRecord = await record.save();
            extractionRecords.push(savedRecord);
        }

        return res.status(200).json({
            message: 'Extraction Records added successfully.',
            records: extractionRecords
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal Server Error!' });
    }
};
