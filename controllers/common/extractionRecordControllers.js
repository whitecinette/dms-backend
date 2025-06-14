const axios = require('axios');
const ExtractionRecord = require('../../model/ExtractionRecord');
const Product = require('../../model/Product'); // Adjust path as needed
const User = require('../../model/User');
const moment = require("moment");
const HierarchyEntries = require('../../model/HierarchyEntries');
const { Parser } = require("json2csv");
const ActorCode = require("../../model/ActorCode");
const SalesData = require('../../model/SalesData');
const XLSX = require("xlsx");

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

      // Fetch dealer details for all dealers associated with this TSE
      const dealerDetails = await User.find(
        { code: { $in: dealers } },
        { code: 1, name: 1, _id: 0 }
      );

      // Create allDealers array with status
      const allDealers = dealers.map((dealerCode) => {
        const dealer = dealerDetails.find((d) => d.code === dealerCode) || {
          code: dealerCode,
          name: "N/A",
        };
        return {
          code: dealer.code,
          name: dealer.name,
          status: doneDealers.includes(dealerCode) ? "done" : "pending",
        };
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
          pendingPercent,
          allDealers
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
  

  
  
  // exports.getExtractionRecordsForDownload = async (req, res) => {
  //   try {
  //     const { startDate, endDate, smd = [], asm = [], mdd = [] } = req.query;
  
  //     // Step 1: Define default date range
  //     const start = startDate ? new Date(startDate) : moment().startOf("month").toDate();
  //     const end = endDate ? new Date(endDate) : moment().endOf("month").toDate();
  
  //     // Step 2: Build hierarchy filter
  //     const hierarchyFilter = { hierarchy_name: "default_sales_flow" };
  //     if (smd.length) hierarchyFilter.smd = { $in: smd };
  //     if (asm.length) hierarchyFilter.asm = { $in: asm };
  //     if (mdd.length) hierarchyFilter.mdd = { $in: mdd };
  
  //     const hierarchyEntries = await HierarchyEntries.find(hierarchyFilter).lean();
  //     if (!hierarchyEntries.length) {
  //       return res.status(200).json({ message: "No records found", data: [], total: 0 });
  //     }
  
  //     // Step 3: Group dealers by TSE
  //     const tseToDealersMap = {};
  //     hierarchyEntries.forEach(({ tse, dealer }) => {
  //       if (!tseToDealersMap[tse]) tseToDealersMap[tse] = new Set();
  //       tseToDealersMap[tse].add(dealer);
  //     });
  
  //     const tseCodes = Object.keys(tseToDealersMap);
  
  //     // Step 4: Get all users once
  //     const users = await User.find({ code: { $in: tseCodes } }, "code name").lean();
  //     const userMap = users.reduce((acc, user) => {
  //       acc[user.code] = user.name;
  //       return acc;
  //     }, {});
  
  //     // Step 5: Fetch extraction records
  //     const allRecords = [];
  
  //     for (const tseCode of tseCodes) {
  //       const dealers = Array.from(tseToDealersMap[tseCode]);
  
  //       const records = await ExtractionRecord.find({
  //         dealer: { $in: dealers },
  //         uploaded_by: tseCode,
  //         createdAt: { $gte: start, $lte: end },
  //       }).sort({ createdAt: -1 }).lean();
  
  //       records.forEach(record => {
  //         allRecords.push({
  //           name: userMap[tseCode] || "N/A",
  //           code: tseCode,
  //           dealerCode: record.dealer,
  //           segment: `="${record.segment}"`,
  //           brand: record.brand,
  //           productName: record.product_name,
  //           productCode: record.product_code,
  //           price: record.price,
  //           quantity: record.quantity,
  //           amount: record.amount,
  //           productCategory: record.product_category,
  //           date: new Date(record.createdAt).toISOString().split("T")[0],
  //         });
  //       });
  //     }
  
  //     // Step 6: Format for CSV
  //     const fields = [
  //       "name", "code", "dealerCode", "segment", "brand", "productName",
  //       "productCode", "price", "quantity", "amount", "productCategory", "date",
  //     ];
  //     const parser = new Parser({ fields });
  //     const csv = parser.parse(allRecords);
  
  //     res.header("Content-Type", "text/csv");
  //     res.attachment("extraction_records.csv");
  //     return res.send(csv);
  
  //   } catch (error) {
  //     console.error("Error in getExtractionRecordsForDownload:", error);
  //     return res.status(500).json({
  //       message: "Error downloading extraction records",
  //       error: error.message,
  //     });
  //   }
  // };

 exports.getExtractionRecordsForDownload = async (req, res) => {
  try {
    const { startDate, endDate, smd = [], asm = [], mdd = [] } = req.query;

    const start = startDate ? new Date(startDate) : moment().startOf("month").toDate();
    const end = endDate ? new Date(endDate) : moment().endOf("month").toDate();

    const hierarchyFilter = { hierarchy_name: "default_sales_flow" };
    if (smd.length) hierarchyFilter.smd = { $in: smd };
    if (asm.length) hierarchyFilter.asm = { $in: asm };
    if (mdd.length) hierarchyFilter.mdd = { $in: mdd };

    const hierarchyEntries = await HierarchyEntries.find(hierarchyFilter).lean();
    if (!hierarchyEntries.length) {
      return res.status(200).json({ message: "No records found", data: [], total: 0 });
    }

    const tseToDealersMap = {};
    hierarchyEntries.forEach(({ tse, dealer }) => {
      if (!tseToDealersMap[tse]) tseToDealersMap[tse] = new Set();
      tseToDealersMap[tse].add(dealer);
    });

    const tseCodes = Object.keys(tseToDealersMap);

    const users = await User.find({ code: { $in: tseCodes } }, "code name").lean();
    const userMap = users.reduce((acc, user) => {
      acc[user.code] = user.name;
      return acc;
    }, {});

    const allDealerCodes = Array.from(new Set(hierarchyEntries.map((entry) => entry.dealer)));
    const dealerDetails = await User.find(
      { code: { $in: allDealerCodes } },
      { code: 1, name: 1, _id: 0 }
    ).lean();
    const dealerMap = dealerDetails.reduce((acc, dealer) => {
      acc[dealer.code] = dealer.name || "N/A";
      return acc;
    }, {});

    const summaryData = [];
    const recordsData = [];

    for (const tseCode of tseCodes) {
      const dealers = Array.from(tseToDealersMap[tseCode]);

      const doneDealers = await ExtractionRecord.distinct("dealer", {
        dealer: { $in: dealers },
        uploaded_by: tseCode,
        createdAt: { $gte: start, $lte: end },
      });

      const doneCount = doneDealers.length;
      const totalCount = dealers.length;
      const pendingCount = totalCount - doneCount;

      const donePercent = totalCount > 0 ? ((doneCount / totalCount) * 100).toFixed(2) : "0.00";
      const pendingPercent = totalCount > 0 ? ((pendingCount / totalCount) * 100).toFixed(2) : "0.00";

      // Create a row for each dealer
      dealers.forEach((dealerCode) => {
        summaryData.push({
          name: userMap[tseCode] || "N/A",
          code: tseCode,
          total: totalCount,
          done: doneCount,
          donePercent,
          pending: pendingCount,
          pendingPercent,
          dealerName: dealerMap[dealerCode] || "N/A",
          dealerCode,
          status: doneDealers.includes(dealerCode) ? "done" : "pending",
        });
      });

      const records = await ExtractionRecord.find({
        dealer: { $in: dealers },
        uploaded_by: tseCode,
        createdAt: { $gte: start, $lte: end },
      }).sort({ createdAt: -1 }).lean();

      records.forEach((record) => {
        recordsData.push({
          name: userMap[tseCode] || "N/A",
          code: tseCode,
          dealerCode: record.dealer,
          dealerName: dealerMap[record.dealer] || "N/A",
          dealerStatus: doneDealers.includes(record.dealer) ? "done" : "pending",
          segment: record.segment,
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

    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryFields = [
      "name",
      "code",
      "total",
      "done",
      "donePercent",
      "pending",
      "pendingPercent",
      "dealerName",
      "dealerCode",
      "status",
    ];
    const summaryWs = XLSX.utils.json_to_sheet(summaryData, { header: summaryFields });
    XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

    // Records sheet
    const recordsFields = [
      "name",
      "code",
      "dealerCode",
      "dealerName",
      "dealerStatus",
      "segment",
      "brand",
      "productName",
      "productCode",
      "price",
      "quantity",
      "amount",
      "productCategory",
      "date",
    ];
    const recordsWs = XLSX.utils.json_to_sheet(recordsData, { header: recordsFields });
    XLSX.utils.book_append_sheet(wb, recordsWs, "Records");

    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    res.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.attachment("extraction_records.xlsx");
    return res.send(buffer);

  } catch (error) {
    console.error("Error in getExtractionRecordsForDownload:", error);
    return res.status(500).json({
      message: "Error downloading extraction records",
      error: error.message,
    });
  }
};

// get extraction report for admin
// exports.getExtractionReportForAdmin = async (req, res) => {
//  try {
//      const { startDate, endDate, segment, brand, metric = 'volume' } = req.query;

//      const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//      const end = endDate
//        ? new Date(endDate)
//        : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999);

//      const matchStage = {
//          createdAt: { $gte: start, $lte: end }
//      };

//      if (segment) matchStage.segment = segment;
//      if (brand) matchStage.brand = brand;

//      const brands = ['Samsung', 'Vivo', 'Oppo', 'Xiaomi', 'Apple', 'OnePlus', 'Realme', 'Motorola'];

//      const aggregationPipeline = [
//          { $match: matchStage },
//          {
//              $project: {
//                  brand: {
//                      $cond: {
//                          if: { $in: [{ $toLower: "$brand" }, brands.map(b => b.toLowerCase())] },
//                          then: {
//                              $concat: [
//                                  { $toUpper: { $substrCP: ["$brand", 0, 1] } },
//                                  {
//                                      $substrCP: [
//                                          { $toLower: "$brand" },
//                                          1,
//                                          { $subtract: [{ $strLenCP: "$brand" }, 1] }
//                                      ]
//                                  }
//                              ]
//                          },
//                          else: "Others"
//                      }
//                  },
//                  priceClass: {
//                      $switch: {
//                          branches: [
//                              { case: { $lt: ["$price", 6000] }, then: "<6k" },
//                              { case: { $lt: ["$price", 10000] }, then: "6-10k" },
//                              { case: { $lt: ["$price", 15000] }, then: "10-15k" },
//                              { case: { $lt: ["$price", 20000] }, then: "15-20k" },
//                              { case: { $lt: ["$price", 30000] }, then: "20-30k" },
//                              { case: { $lt: ["$price", 40000] }, then: "30-40k" },
//                              { case: { $lt: ["$price", 70000] }, then: "40-70k" },
//                              { case: { $lt: ["$price", 100000] }, then: "70-100k" }
//                          ],
//                          default: "100k+"
//                      }
//                  },
//                  priceClassOrder: {
//                      $switch: {
//                          branches: [
//                              { case: { $lt: ["$price", 6000] }, then: 0 },
//                              { case: { $lt: ["$price", 10000] }, then: 1 },
//                              { case: { $lt: ["$price", 15000] }, then: 2 },
//                              { case: { $lt: ["$price", 20000] }, then: 3 },
//                              { case: { $lt: ["$price", 30000] }, then: 4 },
//                              { case: { $lt: ["$price", 40000] }, then: 5 },
//                              { case: { $lt: ["$price", 70000] }, then: 6 },
//                              { case: { $lt: ["$price", 100000] }, then: 7 }
//                          ],
//                          default: 8
//                      }
//                  },
//                  value: {
//                      $cond: {
//                          if: { $eq: [metric, "value"] },
//                          then: { $ifNull: ["$amount", { $multiply: ["$price", "$quantity"] }] },
//                          else: "$quantity"
//                      }
//                  }
//              }
//          },
//          {
//              $group: {
//                  _id: {
//                      priceClass: "$priceClass",
//                      priceClassOrder: "$priceClassOrder",
//                      brand: "$brand"
//                  },
//                  total: { $sum: "$value" }
//              }
//          },
//          {
//              $group: {
//                  _id: {
//                      priceClass: "$_id.priceClass",
//                      priceClassOrder: "$_id.priceClassOrder"
//                  },
//                  brands: {
//                      $push: {
//                          brand: "$_id.brand",
//                          total: "$total"
//                      }
//                  }
//              }
//          },
//          {
//              $sort: {
//                  "_id.priceClassOrder": 1
//              }
//          },
//          {
//              $project: {
//                  _id: 0,
//                  priceClass: "$_id.priceClass",
//                  brands: 1
//              }
//          }
//      ];

//      const aggregatedData = await ExtractionRecord.aggregate(aggregationPipeline);

//      const response = aggregatedData.map(entry => {
//     const row = { "Price Class": entry.priceClass, "Rank of Samsung": null };

//     // Initialize all brands
//     brands.concat("Others").forEach(b => {
//         row[b] = 0;
//     });

//     // Fill brand totals for this price class
//     entry.brands.forEach(b => {
//         row[b.brand] = b.total;
//     });

//     // Calculate rank of Samsung
//     const sortedBrands = Object.entries(row)
//         .filter(([key]) => brands.includes(key) || key === "Others")
//         .sort(([, a], [, b]) => b - a);

//     const samsungIndex = sortedBrands.findIndex(([b]) => b === "Samsung");
//     row["Rank of Samsung"] = samsungIndex >= 0 ? samsungIndex + 1 : null;

//     // Calculate total for the price band (sum of all brand totals)
//     const totalForPriceBand = sortedBrands.reduce((sum, [, val]) => sum + val, 0);
//     row["Total"] = totalForPriceBand;

//     return row;
// });

// // Calculate grand totals across all price bands for each brand and overall
// const grandTotalRow = { "Price Class": "Total", "Rank of Samsung": null };

// brands.concat("Others").forEach(b => {
//     grandTotalRow[b] = response.reduce((sum, row) => sum + (row[b] || 0), 0);
// });


// // Append grand total row to response
// response.push(grandTotalRow);


//      return res.status(200).json({
//          metricUsed: metric,
//          totalPriceClasses: response.length,
//          data: response
//      });

//  } catch (error) {
//      console.error("Error in getExtractionReport:", error.message, error.stack);
//      return res.status(500).json({ error: 'Internal Server Error', details: error.message });
//  }
// };

const hierarchyLevels = ['smd', 'asm', 'mdd', 'tse', 'dealer'];

exports.getExtractionReportForAdmin = async (req, res) => {
  try {
    const { startDate, endDate, segment, brand, metric = 'volume' } = req.query;

    // Step 1: Build match dates
    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999);

    // Step 2: Get all matching dealers from hierarchy
    const hierarchyFilters = {};
    hierarchyLevels.forEach(level => {
      if (req.query[level]) {
        hierarchyFilters[level] = req.query[level];
      }
    });

    const matchingDealersSet = new Set();
    if (Object.keys(hierarchyFilters).length > 0) {
      const matchingHierarchy = await HierarchyEntries.find({
        hierarchy_name: "default_sales_flow",
        ...hierarchyFilters
      });
      matchingHierarchy.forEach(entry => {
        if (entry.dealer) {
          matchingDealersSet.add(entry.dealer);
        }
      });
    }

    const dealerFilter = [...matchingDealersSet];
    const matchStage = {
      createdAt: { $gte: start, $lte: end }
    };
    if (segment) matchStage.segment = segment;
    if (brand) matchStage.brand = brand;
    if (dealerFilter.length > 0) {
      matchStage.dealer = { $in: dealerFilter };
    }

    // Step 3: Brand List
    const brands = ['Samsung', 'Vivo', 'Oppo', 'Xiaomi', 'Apple', 'OnePlus', 'Realme', 'Motorola'];

    const priceClassMap = {
      0: "<6k", 1: "6-10k", 2: "10-15k", 3: "15-20k",
      4: "20-30k", 5: "30-40k", 6: "40-70k", 7: "70-100k", 8: "100k+"
    };

    // Step 4: Aggregation
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
          priceClassOrder: {
            $switch: {
              branches: [
                { case: { $lt: ["$price", 6000] }, then: 0 },
                { case: { $lt: ["$price", 10000] }, then: 1 },
                { case: { $lt: ["$price", 15000] }, then: 2 },
                { case: { $lt: ["$price", 20000] }, then: 3 },
                { case: { $lt: ["$price", 30000] }, then: 4 },
                { case: { $lt: ["$price", 40000] }, then: 5 },
                { case: { $lt: ["$price", 70000] }, then: 6 },
                { case: { $lt: ["$price", 100000] }, then: 7 }
              ],
              default: 8
            }
          },
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
          _id: {
            priceClassOrder: "$priceClassOrder",
            brand: "$brand"
          },
          total: { $sum: "$value" }
        }
      },
      {
        $group: {
          _id: "$_id.priceClassOrder",
          brands: {
            $push: {
              brand: "$_id.brand",
              total: "$total"
            }
          }
        }
      },
      { $sort: { "_id": 1 } }
    ];

    const aggregatedData = await ExtractionRecord.aggregate(aggregationPipeline);

    // Step 5: Final response formatting
    const response = aggregatedData.map(entry => {
      const row = {
        "Price Class": priceClassMap[entry._id],
        "Rank of Samsung": null
      };

      brands.concat("Others").forEach(b => {
        row[b] = 0;
      });

      entry.brands.forEach(b => {
        row[b.brand] = b.total;
      });

      const sortedBrands = Object.entries(row)
        .filter(([key]) => brands.includes(key) || key === "Others")
        .sort(([, a], [, b]) => b - a);

      const samsungIndex = sortedBrands.findIndex(([b]) => b === "Samsung");
      row["Rank of Samsung"] = samsungIndex >= 0 ? samsungIndex + 1 : null;

      row["Total"] = sortedBrands.reduce((sum, [, val]) => sum + val, 0);
      return row;
    });

    // Step 6: Grand Total Row
    const grandTotalRow = { "Price Class": "Total", "Rank of Samsung": null };
    brands.concat("Others").forEach(b => {
      grandTotalRow[b] = response.reduce((sum, row) => sum + (row[b] || 0), 0);
    });
    grandTotalRow["Total"] = brands.concat("Others").reduce((sum, b) => sum + grandTotalRow[b], 0);
    response.push(grandTotalRow);

    return res.status(200).json({
      metricUsed: metric,
      data: response
    });

  } catch (error) {
    console.error("Error in getExtractionReport:", error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
exports.getHierarchyFilters = async (req, res) => {
 try {
   const hierarchyName = "default_sales_flow";
   const hierarchyLevels = ['smd', 'asm', 'mdd', 'tse', 'dealer'];

   // Step 1: Collect all query filters
   const filters = { hierarchy_name: hierarchyName };
   hierarchyLevels.forEach(level => {
     if (req.query[level]) {
       filters[level] = req.query[level];
     }
   });

   // Step 2: Find all hierarchy entries that match all filters
   const hierarchyEntries = await HierarchyEntries.find(filters);

   // Step 3: Collect all unique codes from these entries
   const codeSet = new Set();
   hierarchyEntries.forEach(entry => {
     hierarchyLevels.forEach(level => {
       if (entry[level]) {
         codeSet.add(entry[level]);
       }
     });
   });

   const allCodes = [...codeSet];

   // Step 4: Get names for these codes
   const actorCodes = await ActorCode.find({ code: { $in: allCodes } });
   const codeNameMap = {};
   actorCodes.forEach(actor => {
     codeNameMap[actor.code] = actor.name;
   });

   // Step 5: Group by hierarchy level
   const grouped = {};
   const uniqueSet = {};
   hierarchyLevels.forEach(level => {
     grouped[level] = [];
     uniqueSet[level] = new Set();
   });

   hierarchyEntries.forEach(entry => {
     hierarchyLevels.forEach(level => {
       const code = entry[level];
       if (code && !uniqueSet[level].has(code)) {
         uniqueSet[level].add(code);
         grouped[level].push({
           code,
           name: codeNameMap[code] || null
         });
       }
     });
   });

   return res.status(200).json(grouped);

 } catch (error) {
   console.error("Error in getHierarchyFilters:", error);
   return res.status(500).json({ error: "Internal Server Error" });
 }
};






  
  
  

