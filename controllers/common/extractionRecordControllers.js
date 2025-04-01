const axios = require('axios');
const ExtractionRecord = require('../../model/ExtractionRecord');
const Product = require('../../model/Product'); // Adjust path as needed
const User = require('../../model/User');

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

exports.getDealerDropdownForExtraction = async (req, res) => {
    try {
        // Fetch users where role is "dealer" and only select the "name" field
        // const dealers = await User.find({ role: "dealer" }).select("name");
        const dealers = await User.find({ role: "dealer" }).select("name -_id");

        if (!dealers.length) {
            return res.status(404).json({ message: "No dealers found." });
        }

        return res.status(200).json(dealers);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};


// Rakshita 
exports.addExtractionRecordsFromApp = async (req, res) => {
    try {
      const { code } = req.user; // Extracted from token (uploadedBy)
      const { dealer, products } = req.body;
  
      if (!code || !dealer || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: code, dealerCode, or products",
        });
      }
  
      const extractionEntries = products.map(product => ({
        uploaded_by: code,
        dealer: dealer,
        brand: product.brand,
        product_name: product.product_name,
        product_code: product.product_code || "", // fallback if needed
        price: product.price,
        quantity: product.quantity,
        amount: product.price * product.quantity,
        segment: product.segment || "",
        product_category: product.product_category || "",
      }));
  
      await ExtractionRecord.insertMany(extractionEntries);
  
      res.status(201).json({
        success: true,
        message: "Extraction records saved successfully.",
      });
  
    } catch (error) {
      console.error("Error in addExtractionRecordsFromApp:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  };

exports.getCurrentMonthExtractionsForUser = async (req, res) => {
try {
    console.log("Extrac get reached");
    const { code } = req.user;

    if (!code) {
    return res.status(400).json({
        success: false,
        message: "User code not found in token.",
    });
    }

    // Get start and end of current month in IST
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;

    const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const endOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59));

    const startIST = new Date(startOfMonth.getTime() + istOffset);
    const endIST = new Date(endOfMonth.getTime() + istOffset);

    // Fetch extraction records
    const records = await ExtractionRecord.find({
    uploaded_by: code,
    createdAt: { $gte: startIST, $lte: endIST }
    }).sort({ createdAt: -1 });

    // Define table headers (for frontend)
    const tableHeaders = [
    "dealer_code",
    "product_name",
    "product_code",
    "product_category",
    "price",
    "quantity",
    "total",
    "segment"
    ];

    // Convert records to table format
    const tableData = records.map((rec) => ({
    dealer_code: rec.dealer || "",
    product_name: rec.product_name || "", // optional, only if you store it
    product_code: rec.product_code || "",
    product_category: rec.product_category || "",
    price: rec.price || 0,
    quantity: rec.quantity || 0,
    total: rec.amount || 0,
    segment: rec.segment || ""
    }));

    res.status(200).json({
    success: true,
    headers: tableHeaders,
    data: tableData,
    });

} catch (error) {
    console.error("Error in getCurrentMonthExtractionsForUser:", error);
    res.status(500).json({
    success: false,
    message: "Internal server error",
    });
}
};
   