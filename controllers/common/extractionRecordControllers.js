const axios = require('axios');
const ExtractionRecord = require('../../model/ExtractionRecord');
const Product = require('../../model/Product'); // Adjust path as needed
const User = require('../../model/User');
const moment = require("moment");
const HierarchyEntries = require('../../model/HierarchyEntries');
const { Parser } = require("json2csv");
const ActorCode = require("../../model/ActorCode");

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

// exports.getCurrentMonthExtractionsForUser = async (req, res) => {
// try {
//     console.log("Extrac get reached");
//     const { code } = req.user;

//     if (!code) {
//     return res.status(400).json({
//         success: false,
//         message: "User code not found in token.",
//     });
//     }

//     // Get start and end of current month in IST
//     const now = new Date();
//     const istOffset = 5.5 * 60 * 60 * 1000;

//     const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
//     const endOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59));

//     const startIST = new Date(startOfMonth.getTime() + istOffset);
//     const endIST = new Date(endOfMonth.getTime() + istOffset);

//     // Fetch extraction records
//     const records = await ExtractionRecord.find({
//     uploaded_by: code,
//     createdAt: { $gte: startIST, $lte: endIST }
//     }).sort({ createdAt: -1 });

//     // Define table headers (for frontend)
//     const tableHeaders = [
//     "dealer_code",
//     "product_name",
//     "product_code",
//     "product_category",
//     "price",
//     "quantity",
//     "total",
//     "segment"
//     ];

//     // Convert records to table format
//     const tableData = records.map((rec) => ({
//     dealer_code: rec.dealer || "",
//     product_name: rec.product_name || "", // optional, only if you store it
//     product_code: rec.product_code || "",
//     product_category: rec.product_category || "",
//     price: rec.price || 0,
//     quantity: rec.quantity || 0,
//     total: rec.amount || 0,
//     segment: rec.segment || ""
//     }));

//     res.status(200).json({
//     success: true,
//     headers: tableHeaders,
//     data: tableData,
//     });

// } catch (error) {
//     console.error("Error in getCurrentMonthExtractionsForUser:", error);
//     res.status(500).json({
//     success: false,
//     message: "Internal server error",
//     });
// }
// };
   
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

    // Step 1: Get unique dealer codes from records
    const dealerCodes = [...new Set(records.map(r => r.dealer).filter(Boolean))];

    // Step 2: Fetch dealer names from ActorCodes
    const dealerMap = {};
    const actors = await ActorCode.find({ code: { $in: dealerCodes } });
    actors.forEach(actor => {
      dealerMap[actor.code] = actor.name;
    });


    // Define table headers (for frontend)
    const tableHeaders = [
    "dealer_code",
    "dealer_name",
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
      dealer_name: dealerMap[rec.dealer] || "", // ✅ Added dealer name
      product_name: rec.product_name || "",
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

exports.getExtractionStatus = async (req, res) => {
    try {
      const {
        startDate,
        endDate,
        smd = [],
        asm = [],
        mdd = []
      } = req.body;
  
      const start = startDate
        ? new Date(startDate)
        : moment().startOf("month").toDate();
      const end = endDate
        ? new Date(endDate)
        : moment().endOf("month").toDate();
  
      // Step 1: Get relevant hierarchy entries
      const hierarchyFilter = { hierarchy_name: "default_sales_flow" };
      if (smd.length > 0) hierarchyFilter.smd = { $in: smd };
      if (asm.length > 0) hierarchyFilter.asm = { $in: asm };
      if (mdd.length > 0) hierarchyFilter.mdd = { $in: mdd };
  
      const hierarchy = await HierarchyEntries.find(hierarchyFilter);
  
      const tseToDealers = {};
  
      for (let entry of hierarchy) {
        const tseCode = entry.tse;
        if (!tseToDealers[tseCode]) tseToDealers[tseCode] = new Set();
        tseToDealers[tseCode].add(entry.dealer);
      }
  
      const results = [];
  
      for (let tseCode in tseToDealers) {
        const dealers = Array.from(tseToDealers[tseCode]);
  
        const doneDealers = await ExtractionRecord.distinct("dealer", {
          dealer: { $in: dealers },
          uploaded_by: tseCode,
          createdAt: { $gte: start, $lte: end }
        });
  
        const doneCount = doneDealers.length;
        const totalCount = dealers.length;
        const pendingCount = totalCount - doneCount;
  
        const donePercent = totalCount > 0 ? ((doneCount / totalCount) * 100).toFixed(2) : "0.00";
        const pendingPercent = totalCount > 0 ? ((pendingCount / totalCount) * 100).toFixed(2) : "0.00";
  
        // Fetch name from User model
        const user = await User.findOne({ code: tseCode });
  
        results.push({
          name: user?.name || "N/A",
          code: tseCode,
          total: totalCount,
          done: doneCount,
          donePercent,
          pending: pendingCount,
          pendingPercent
        });
      }
  
      res.status(200).json({ success: true, data: results });
    } catch (error) {
      console.error("Error in getExtractionStatus:", error);
      res.status(500).json({ success: false, message: "Internal Server Error" });
    }
  };

  // exports.getExtractionRecords = async (req, res) => {
  //   try {
  //     const { startDate, endDate, uploadedBy } = req.body;
  //     console.log("Request Body:", req.body);
  
  //     const filter = {};
  
  //     // Date range filter
  //     if (startDate || endDate) {
  //       filter.createdAt = {};
  //       if (startDate) filter.createdAt.$gte = new Date(startDate);
  //       if (endDate) filter.createdAt.$lte = new Date(endDate);
  //     }
  
  //     // Uploaded By filter
  //     if (uploadedBy) {
  //       filter.uploaded_by = uploadedBy;
  //     }
  
  //     // Aggregation: Get latest record for each unique dealer
  //     const records = await ExtractionRecord.aggregate([
  //       { $match: filter },
  //       { $sort: { createdAt: -1 } },
  //       {
  //         $group: {
  //           _id: "$dealer",
  //           record: { $first: "$$ROOT" }
  //         }
  //       },
  //       { $replaceWith: "$record" },
  //       { $sort: { createdAt: -1 } }
  //     ]);
  
  //     // Format for response
  //     const formattedRecords = records.map(record => ({
  //       "Dealer Code": record.dealer,
  //       uploadedBy: record.uploaded_by,
  //       Segment: record.segment,
  //       Brand: record.brand,
  //       "Product Name": record.product_name,
  //       "Product Code": record.product_code,
  //       Price: record.price,
  //       Quantity: record.quantity,
  //       Amount: record.amount,
  //       Product_category: record.product_category,
  //       "Date": record.createdAt
  //     }));
  
  //     return res.status(200).json({
  //       success: true,
  //       data: formattedRecords,
  //       total: formattedRecords.length
  //     });
  
  //   } catch (error) {
  //     console.error("Error in getExtractionRecords:", error);
  //     return res.status(500).json({
  //       success: false,
  //       message: "Internal server error"
  //     });
  //   }
  // };
  

  
  
  exports.getExtractionRecordsForDownload = async (req, res) => {
    try {
      const { startDate, endDate, smd = [], asm = [], mdd = [] } = req.query;
  
      // Step 1: Define default date range
      const start = startDate ? new Date(startDate) : moment().startOf("month").toDate();
      const end = endDate ? new Date(endDate) : moment().endOf("month").toDate();
  
      // Step 2: Build hierarchy filter
      const hierarchyFilter = { hierarchy_name: "default_sales_flow" };
      if (smd.length) hierarchyFilter.smd = { $in: smd };
      if (asm.length) hierarchyFilter.asm = { $in: asm };
      if (mdd.length) hierarchyFilter.mdd = { $in: mdd };
  
      const hierarchyEntries = await HierarchyEntries.find(hierarchyFilter).lean();
      if (!hierarchyEntries.length) {
        return res.status(200).json({ message: "No records found", data: [], total: 0 });
      }
  
      // Step 3: Group dealers by TSE
      const tseToDealersMap = {};
      hierarchyEntries.forEach(({ tse, dealer }) => {
        if (!tseToDealersMap[tse]) tseToDealersMap[tse] = new Set();
        tseToDealersMap[tse].add(dealer);
      });
  
      const tseCodes = Object.keys(tseToDealersMap);
  
      // Step 4: Get all users once
      const users = await User.find({ code: { $in: tseCodes } }, "code name").lean();
      const userMap = users.reduce((acc, user) => {
        acc[user.code] = user.name;
        return acc;
      }, {});
  
      // Step 5: Fetch extraction records
      const allRecords = [];
  
      for (const tseCode of tseCodes) {
        const dealers = Array.from(tseToDealersMap[tseCode]);
  
        const records = await ExtractionRecord.find({
          dealer: { $in: dealers },
          uploaded_by: tseCode,
          createdAt: { $gte: start, $lte: end },
        }).sort({ createdAt: -1 }).lean();
  
        records.forEach(record => {
          allRecords.push({
            name: userMap[tseCode] || "N/A",
            code: tseCode,
            dealerCode: record.dealer,
            segment: `="${record.segment}"`,
            brand: record.brand,
            productName: record.product_name,
            productCode: record.product_code,
            price: record.price,
            quantity: record.quantity,
            amount: record.amount,
            productCategory: record.product_category,
            date: new Date(record.createdAt).toISOString().split("T")[0],
          });
        });
      }
  
      // Step 6: Format for CSV
      const fields = [
        "name", "code", "dealerCode", "segment", "brand", "productName",
        "productCode", "price", "quantity", "amount", "productCategory", "date",
      ];
      const parser = new Parser({ fields });
      const csv = parser.parse(allRecords);
  
      res.header("Content-Type", "text/csv");
      res.attachment("extraction_records.csv");
      return res.send(csv);
  
    } catch (error) {
      console.error("Error in getExtractionRecordsForDownload:", error);
      return res.status(500).json({
        message: "Error downloading extraction records",
        error: error.message,
      });
    }
  };

// get extraction report for admin
  exports.getExtractionReportForAdmin = async (req, res) => {
   try {
       const { startDate, endDate, segment, brand, metric = 'volume' } = req.query;

       const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
       const end = endDate
         ? new Date(endDate)
         : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999);
       
       const matchStage = {
           createdAt: { $gte: start, $lte: end }
       };

       if (segment) matchStage.segment = segment;
       if (brand) matchStage.brand = brand;

       const brands = ['Samsung', 'Vivo', 'Oppo', 'Xiaomi', 'Apple', 'OnePlus', 'Realme', 'Motorola'];

       const getPriceClassExpr = {
           $switch: {
               branches: [
                   { case: { $lt: ["$price", 6000] }, then: "<6k" },
                   { case: { $lt: ["$price", 10000] }, then: "6-10k" },
                   { case: { $lt: ["$price", 15000] }, then: "10-15k" },
                   { case: { $lt: ["$price", 20000] }, then: "15-20k" },
                   { case: { $lt: ["$price", 30000] }, then: "20-30k" },
                   { case: { $lt: ["$price", 40000] }, then: "30-40k" },
                   { case: { $lt: ["$price", 70000] }, then: "40-70k" },
                   { case: { $lt: ["$price", 100000] }, then: "70-100k" },
               ],
               default: "100k+"
           }
       };

       const aggregationPipeline = [
           { $match: matchStage },
           {
               $project: {
                   brand: {
                       $cond: {
                           if: { $in: [{ $toLower: "$brand" }, brands.map(b => b.toLowerCase())] },
                           then: {
                               $concat: [
                                   { $toUpper: { $substrCP: ["$brand", 0, 1] } },
                                   {
                                       $substrCP: [
                                           { $toLower: "$brand" },
                                           1,
                                           { $subtract: [{ $strLenCP: "$brand" }, 1] }
                                       ]
                                   }
                               ]
                           },
                           else: "Others"
                       }
                   },
                   priceClass: getPriceClassExpr,
                   value: {
                       $cond: {
                           if: { $eq: [metric, "value"] },
                           then: { $ifNull: ["$amount", { $multiply: ["$price", "$quantity"] }] },
                           else: "$quantity"
                       }
                   }
               }
           },
           {
               $group: {
                   _id: { priceClass: "$priceClass", brand: "$brand" },
                   total: { $sum: "$value" }
               }
           },
           {
               $group: {
                   _id: "$_id.priceClass",
                   brands: {
                       $push: {
                           brand: "$_id.brand",
                           total: "$total"
                       }
                   }
               }
           },
           {
               $project: {
                   _id: 0,
                   priceClass: "$_id",
                   brands: 1
               }
           }
       ];

       const aggregatedData = await ExtractionRecord.aggregate(aggregationPipeline);

       const response = aggregatedData.map(entry => {
           const row = { "Price Class": entry.priceClass, "Rank of Samsung": null };

           // Initialize all brands
           brands.concat("Others").forEach(b => {
               row[b] = 0;
           });

           entry.brands.forEach(b => {
               row[b.brand] = b.total;
           });

           // Calculate rank of Samsung
           const sortedBrands = Object.entries(row)
               .filter(([key]) => brands.includes(key) || key === "Others")
               .sort(([, a], [, b]) => b - a);

           const samsungIndex = sortedBrands.findIndex(([b]) => b === "Samsung");
           row["Rank of Samsung"] = samsungIndex >= 0 ? samsungIndex + 1 : null;

           return row;
       });

       return res.status(200).json({
           metricUsed: metric,
           totalPriceClasses: response.length,
           data: response
       });

   } catch (error) {
       console.error("Error in getExtractionReport:", error.message, error.stack);
       return res.status(500).json({ error: 'Internal Server Error', details: error.message });
   }
};

// get extraction report for asm
exports.getExtractionReportForAsm = async (req, res) => {
 try {
   const { asmCode } = req.query;

   if (!asmCode) {
     return res.status(400).json({ error: 'ASM code is required.' });
   }

   // Step 1: Find all hierarchy entries for the ASM
   const hierarchyEntries = await HierarchyEntries.find({ asm: asmCode });

   if (!hierarchyEntries.length) {
     return res.status(404).json({ error: 'No hierarchy found for the given ASM code.' });
   }

   // Step 2: Extract unique MDD, TSE, and Dealer codes under this ASM
   const mddSet = new Set();
   const tseSet = new Set();
   const dealerSet = new Set();

   hierarchyEntries.forEach(entry => {
     if (entry.mdd) mddSet.add(entry.mdd);
     if (entry.tse) tseSet.add(entry.tse);
     if (entry.dealer) dealerSet.add(entry.dealer);
   });

   const mddCodes = [...mddSet];
   const tseCodes = [...tseSet];
   const dealerCodes = [...dealerSet];

   return res.status(200).json({
     asm: asmCode,
     totalMdd: mddCodes.length,
     totalTse: tseCodes.length,
     totalDealers: dealerCodes.length,
     mddCodes,
     tseCodes,
     dealerCodes
   });

 } catch (error) {
   console.error("Error getting report for ASM:", error);
   return res.status(500).json({ error: 'Internal Server Error' });
 }
};

// get extraction report for mdd

exports.getExtractionReportForMdd = async (req, res) => {
 try {
   const { mddCode } = req.query;

   if (!mddCode) {
     return res.status(400).json({ error: 'MDD code is required.' });
   }

   // Step 1: Fetch all hierarchy entries for the given MDD
   const hierarchyEntries = await HierarchyEntries.find({ mdd: mddCode });

   if (!hierarchyEntries.length) {
     return res.status(404).json({ error: 'No hierarchy found for the given MDD code.' });
   }

   // Step 2: Extract unique TSE and Dealer codes under this MDD
   const tseSet = new Set();
   const dealerSet = new Set();

   hierarchyEntries.forEach(entry => {
     if (entry.tse) tseSet.add(entry.tse);
     if (entry.dealer) dealerSet.add(entry.dealer);
   });

   const tseCodes = [...tseSet];
   const dealerCodes = [...dealerSet];

   return res.status(200).json({
     mdd: mddCode,
     totalTse: tseCodes.length,
     totalDealers: dealerCodes.length,
     tseCodes,
     dealerCodes
   });

 } catch (error) {
   console.error("Error getting extraction report for MDD:", error);
   return res.status(500).json({ error: 'Internal Server Error' });
 }
};




  
  
  

