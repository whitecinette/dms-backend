const axios = require("axios");
const ExtractionRecord = require("../../model/ExtractionRecord");
const Product = require("../../model/Product"); // Adjust path as needed
const User = require("../../model/User");
const moment = require("moment");
const HierarchyEntries = require("../../model/HierarchyEntries");
const { Parser } = require("json2csv");
const ActorCode = require("../../model/ActorCode");
const SalesData = require("../../model/SalesData");
const XLSX = require("xlsx");

const { BACKEND_URL } = process.env;

exports.addExtractionRecord = async (req, res) => {
  try {
    console.log("Reaching extraction record API");
    const { products, dealerCode, code } = req.body;
    // const { code } = req; // Employee Code

    if (!products || !dealerCode || !code) {
      return res.status(400).json({
        error:
          "Please provide all required fields: products (array), dealerCode, and employee code.",
      });
    }

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        error: "The products field should be a non-empty array.",
      });
    }

    let extractionRecords = [];
    let modelCodeMap = new Map();

    for (const productData of products) {
      const { productId, quantity } = productData;

      if (!productId || !quantity) {
        return res.status(400).json({
          error: "Each product must have productId and quantity.",
        });
      }

      // Fetch product details
      const productResponse = await axios.get(
        `${BACKEND_URL}/product/by-id/${productId}`
      );
      if (!productResponse.data.product) {
        return res
          .status(404)
          .json({ error: `Product not found with id: ${productId}` });
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
        let newRecord = new ExtractionRecord({
          productId,
          brand,
          dealerCode,
          quantity,
          uploadedBy: code,
          amount,
          model_code,
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
      message: "Extraction Records added successfully.",
      records: extractionRecords,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error!" });
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
// exports.addExtractionRecordsFromApp = async (req, res) => {
//   try {
//     const { code } = req.user; // Extracted from token (uploadedBy)
//     const { dealer, products } = req.body;

//     if (!code || !dealer || !Array.isArray(products) || products.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing required fields: code, dealerCode, or products",
//       });
//     }

//     const extractionEntries = products.map((product) => ({
//       uploaded_by: code,
//       dealer: dealer,
//       brand: product.brand,
//       product_name: product.product_name,
//       product_code: product.product_code || "", // fallback if needed
//       price: product.price,
//       quantity: product.quantity,
//       amount: product.price * product.quantity,
//       segment: product.segment || "",
//       product_category: product.product_category || "",
//     }));

//     await ExtractionRecord.insertMany(extractionEntries);

//     res.status(201).json({
//       success: true,
//       message: "Extraction records saved successfully.",
//     });
//   } catch (error) {
//     console.error("Error in addExtractionRecordsFromApp:", error);
//     res.status(500).json({
//       success: false,
//       message: "Internal server error",
//     });
//   }
// };

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

    const extractionEntries = products.map((product) => ({
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

        // Hierarchy-based authorization check for TSEs
    if (req.user.position === 'tse') {
      const hierarchyEntry = await HierarchyEntries.findOne({
        hierarchy_name: 'default_sales_flow',
        tse: code,
        dealer: dealer,
      });

      if (!hierarchyEntry || hierarchyEntry.mdd !== '4782323') {
        return res.status(201).json({
          success: true,
          message: "Sorry you're not authorized to fill extraction data",
        });
      }
    }


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

    const startOfMonth = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), 1)
    );
    const endOfMonth = new Date(
      Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    );

    const startIST = new Date(startOfMonth.getTime() + istOffset);
    const endIST = new Date(endOfMonth.getTime() + istOffset);

    // Fetch extraction records
    const records = await ExtractionRecord.find({
      uploaded_by: code,
      createdAt: { $gte: startIST, $lte: endIST },
    }).sort({ createdAt: -1 });

    // Step 1: Get unique dealer codes from records
    const dealerCodes = [
      ...new Set(records.map((r) => r.dealer).filter(Boolean)),
    ];

    // Step 2: Fetch dealer names from ActorCodes
    const dealerMap = {};
    const actors = await ActorCode.find({ code: { $in: dealerCodes } });
    actors.forEach((actor) => {
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
      "segment",
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
      segment: rec.segment || "",
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
    const { startDate, endDate, smd = [], asm = [], mdd = [] } = req.body;

    const start = startDate
      ? new Date(startDate)
      : moment().startOf("month").toDate();
    const end = endDate ? new Date(endDate) : moment().endOf("month").toDate();

    // Step 1: Get relevant hierarchy entries
    const hierarchyFilter = { hierarchy_name: "default_sales_flow" };
    if (smd.length > 0) hierarchyFilter.smd = { $in: smd };
    if (asm.length > 0) hierarchyFilter.asm = { $in: asm };
    if (mdd.length > 0) hierarchyFilter.mdd = { $in: mdd };

    const hierarchy = await HierarchyEntries.find(hierarchyFilter);

    // Step 2: Get all extractions within date range
    const allExtractions = await ExtractionRecord.find({
      createdAt: { $gte: start, $lte: end },
    }).distinct("dealer");

    const tseToDealers = {};

    for (let entry of hierarchy) {
      const tseCode = entry.tse;
      if (!tseToDealers[tseCode]) tseToDealers[tseCode] = new Set();
      tseToDealers[tseCode].add(entry.dealer);
    }

    const results = [];

    for (let tseCode in tseToDealers) {
      const dealers = Array.from(tseToDealers[tseCode]);

      // Fetch dealer details for all dealers associated with this TSE
      const dealerDetails = await User.find(
        { code: { $in: dealers } },
        { code: 1, name: 1, _id: 0 }
      );

      // Create allDealers array with status
      const allDealers = dealers.map((dealerCode) => {
        const dealer = dealerDetails.find((d) => d.code === dealerCode) || {
          code: dealerCode,
          name: "",
        };
        return {
          code: dealer.code,
          name: dealer.name,
          status: allExtractions.includes(dealerCode) ? "done" : "pending",
        };
      });

      const doneCount = allDealers.filter(d => d.status === "done").length;
      const totalCount = dealers.length;
      const pendingCount = totalCount - doneCount;

      const donePercent =
        totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : "0";
      const pendingPercent =
        totalCount > 0 ? Math.round((pendingCount / totalCount) * 100) : "0";

      // Fetch name from User model
      const user = await User.findOne({ code: tseCode });

      results.push({
        name: user?.name || "",
        code: tseCode,
        total: totalCount,
        done: doneCount,
        "Done Percent": `${donePercent}%`,
        pending: pendingCount,
        "Pending Percent": `${pendingPercent}%`,
        allDealers,
      });
    }

    res.status(200).json({ success: true, data: results });
  } catch (error) {
    console.error("Error in getExtractionStatus:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// exports.getExtractionStatusRoleWise = async (req, res) => {
//   try {
//     let { roles = [], startDate, endDate } = req.body;
//     const { code: userCode, position: userPosition, role: userRole } = req.user;

//     if (!userCode || !userPosition || !userRole) {
//       return res.status(400).json({ success: false, message: "User authentication required" });
//     }

//     if (!Array.isArray(roles) || roles.length === 0) {
//       roles = ["tse"];
//     }

//     const start = startDate ? new Date(startDate) : moment().startOf("month").toDate();
//     const end = endDate ? new Date(endDate) : moment().endOf("month").toDate();

//     const results = [];

//     for (let role of roles) {
//       const users = await User.find({ position: role });

//       for (let user of users) {
//         const actorCode = user.code;

//         const hierarchyFilter = {
//           hierarchy_name: "default_sales_flow",
//           [role]: actorCode
//         };

//         if (userRole !== "admin") {
//           hierarchyFilter[userPosition] = userCode;
//         }

//         const hierarchyEntries = await HierarchyEntries.find(hierarchyFilter);
//         const dealerSet = new Set();
//         for (let entry of hierarchyEntries) {
//           if (entry.dealer) dealerSet.add(entry.dealer);
//         }

//         const dealers = Array.from(dealerSet);
//         if (dealers.length === 0) continue;

//         const doneDealers = await ExtractionRecord.distinct("dealer", {
//           dealer: { $in: dealers },
//           createdAt: { $gte: start, $lte: end },
//         });

//         const totalCount = dealers.length;
//         const doneCount = doneDealers.length;
//         const pendingCount = totalCount - doneCount;
//         const donePercent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
//         const pendingPercent = 100 - donePercent;

//         results.push({
//           name: user.name || "N/A",
//           code: actorCode,
//           position: role.toUpperCase(),
//           total: totalCount,
//           done: doneCount,
//           "Done Percent": `${donePercent}%`,
//           pending: pendingCount,
//           "Pending Percent": `${pendingPercent}%`
//         });
//       }
//     }

//     // 👇 Add current user's own data as selfData (separate section)
//     let selfData = null;

//     const selfFilter = {
//       hierarchy_name: "default_sales_flow",
//       [userPosition]: userCode
//     };

//     const selfEntries = await HierarchyEntries.find(selfFilter);
//     const selfDealers = new Set();

//     for (let entry of selfEntries) {
//       if (entry.dealer) selfDealers.add(entry.dealer);
//     }

//     const selfDealerList = Array.from(selfDealers);

//     if (selfDealerList.length > 0) {
//       const selfDoneDealers = await ExtractionRecord.distinct("dealer", {
//         dealer: { $in: selfDealerList },
//         createdAt: { $gte: start, $lte: end },
//       });

//       const total = selfDealerList.length;
//       const done = selfDoneDealers.length;
//       const pending = total - done;
//       const donePct = total > 0 ? Math.round((done / total) * 100) : 0;
//       const pendingPct = 100 - donePct;

//       selfData = {
//         name: req.user.name || "You",
//         code: userCode,
//         position: userPosition.toUpperCase(),
//         total: total,
//         done: done,
//         "Done Percent": `${donePct}%`,
//         pending: pending,
//         "Pending Percent": `${pendingPct}%`
//       };
//     }

//     res.status(200).json({
//       success: true,
//       data: results,
//       selfData: selfData // 👈 attach separately
//     });

//   } catch (error) {
//     console.error("Error in getExtractionStatusRoleWise:", error);
//     res.status(500).json({ success: false, message: "Internal Server Error" });
//   }
// };

exports.getExtractionStatusRoleWise = async (req, res) => {
  try {
    let { roles = [], startDate, endDate } = req.body;
    console.log("Extraction start last: ", startDate, endDate);
    const { code: userCode, position: userPosition, role: userRole } = req.user;

    if (!userCode || !userPosition || !userRole) {
      return res.status(400).json({ success: false, message: "User authentication required" });
    }

    const blockedRoles = ['tse', 'dealer'];
    const isRestricted = blockedRoles.includes(userRole.toLowerCase()) || blockedRoles.includes(userPosition.toLowerCase());

    if (!Array.isArray(roles) || roles.length === 0) {
      roles = ["tse"];
    }
    console.log("Extraction cp 1");

    const start = startDate ? new Date(startDate) : moment().startOf("month").toDate();
    const end = endDate ? new Date(endDate) : moment().endOf("month").toDate();

    const results = [];
    console.log("Extraction cp 2");

    // ✅ Only fetch others' data if NOT blocked
    if (!isRestricted) {
      for (let role of roles) {
        const users = await User.find({ position: role });

        for (let user of users) {
          const actorCode = user.code;

          const hierarchyFilter = {
            hierarchy_name: "default_sales_flow",
            [role]: actorCode
          };

          if (userRole !== "admin") {
            hierarchyFilter[userPosition] = userCode;
          }
          console.log("Extraction cp 3");

          const hierarchyEntries = await HierarchyEntries.find(hierarchyFilter);
          const dealerSet = new Set();
          for (let entry of hierarchyEntries) {
            if (entry.dealer) dealerSet.add(entry.dealer);
          }

          const dealers = Array.from(dealerSet);
          if (dealers.length === 0) continue;

          const doneDealers = await ExtractionRecord.distinct("dealer", {
            dealer: { $in: dealers },
            createdAt: { $gte: start, $lte: end },
          });

          const totalCount = dealers.length;
          const doneCount = doneDealers.length;
          const pendingCount = totalCount - doneCount;
          const donePercent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
          const pendingPercent = 100 - donePercent;
          console.log("Extraction cp 4");

          results.push({
            name: user.name || "N/A",
            code: actorCode,
            position: role.toUpperCase(),
            total: totalCount,
            done: doneCount,
            "Done Percent": `${donePercent}%`,
            pending: pendingCount,
            "Pending Percent": `${pendingPercent}%`
          });
        }
      }
    }

    // ✅ Always calculate selfData, even if blocked
    let selfData = null;

    const selfFilter = {
      hierarchy_name: "default_sales_flow",
      [userPosition]: userCode
    };

    const selfEntries = await HierarchyEntries.find(selfFilter);
    const selfDealers = new Set();

    for (let entry of selfEntries) {
      if (entry.dealer) selfDealers.add(entry.dealer);
    }

    const selfDealerList = Array.from(selfDealers);

    if (selfDealerList.length > 0) {
      const selfDoneDealers = await ExtractionRecord.distinct("dealer", {
        dealer: { $in: selfDealerList },
        createdAt: { $gte: start, $lte: end },
      });

      const total = selfDealerList.length;
      const done = selfDoneDealers.length;
      const pending = total - done;
      const donePct = total > 0 ? Math.round((done / total) * 100) : 0;
      const pendingPct = 100 - donePct;

      selfData = {
        name: req.user.name || "You",
        code: userCode,
        position: userPosition.toUpperCase(),
        total: total,
        done: done,
        "Done Percent": `${donePct}%`,
        pending: pending,
        "Pending Percent": `${pendingPct}%`
      };
    }

    return res.status(200).json({
      success: true,
      data: results,      // empty if TSE/Dealer
      selfData: selfData  // always included if available
    });

  } catch (error) {
    console.error("Error in getExtractionStatusRoleWise:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.getDealersWithStatusForExtraction = async (req, res) => {
  try {
    console.log("Here!<3")
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : moment().startOf("month").toDate();
    const end = endDate ? new Date(endDate) : moment().endOf("month").toDate();

    // 🔐 Get user code (from req.user or fallback to req.query/params)
    const userCode = req.user?.code || req.query.code || req.params.code;
    // 🧑‍💼 Fetch position from DB using code
    const user = await User.findOne({ code: userCode });
    if (!user || !user.position) {
      return res.status(404).json({ success: false, message: "User not found or position missing" });
    }
    const userPosition = user.position;

    if (!userCode || !userPosition) {
      return res.status(400).json({ success: false, message: "User code and position required" });
    }

    // 🔍 Get hierarchy entries for that user
    const hierarchyEntries = await HierarchyEntries.find({
      hierarchy_name: "default_sales_flow",
      [userPosition]: userCode,
    });

    const dealerSet = new Set();
    for (let entry of hierarchyEntries) {
      if (entry.dealer) dealerSet.add(entry.dealer);
    }

    const dealerCodes = Array.from(dealerSet);
    if (dealerCodes.length === 0) {
      return res.status(200).json({ success: true, dealers: [] });
    }

    // 🔍 Fetch extraction done dealers
    const doneDealers = await ExtractionRecord.distinct("dealer", {
      dealer: { $in: dealerCodes },
      createdAt: { $gte: start, $lte: end },
    });

    const doneSet = new Set(doneDealers);

    // 🧾 Get full dealer info
      const allDealers = await User.find({ code: { $in: dealerCodes }, role: "dealer" });

      const dealersWithStatus = allDealers.map(dealer => ({
        ...dealer.toObject(),
        status: doneSet.has(dealer.code) ? "done" : "pending"
      }));

      // ✅ Sort: Show 'pending' dealers on top
      dealersWithStatus.sort((a, b) => {
        if (a.status === b.status) return 0;
        return a.status === 'pending' ? -1 : 1;
      });


    res.status(200).json({
      success: true,
      dealers: dealersWithStatus,
    });

  } catch (error) {
    console.error("Error in getDealersWithStatus:", error);
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
    console.log("download query", req.query);

    const start = startDate
      ? new Date(startDate).setUTCHours(0, 0, 0, 0)
      : moment().startOf("month").toDate().setUTCHours(0, 0, 0, 0);
    const end = endDate
      ? new Date(endDate).setUTCHours(23, 59, 59, 999)
      : moment().endOf("month").toDate().setUTCHours(23, 59, 59, 999);

    console.log("start date:", start);
    console.log("end date:", end);

    const hierarchyFilter = { hierarchy_name: "default_sales_flow" };
    if (smd.length) hierarchyFilter.smd = { $in: smd };
    if (asm.length) hierarchyFilter.asm = { $in: asm };
    if (mdd.length) hierarchyFilter.mdd = { $in: mdd };

    const hierarchyEntries = await HierarchyEntries.find(hierarchyFilter).lean();
    if (!hierarchyEntries.length) {
      return res
        .status(200)
        .json({ message: "No records found", data: [], total: 0 });
    }

    // Get all extractions within date range
    const allExtractions = await ExtractionRecord.find({
      createdAt: { $gte: start, $lte: end },
    }).distinct("dealer");

    const tseToDealersMap = {};
    hierarchyEntries.forEach(({ tse, dealer }) => {
      if (!tseToDealersMap[tse]) tseToDealersMap[tse] = new Set();
      tseToDealersMap[tse].add(dealer);
    });

    const tseCodes = Object.keys(tseToDealersMap);

    const users = await User.find(
      { code: { $in: tseCodes } },
      "code name"
    ).lean();
    const userMap = users.reduce((acc, user) => {
      acc[user.code] = user.name || "";
      return acc;
    }, {});

    const allDealerCodes = Array.from(
      new Set(hierarchyEntries.map((entry) => entry.dealer))
    );
    const dealerDetails = await User.find(
      { code: { $in: allDealerCodes } },
      { code: 1, name: 1, _id: 0 }
    ).lean();
    const dealerMap = dealerDetails.reduce((acc, dealer) => {
      acc[dealer.code] = dealer.name || "";
      return acc;
    }, {});

    const summaryData = [];
    const recordsData = [];

    for (const tseCode of tseCodes) {
      const dealers = Array.from(tseToDealersMap[tseCode]);

      const doneCount = dealers.filter((dealer) =>
        allExtractions.includes(dealer)
      ).length;
      const totalCount = dealers.length;
      const pendingCount = totalCount - doneCount;

      const donePercent =
        totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : "0";
      const pendingPercent =
        totalCount > 0 ? Math.round((pendingCount / totalCount) * 100) : "0";

      // Create a row for each dealer
      dealers.forEach((dealerCode) => {
        summaryData.push({
          Name: userMap[tseCode] || "",
          CODE: tseCode,
          TOTAL: totalCount,
          DONE: doneCount,
          "DONE PERCENT": donePercent,
          Pending: pendingCount,
          "PENDING PERCENT": pendingPercent,
          "DEALER NAME": dealerMap[dealerCode] || "",
          "DEALER CODE": dealerCode,
          STATUS: allExtractions.includes(dealerCode) ? "Done" : "Pending",
        });
      });

      const records = await ExtractionRecord.find({
        dealer: { $in: dealers },
        createdAt: { $gte: start, $lte: end },
      })
        .sort({ createdAt: -1 })
        .lean();

      records.forEach((record) => {
        recordsData.push({
          Name: userMap[tseCode] || "",
          CODE: tseCode,
          "DEALER CODE": record.dealer,
          "DEALER NAME": dealerMap[record.dealer] || "",
          "DEALER STATUS": allExtractions.includes(record.dealer)
            ? "Done"
            : "Pending",
          SEGMENT: record.segment,
          BRAND: record.brand,
          "PRODUCT NAME": record.product_name,
          "PRODUCT CODE": record.product_code,
          PRICE: record.price,
          QUANTITY: record.quantity,
          AMOUNT: record.amount,
          "PRODUCT CATEGORY": record.product_category,
          DATE: new Date(record.createdAt).toISOString().split("T")[0],
        });
      });
    }

    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryFields = [
      "Name",
      "CODE",
      "TOTAL",
      "DONE",
      "DONE PERCENT",
      "Pending",
      "PENDING PERCENT",
      "DEALER NAME",
      "DEALER CODE",
      "STATUS",
    ];
    const summaryWs = XLSX.utils.json_to_sheet(summaryData, {
      header: summaryFields,
    });
    XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

    // Records sheet
    const recordsFields = [
      "Name",
      "CODE",
      "DEALER CODE",
      "DEALER NAME",
      "SEGMENT",
      "BRAND",
      "PRODUCT NAME",
      "PRODUCT CODE",
      "PRICE",
      "QUANTITY",
      "AMOUNT",
      "PRODUCT CATEGORY",
      "DATE",
    ];
    const recordsWs = XLSX.utils.json_to_sheet(recordsData, {
      header: recordsFields,
    });
    XLSX.utils.book_append_sheet(wb, recordsWs, "Records");

    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    res.header(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
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

const hierarchyLevels = ["smd", "asm", "mdd", "tse", "dealer"];
const locationLevels = ["zone", "district", "town"];

// exports.getExtractionReportForAdmin = async (req, res) => {
//   try {
//     console.log("Extracton fo admin");
//     const {
//       startDate,
//       endDate,
//       segment,
//       brand,
//       metric = "volume",
//       view = "default",
//     } = req.query;
//     console.log("report", req.query);

//     // Helper: Parse a date string like "2025-07-01" as IST and return UTC Date
//     function parseISTDate(dateStr) {
//       const [year, month, day] = dateStr.split("T")[0].split("-").map(Number);
//       // Create IST date at midnight
//       const istDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
//       const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
//       // Convert IST to UTC by subtracting offset
//       return new Date(istDate.getTime() - IST_OFFSET_MS);
//     }

//     // Parse start and end dates, ignoring time
//     let start, end;
//     if (startDate) {
//       start = parseISTDate(startDate);
//     } else {
//       const now = new Date();
//       const y = now.getUTCFullYear();
//       const m = now.getUTCMonth() + 1;
//       start = parseISTDate(`${y}-${String(m).padStart(2, "0")}-01`);
//     }

//     if (endDate) {
//       end = parseISTDate(endDate);
//       // Set end date to end of day in UTC
//       end.setUTCHours(23, 59, 59, 999);
//     } else {
//       const now = new Date();
//       const y = now.getUTCFullYear();
//       const m = now.getUTCMonth() + 1;
//       const lastDay = new Date(y, m, 0).getDate();
//       end = parseISTDate(`${y}-${String(m).padStart(2, "0")}-${lastDay}`);
//       end.setUTCHours(23, 59, 59, 999);
//     }

//     // Step 2: Get all matching dealers from hierarchy and location filters
//     const hierarchyFilters = {};
//     hierarchyLevels.forEach((level) => {
//       if (req.query[level]) {
//         // Handle multiple values by splitting on comma
//         const values = Array.isArray(req.query[level]) 
//           ? req.query[level] 
//           : req.query[level].split(',').map(v => v.trim());
//         hierarchyFilters[level] = { $in: values };
//       }
//     });

//     const locationFilters = {};
//     locationLevels.forEach((level) => {
//       if (req.query[level]) {
//         // Handle multiple values by splitting on comma
//         const values = Array.isArray(req.query[level]) 
//           ? req.query[level] 
//           : req.query[level].split(',').map(v => v.trim());
//         locationFilters[level] = { $in: values };
//       }
//     });

//     // First approach: Get dealers that match BOTH hierarchy AND location filters
//     let dealerFilter = [];
    
//     if (Object.keys(hierarchyFilters).length > 0 || Object.keys(locationFilters).length > 0) {
//       // Get initial set of dealers from hierarchy if filters exist
//       let hierarchyDealers = [];
//       if (Object.keys(hierarchyFilters).length > 0) {
//         const matchingHierarchy = await HierarchyEntries.find({
//           hierarchy_name: "default_sales_flow",
//           ...hierarchyFilters,
//         });
//         hierarchyDealers = matchingHierarchy.map(entry => entry.dealer).filter(Boolean);
//       }
      
//       // Get initial set of dealers from location if filters exist
//       let locationDealers = [];
//       if (Object.keys(locationFilters).length > 0) {
//         const locationQuery = locationFilters;
//         const matchingLocations = await User.find(locationQuery);
//         locationDealers = matchingLocations.map(location => location.code).filter(Boolean);
//       }
      
//       // Combine based on which filters were provided
//       if (Object.keys(hierarchyFilters).length > 0 && Object.keys(locationFilters).length > 0) {
//         // Intersection - dealers must be in BOTH sets
//         const hierarchySet = new Set(hierarchyDealers);
//         dealerFilter = locationDealers.filter(dealer => hierarchySet.has(dealer));
        
//         // If both filters are provided but no dealers match, return empty response
//         if (dealerFilter.length === 0) {
//           return res.status(200).json({
//             metricUsed: metric,
//             viewUsed: view,
//             data: [],
//             dealerFilter: [],
//             message: "No dealers found matching both hierarchy and location filters"
//           });
//         }
//       } else if (Object.keys(hierarchyFilters).length > 0) {
//         // Only hierarchy filters
//         dealerFilter = hierarchyDealers;
        
//         // If hierarchy filters are provided but no dealers match, return empty response
//         if (dealerFilter.length === 0) {
//           return res.status(200).json({
//             metricUsed: metric,
//             viewUsed: view,
//             data: [],
//             dealerFilter: [],
//             message: "No dealers found matching hierarchy filters"
//           });
//         }
//       } else {
//         // Only location filters
//         dealerFilter = locationDealers;
        
//         // If location filters are provided but no dealers match, return empty response
//         if (dealerFilter.length === 0) {
//           return res.status(200).json({
//             metricUsed: metric,
//             viewUsed: view,
//             data: [],
//             dealerFilter: [],
//             message: "No dealers found matching location filters"
//           });
//         }
//       }
//     }

//     console.log("Dealer filters:", dealerFilter.length);

//     // Step 3: Brand List
//     const brands = [
//       "Samsung",
//       "Vivo",
//       "Oppo",
//       "Xiaomi",
//       "Apple",
//       "OnePlus",
//       "Realme",
//       "Motorola",
//     ];

//     const priceClassMap = {
//       0: "<6k",
//       1: "6-10k",
//       2: "10-15k",
//       3: "15-20k",
//       4: "20-30k",
//       5: "30-40k",
//       6: "40-70k",
//       7: "70-100k",
//       8: "100k+",
//     };

//     console.log("Samsun dates: ", start, end)

//     // Step 4: Aggregation for Samsung from SalesData
//     const samsungMatchStage = {
//       date: { $gte: start, $lte: end },
//       sales_type: "Sell Out",
//     };
//     if (segment) {
//       samsungMatchStage.segment = segment.replace(/[<>\+kK\s]/g, "");
//     }
//     if (dealerFilter.length > 0) {
//       samsungMatchStage.buyer_code = { $in: dealerFilter };
//     }

//     // const samsungPipeline = [
//     //   { $match: samsungMatchStage },
//     //   {
//     //     $project: {
//     //       brand: "Samsung",
//     //       priceClassOrder: {
//     //         $switch: {
//     //           branches: [
//     //             {
//     //               case: {
//     //                 $lt: [{ $divide: ["$total_amount", "$quantity"] }, 6000],
//     //               },
//     //               then: 0,
//     //             },
//     //             {
//     //               case: {
//     //                 $lt: [{ $divide: ["$total_amount", "$quantity"] }, 10000],
//     //               },
//     //               then: 1,
//     //             },
//     //             {
//     //               case: {
//     //                 $lt: [{ $divide: ["$total_amount", "$quantity"] }, 15000],
//     //               },
//     //               then: 2,
//     //             },
//     //             {
//     //               case: {
//     //                 $lt: [{ $divide: ["$total_amount", "$quantity"] }, 20000],
//     //               },
//     //               then: 3,
//     //             },
//     //             {
//     //               case: {
//     //                 $lt: [{ $divide: ["$total_amount", "$quantity"] }, 30000],
//     //               },
//     //               then: 4,
//     //             },
//     //             {
//     //               case: {
//     //                 $lt: [{ $divide: ["$total_amount", "$quantity"] }, 40000],
//     //               },
//     //               then: 5,
//     //             },
//     //             {
//     //               case: {
//     //                 $lt: [{ $divide: ["$total_amount", "$quantity"] }, 70000],
//     //               },
//     //               then: 6,
//     //             },
//     //             {
//     //               case: {
//     //                 $lt: [{ $divide: ["$total_amount", "$quantity"] }, 100000],
//     //               },
//     //               then: 7,
//     //             },
//     //           ],
//     //           default: 8,
//     //         },
//     //       },
//     //       value: {
//     //         $cond: {
//     //           if: { $eq: [metric, "value"] },
//     //           then: {
//     //             $ifNull: [
//     //               "$amount",
//     //               { $multiply: ["$total_amount", "$quantity"] },
//     //             ],
//     //           },
//     //           else: "$quantity",
//     //         },
//     //       },
//     //     },
//     //   },
//     //   {
//     //     $group: {
//     //       _id: {
//     //         priceClassOrder: "$priceClassOrder",
//     //         brand: "$brand",
//     //       },
//     //       total: { $sum: "$value" },
//     //     },
//     //   },
//     //   {
//     //     $group: {
//     //       _id: "$_id.priceClassOrder",
//     //       brands: {
//     //         $push: {
//     //           brand: "$_id.brand",
//     //           total: "$total",
//     //         },
//     //       },
//     //     },
//     //   },
//     // ];

//     const samsungPipeline = [
//       { $match: samsungMatchStage },
//       {
//         $project: {
//           brand: "Samsung",
//           priceClassOrder: {
//             $switch: {
//               branches: [
//                 { case: { $lt: [{ $divide: ["$total_amount", "$quantity"] }, 6000] }, then: 0 },
//                 { case: { $lt: [{ $divide: ["$total_amount", "$quantity"] }, 10000] }, then: 1 },
//                 { case: { $lt: [{ $divide: ["$total_amount", "$quantity"] }, 15000] }, then: 2 },
//                 { case: { $lt: [{ $divide: ["$total_amount", "$quantity"] }, 20000] }, then: 3 },
//                 { case: { $lt: [{ $divide: ["$total_amount", "$quantity"] }, 30000] }, then: 4 },
//                 { case: { $lt: [{ $divide: ["$total_amount", "$quantity"] }, 40000] }, then: 5 },
//                 { case: { $lt: [{ $divide: ["$total_amount", "$quantity"] }, 70000] }, then: 6 },
//                 { case: { $lt: [{ $divide: ["$total_amount", "$quantity"] }, 100000] }, then: 7 },
//               ],
//               default: 8,
//             },
//           },
//           value: {
//             $cond: {
//               if: { $eq: [metric, "value"] },
//               then: "$amount",   // ✅ only amount
//               else: "$quantity", // ✅ quantity for volume
//             },
//           },
//         },
//       },
//       {
//         $group: {
//           _id: {
//             priceClassOrder: "$priceClassOrder",
//             brand: "$brand",
//           },
//           total: { $sum: "$value" },
//         },
//       },
//       {
//         $group: {
//           _id: "$_id.priceClassOrder",
//           brands: {
//             $push: {
//               brand: "$_id.brand",
//               total: "$total",
//             },
//           },
//         },
//       },
//     ];

//     const samsungData = await SalesData.aggregate(samsungPipeline);
//     console.log("Samsung data:", JSON.stringify(samsungData, null, 2));

//     // Step 5: Aggregation for other brands from ExtractionRecord
//     const otherBrandsMatchStage = {
//       createdAt: { $gte: start, $lte: end },
//       brand: { $ne: "samsung" },
//     };
//     if (segment) {
//       otherBrandsMatchStage.segment = segment.replace(/[<>\+kK\s]/g, "");
//     }
//     if (brand && brand !== "Samsung") {
//       otherBrandsMatchStage.brand = { $regex: `^${brand}$`, $options: "i" };
//     }
//     if (dealerFilter.length > 0) {
//       otherBrandsMatchStage.dealer = { $in: dealerFilter };
//     }

//     const otherBrandsPipeline = [
//       { $match: otherBrandsMatchStage },
//       {
//         $project: {
//           brand: {
//             $cond: {
//               if: {
//                 $in: [
//                   { $toLower: "$brand" },
//                   brands.map((b) => b.toLowerCase()),
//                 ],
//               },
//               then: {
//                 $arrayElemAt: [
//                   brands,
//                   {
//                     $indexOfArray: [
//                       brands.map((b) => b.toLowerCase()),
//                       { $toLower: "$brand" },
//                     ],
//                   },
//                 ],
//               },
//               else: "Others",
//             },
//           },
//           priceClassOrder: {
//             $switch: {
//               branches: [
//                 { case: { $lt: ["$price", 6000] }, then: 0 },
//                 { case: { $lt: ["$price", 10000] }, then: 1 },
//                 { case: { $lt: ["$price", 15000] }, then: 2 },
//                 { case: { $lt: ["$price", 20000] }, then: 3 },
//                 { case: { $lt: ["$price", 30000] }, then: 4 },
//                 { case: { $lt: ["$price", 40000] }, then: 5 },
//                 { case: { $lt: ["$price", 70000] }, then: 6 },
//                 { case: { $lt: ["$price", 100000] }, then: 7 },
//               ],
//               default: 8,
//             },
//           },
//           value: {
//             $cond: {
//               if: { $eq: [metric, "value"] },
//               then: {
//                 $ifNull: ["$amount", { $multiply: ["$price", "$quantity"] }],
//               },
//               else: "$quantity",
//             },
//           },
//         },
//       },
//       {
//         $group: {
//           _id: {
//             priceClassOrder: "$priceClassOrder",
//             brand: "$brand",
//           },
//           total: { $sum: "$value" },
//         },
//       },
//       {
//         $group: {
//           _id: "$_id.priceClassOrder",
//           brands: {
//             $push: {
//               brand: "$_id.brand",
//               total: "$total",
//             },
//           },
//         },
//       },
//     ];

//     const otherBrandsData = await ExtractionRecord.aggregate(otherBrandsPipeline);

//     // Step 6: Combine and sort data
//     const aggregatedData = [];
//     const priceClasses = Object.keys(priceClassMap).map(Number);

//     // Initialize aggregatedData for all price classes
//     priceClasses.forEach((priceClass) => {
//       aggregatedData.push({
//         _id: priceClass,
//         brands: [],
//       });
//     });

//     // Merge Samsung data
//     samsungData.forEach((entry) => {
//       const index = aggregatedData.findIndex(
//         (item) => item._id === Number(entry._id)
//       );
//       if (index >= 0) {
//         aggregatedData[index].brands = entry.brands;
//       } else {
//         console.log("No matching price class for Samsung data:", entry);
//       }
//     });

//     // Merge other brands data
//     otherBrandsData.forEach((entry) => {
//       const index = aggregatedData.findIndex(
//         (item) => item._id === Number(entry._id)
//       );
//       if (index >= 0) {
//         aggregatedData[index].brands = aggregatedData[index].brands.concat(
//           entry.brands
//         );
//       } else {
//         console.log("No matching price class for other brands data:", entry);
//         aggregatedData.push({ _id: Number(entry._id), brands: entry.brands });
//       }
//     });

//     // Sort by priceClassOrder
//     aggregatedData.sort((a, b) => a._id - b._id);

//     // Step 7: Final response formatting
//     const response = aggregatedData.map((entry) => {
//       const row = {
//         "Price Class": priceClassMap[entry._id],
//         "Rank of Samsung": null,
//       };

//       brands.concat("Others").forEach((b) => {
//         row[b] = 0;
//       });

//       entry.brands.forEach((b) => {
//         if (brands.includes(b.brand) || b.brand === "Others") {
//           row[b.brand] = b.total;
//         } else {
//           console.log("Unexpected brand in response mapping:", b.brand);
//         }
//       });

//       const sortedBrands = Object.entries(row)
//         .filter(([key]) => brands.includes(key) || key === "Others")
//         .sort(([, a], [, b]) => b - a);

//       const samsungIndex = sortedBrands.findIndex(([b]) => b === "Samsung");
//       row["Rank of Samsung"] = samsungIndex >= 0 ? samsungIndex + 1 : null;

//       row["Total"] = sortedBrands.reduce((sum, [, val]) => sum + val, 0);

//       if (view === "share" && row["Total"] > 0) {
//         brands.concat("Others").forEach((b) => {
//           row[b] = ((row[b] / row["Total"]) * 100).toFixed(2) + "%";
//         });
//         row["Total"] = "100.00";
//       }

//       return row;
//     });

//     // Step 8: Add Total Row
//     const totalRow = { "Price Class": "Total", "Rank of Samsung": null };
//     brands.concat("Others").forEach((b) => {
//       totalRow[b] = response.reduce(
//         (sum, row) => sum + (parseFloat(row[b]) || 0),
//         0
//       );
//     });
//     totalRow["Total"] = brands
//       .concat("Others")
//       .reduce((sum, b) => sum + totalRow[b], 0);

//     // Calculate Samsung rank for total row
//     const sortedTotalBrands = Object.entries(totalRow)
//       .filter(([key]) => brands.includes(key) || key === "Others")
//       .sort(([, a], [, b]) => b - a);
//     const samsungTotalIndex = sortedTotalBrands.findIndex(
//       ([b]) => b === "Samsung"
//     );
//     totalRow["Rank of Samsung"] =
//       samsungTotalIndex >= 0 ? samsungTotalIndex + 1 : null;

//     if (view === "share" && totalRow["Total"] > 0) {
//       brands.concat("Others").forEach((b) => {
//         totalRow[b] =
//           ((totalRow[b] / totalRow["Total"]) * 100).toFixed(2) + "%";
//       });
//       totalRow["Total"] = "100.00";
//     }

//     response.push(totalRow);

//     return res.status(200).json({
//       metricUsed: metric,
//       viewUsed: view,
//       data: response,
//       dealerFilter,
//     });
//   } catch (error) {
//     console.error("Error in getExtractionReport:", error);
//     return res.status(500).json({ error: "Internal Server Error" });
//   }
// };

exports.getExtractionReportForAdmin = async (req, res) => {
  try {
    console.log("Extracton fo admin");
    const {
      startDate,
      endDate,
      segment,
      brand,
      metric = "volume",
      view = "default",
    } = req.query;
    console.log("report", req.query);

    // Helper: Parse a date string like "2025-07-01" as IST and return UTC Date
    function parseISTDate(dateStr) {
      const [year, month, day] = dateStr.split("T")[0].split("-").map(Number);
      // Create IST date at midnight
      const istDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
      // Convert IST to UTC by subtracting offset
      return new Date(istDate.getTime() - IST_OFFSET_MS);
    }

    // Parse start and end dates, ignoring time
    let start, end;
    if (startDate) {
      start = parseISTDate(startDate);
    } else {
      const now = new Date();
      const y = now.getUTCFullYear();
      const m = now.getUTCMonth() + 1;
      start = parseISTDate(`${y}-${String(m).padStart(2, "0")}-01`);
    }

    if (endDate) {
      end = parseISTDate(endDate);
      // Set end date to end of day in UTC
      end.setUTCHours(23, 59, 59, 999);
    } else {
      const now = new Date();
      const y = now.getUTCFullYear();
      const m = now.getUTCMonth() + 1;
      const lastDay = new Date(y, m, 0).getDate();
      end = parseISTDate(`${y}-${String(m).padStart(2, "0")}-${lastDay}`);
      end.setUTCHours(23, 59, 59, 999);
    }

    // Step 2: Get all matching dealers from hierarchy and location filters
    const hierarchyFilters = {};
    hierarchyLevels.forEach((level) => {
      if (req.query[level]) {
        // Handle multiple values by splitting on comma
        const values = Array.isArray(req.query[level]) 
          ? req.query[level] 
          : req.query[level].split(',').map(v => v.trim());
        hierarchyFilters[level] = { $in: values };
      }
    });

    const locationFilters = {};
    locationLevels.forEach((level) => {
      if (req.query[level]) {
        // Handle multiple values by splitting on comma
        const values = Array.isArray(req.query[level]) 
          ? req.query[level] 
          : req.query[level].split(',').map(v => v.trim());
        locationFilters[level] = { $in: values };
      }
    });

    // First approach: Get dealers that match BOTH hierarchy AND location filters
    let dealerFilter = [];
    
    if (Object.keys(hierarchyFilters).length > 0 || Object.keys(locationFilters).length > 0) {
      // Get initial set of dealers from hierarchy if filters exist
      let hierarchyDealers = [];
      if (Object.keys(hierarchyFilters).length > 0) {
        const matchingHierarchy = await HierarchyEntries.find({
          hierarchy_name: "default_sales_flow",
          ...hierarchyFilters,
        });
        hierarchyDealers = matchingHierarchy.map(entry => entry.dealer).filter(Boolean);
      }
      
      // Get initial set of dealers from location if filters exist
      let locationDealers = [];
      if (Object.keys(locationFilters).length > 0) {
        const locationQuery = locationFilters;
        const matchingLocations = await User.find(locationQuery);
        locationDealers = matchingLocations.map(location => location.code).filter(Boolean);
      }
      
      // Combine based on which filters were provided
      if (Object.keys(hierarchyFilters).length > 0 && Object.keys(locationFilters).length > 0) {
        // Intersection - dealers must be in BOTH sets
        const hierarchySet = new Set(hierarchyDealers);
        dealerFilter = locationDealers.filter(dealer => hierarchySet.has(dealer));
        
        // If both filters are provided but no dealers match, return empty response
        if (dealerFilter.length === 0) {
          return res.status(200).json({
            metricUsed: metric,
            viewUsed: view,
            data: [],
            dealerFilter: [],
            message: "No dealers found matching both hierarchy and location filters"
          });
        }
      } else if (Object.keys(hierarchyFilters).length > 0) {
        // Only hierarchy filters
        dealerFilter = hierarchyDealers;
        
        // If hierarchy filters are provided but no dealers match, return empty response
        if (dealerFilter.length === 0) {
          return res.status(200).json({
            metricUsed: metric,
            viewUsed: view,
            data: [],
            dealerFilter: [],
            message: "No dealers found matching hierarchy filters"
          });
        }
      } else {
        // Only location filters
        dealerFilter = locationDealers;
        
        // If location filters are provided but no dealers match, return empty response
        if (dealerFilter.length === 0) {
          return res.status(200).json({
            metricUsed: metric,
            viewUsed: view,
            data: [],
            dealerFilter: [],
            message: "No dealers found matching location filters"
          });
        }
      }
    }

    console.log("Dealer filters:", dealerFilter.length);

    // Step 3: Brand List
    const brands = [
      "Samsung",
      "Vivo",
      "Oppo",
      "Xiaomi",
      "Apple",
      "OnePlus",
      "Realme",
      "Motorola",
    ];

    const priceClassMap = {
      0: "<6k",
      1: "6-10k",
      2: "10-15k",
      3: "15-20k",
      4: "20-30k",
      5: "30-40k",
      6: "40-70k",
      7: "70-100k",
      8: "100k+",
    };

    console.log("Samsun dates: ", start, end)

    // Step 4: Aggregation for Samsung from SalesData
    const samsungMatchStage = {
      date: { $gte: start, $lte: end },
      sales_type: "Sell Out",
    };
    if (segment) {
      samsungMatchStage.segment = segment.replace(/[<>\+kK\s]/g, "");
    }
    if (dealerFilter.length > 0) {
      samsungMatchStage.buyer_code = { $in: dealerFilter };
    }

    // const samsungPipeline = [
    //   { $match: samsungMatchStage },
    //   {
    //     $project: {
    //       brand: "Samsung",
    //       priceClassOrder: {
    //         $switch: {
    //           branches: [
    //             {
    //               case: {
    //                 $lt: [{ $divide: ["$total_amount", "$quantity"] }, 6000],
    //               },
    //               then: 0,
    //             },
    //             {
    //               case: {
    //                 $lt: [{ $divide: ["$total_amount", "$quantity"] }, 10000],
    //               },
    //               then: 1,
    //             },
    //             {
    //               case: {
    //                 $lt: [{ $divide: ["$total_amount", "$quantity"] }, 15000],
    //               },
    //               then: 2,
    //             },
    //             {
    //               case: {
    //                 $lt: [{ $divide: ["$total_amount", "$quantity"] }, 20000],
    //               },
    //               then: 3,
    //             },
    //             {
    //               case: {
    //                 $lt: [{ $divide: ["$total_amount", "$quantity"] }, 30000],
    //               },
    //               then: 4,
    //             },
    //             {
    //               case: {
    //                 $lt: [{ $divide: ["$total_amount", "$quantity"] }, 40000],
    //               },
    //               then: 5,
    //             },
    //             {
    //               case: {
    //                 $lt: [{ $divide: ["$total_amount", "$quantity"] }, 70000],
    //               },
    //               then: 6,
    //             },
    //             {
    //               case: {
    //                 $lt: [{ $divide: ["$total_amount", "$quantity"] }, 100000],
    //               },
    //               then: 7,
    //             },
    //           ],
    //           default: 8,
    //         },
    //       },
    //       value: {
    //         $cond: {
    //           if: { $eq: [metric, "value"] },
    //           then: {
    //             $ifNull: [
    //               "$amount",
    //               { $multiply: ["$total_amount", "$quantity"] },
    //             ],
    //           },
    //           else: "$quantity",
    //         },
    //       },
    //     },
    //   },
    //   {
    //     $group: {
    //       _id: {
    //         priceClassOrder: "$priceClassOrder",
    //         brand: "$brand",
    //       },
    //       total: { $sum: "$value" },
    //     },
    //   },
    //   {
    //     $group: {
    //       _id: "$_id.priceClassOrder",
    //       brands: {
    //         $push: {
    //           brand: "$_id.brand",
    //           total: "$total",
    //         },
    //       },
    //     },
    //   },
    // ];

    const samsungPipeline = [
      { $match: samsungMatchStage },
      {
        $project: {
          brand: "Samsung",
          priceClassOrder: {
            $switch: {
              branches: [
                { case: { $lt: [{ $divide: ["$total_amount", "$quantity"] }, 6000] }, then: 0 },
                { case: { $lt: [{ $divide: ["$total_amount", "$quantity"] }, 10000] }, then: 1 },
                { case: { $lt: [{ $divide: ["$total_amount", "$quantity"] }, 15000] }, then: 2 },
                { case: { $lt: [{ $divide: ["$total_amount", "$quantity"] }, 20000] }, then: 3 },
                { case: { $lt: [{ $divide: ["$total_amount", "$quantity"] }, 30000] }, then: 4 },
                { case: { $lt: [{ $divide: ["$total_amount", "$quantity"] }, 40000] }, then: 5 },
                { case: { $lt: [{ $divide: ["$total_amount", "$quantity"] }, 70000] }, then: 6 },
                { case: { $lt: [{ $divide: ["$total_amount", "$quantity"] }, 100000] }, then: 7 },
              ],
              default: 8,
            },
          },
          value: {
            $cond: {
              if: { $eq: [metric, "value"] },
              then: "$total_amount",   // ✅ only amount
              else: "$quantity", // ✅ quantity for volume
            },
          },
        },
      },
      {
        $group: {
          _id: {
            priceClassOrder: "$priceClassOrder",
            brand: "$brand",
          },
          total: { $sum: "$value" },
        },
      },
      {
        $group: {
          _id: "$_id.priceClassOrder",
          brands: {
            $push: {
              brand: "$_id.brand",
              total: "$total",
            },
          },
        },
      },
    ];

    const samsungData = await SalesData.aggregate(samsungPipeline);
    console.log("Samsung data:", JSON.stringify(samsungData, null, 2));

    // Step 5: Aggregation for other brands from ExtractionRecord
    const otherBrandsMatchStage = {
      createdAt: { $gte: start, $lte: end },
      brand: { $ne: "samsung" },
    };
    if (segment) {
      otherBrandsMatchStage.segment = segment.replace(/[<>\+kK\s]/g, "");
    }
    if (brand && brand !== "Samsung") {
      otherBrandsMatchStage.brand = { $regex: `^${brand}$`, $options: "i" };
    }
    if (dealerFilter.length > 0) {
      otherBrandsMatchStage.dealer = { $in: dealerFilter };
    }

    const otherBrandsPipeline = [
      { $match: otherBrandsMatchStage },
      {
        $project: {
          brand: {
            $cond: {
              if: {
                $in: [
                  { $toLower: "$brand" },
                  brands.map((b) => b.toLowerCase()),
                ],
              },
              then: {
                $arrayElemAt: [
                  brands,
                  {
                    $indexOfArray: [
                      brands.map((b) => b.toLowerCase()),
                      { $toLower: "$brand" },
                    ],
                  },
                ],
              },
              else: "Others",
            },
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
                { case: { $lt: ["$price", 100000] }, then: 7 },
              ],
              default: 8,
            },
          },
          value: {
            $cond: {
              if: { $eq: [metric, "value"] },
              then: {
                $ifNull: ["$amount", { $multiply: ["$price", "$quantity"] }],
              },
              else: "$quantity",
            },
          },
        },
      },
      {
        $group: {
          _id: {
            priceClassOrder: "$priceClassOrder",
            brand: "$brand",
          },
          total: { $sum: "$value" },
        },
      },
      {
        $group: {
          _id: "$_id.priceClassOrder",
          brands: {
            $push: {
              brand: "$_id.brand",
              total: "$total",
            },
          },
        },
      },
    ];

    const otherBrandsData = await ExtractionRecord.aggregate(otherBrandsPipeline);

    // Step 6: Combine and sort data
    const aggregatedData = [];
    const priceClasses = Object.keys(priceClassMap).map(Number);

    // Initialize aggregatedData for all price classes
    priceClasses.forEach((priceClass) => {
      aggregatedData.push({
        _id: priceClass,
        brands: [],
      });
    });

    // Merge Samsung data
    samsungData.forEach((entry) => {
      const index = aggregatedData.findIndex(
        (item) => item._id === Number(entry._id)
      );
      if (index >= 0) {
        aggregatedData[index].brands = entry.brands;
      } else {
        console.log("No matching price class for Samsung data:", entry);
      }
    });

    // Merge other brands data
    otherBrandsData.forEach((entry) => {
      const index = aggregatedData.findIndex(
        (item) => item._id === Number(entry._id)
      );
      if (index >= 0) {
        aggregatedData[index].brands = aggregatedData[index].brands.concat(
          entry.brands
        );
      } else {
        console.log("No matching price class for other brands data:", entry);
        aggregatedData.push({ _id: Number(entry._id), brands: entry.brands });
      }
    });

    // Sort by priceClassOrder
    aggregatedData.sort((a, b) => a._id - b._id);

    // Step 7: Final response formatting
    const response = aggregatedData.map((entry) => {
      const row = {
        "Price Class": priceClassMap[entry._id],
        "Rank of Samsung": null,
      };

      brands.concat("Others").forEach((b) => {
        row[b] = 0;
      });

      entry.brands.forEach((b) => {
        if (brands.includes(b.brand) || b.brand === "Others") {
          row[b.brand] = b.total;
        } else {
          console.log("Unexpected brand in response mapping:", b.brand);
        }
      });

      const sortedBrands = Object.entries(row)
        .filter(([key]) => brands.includes(key) || key === "Others")
        .sort(([, a], [, b]) => b - a);

      const samsungIndex = sortedBrands.findIndex(([b]) => b === "Samsung");
      row["Rank of Samsung"] = samsungIndex >= 0 ? samsungIndex + 1 : null;

      row["Total"] = sortedBrands.reduce((sum, [, val]) => sum + val, 0);

      if (view === "share" && row["Total"] > 0) {
        brands.concat("Others").forEach((b) => {
          row[b] = ((row[b] / row["Total"]) * 100).toFixed(2) + "%";
        });
        row["Total"] = "100.00";
      }

      return row;
    });

    // Step 8: Add Total Row
    const totalRow = { "Price Class": "Total", "Rank of Samsung": null };
    brands.concat("Others").forEach((b) => {
      totalRow[b] = response.reduce(
        (sum, row) => sum + (parseFloat(row[b]) || 0),
        0
      );
    });
    totalRow["Total"] = brands
      .concat("Others")
      .reduce((sum, b) => sum + totalRow[b], 0);

    // Calculate Samsung rank for total row
    const sortedTotalBrands = Object.entries(totalRow)
      .filter(([key]) => brands.includes(key) || key === "Others")
      .sort(([, a], [, b]) => b - a);
    const samsungTotalIndex = sortedTotalBrands.findIndex(
      ([b]) => b === "Samsung"
    );
    totalRow["Rank of Samsung"] =
      samsungTotalIndex >= 0 ? samsungTotalIndex + 1 : null;

    if (view === "share" && totalRow["Total"] > 0) {
      brands.concat("Others").forEach((b) => {
        totalRow[b] =
          ((totalRow[b] / totalRow["Total"]) * 100).toFixed(2) + "%";
      });
      totalRow["Total"] = "100.00";
    }

    response.push(totalRow);

    return res.status(200).json({
      metricUsed: metric,
      viewUsed: view,
      data: response,
      dealerFilter,
    });
  } catch (error) {
    console.error("Error in getExtractionReport:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};



exports.getHierarchyFilters = async (req, res) => {
  try {
    const hierarchyName = "default_sales_flow";
    const hierarchyLevels = [
      "smd",
      "asm",
      "mdd",
      "tse",
      "dealer",
      "district",
      "town",
      "zone",
    ];
    const hierarchyEntryLevels = ["smd", "asm", "mdd", "tse", "dealer"]; // Levels used for selectedLevel

    // Step 1: Collect query filters and handle multiple inputs
    const hierarchyFilters = { hierarchy_name: hierarchyName };
    const userFilters = {};
    let selectedLevel = null;
    hierarchyLevels.forEach((level) => {
      if (req.query[level]) {
        const values = req.query[level].split(","); // Handle comma-separated values
        if (["district", "town", "zone"].includes(level)) {
          userFilters[level] = values; // Filters for User model
        } else {
          hierarchyFilters[level] = { $in: values }; // Filters for HierarchyEntries
        }
        // Only update selectedLevel for hierarchyEntryLevels
        if (
          hierarchyEntryLevels.includes(level) &&
          (!selectedLevel ||
            hierarchyLevels.indexOf(level) <
              hierarchyLevels.indexOf(selectedLevel))
        ) {
          selectedLevel = level; // Track the highest selected level from hierarchyEntryLevels
        }
      }
    });

    // Add dealer filter for User model queries if provided
    if (req.query.dealer) {
      userFilters.dealer = req.query.dealer.split(","); // Handle comma-separated dealer codes
    }

    // console.log("hierarchy query:", req.query);
    // console.log("userFilters:", userFilters);
    // console.log("hierarchyFilters:", hierarchyFilters);
    // console.log("selectedLevel:", selectedLevel);

    // Step 2: Initialize grouped response
    const grouped = {};
    hierarchyLevels.forEach((level) => {
      grouped[level] = [];
    });

    // Step 3: Fetch data for smd, asm, mdd, tse, dealer from HierarchyEntries
    // Use unfiltered data for selected level and above, filtered data for below
    const baseHierarchyFilters = { hierarchy_name: hierarchyName }; // No filters for higher levels and selected level
    const hierarchyEntries = await HierarchyEntries.find(hierarchyFilters); // Filtered for levels below selectedLevel
    const allHierarchyEntries = await HierarchyEntries.find(
      baseHierarchyFilters
    ); // Unfiltered for selected level and above

    // console.log("hierarchyEntries count:", hierarchyEntries.length);
    // console.log("allHierarchyEntries count:", allHierarchyEntries.length);

    // Collect codes for all hierarchy levels
    const codeSet = new Set();
    allHierarchyEntries.forEach((entry) => {
      hierarchyEntryLevels.forEach((level) => {
        if (entry[level]) {
          codeSet.add(entry[level]);
        }
      });
    });

    const allCodes = [...codeSet];
    const actorCodes = await ActorCode.find({ code: { $in: allCodes } });
    const codeNameMap = {};
    actorCodes.forEach((actor) => {
      codeNameMap[actor.code] = actor.name;
    });

    // Group hierarchy entries by level
    const uniqueSet = {};
    hierarchyEntryLevels.forEach((level) => {
      uniqueSet[level] = new Set();
    });

    // Process levels at or above selectedLevel using allHierarchyEntries
    allHierarchyEntries.forEach((entry) => {
      hierarchyEntryLevels.forEach((level) => {
        const levelIndex = hierarchyLevels.indexOf(level);
        if (
          entry[level] &&
          !uniqueSet[level].has(entry[level]) &&
          (!selectedLevel ||
            levelIndex <= hierarchyLevels.indexOf(selectedLevel))
        ) {
          uniqueSet[level].add(entry[level]);
          grouped[level].push({
            code: entry[level],
            name: codeNameMap[entry[level]] || null,
          });
        }
      });
    });

    // Process levels below selectedLevel using hierarchyEntries
    if (selectedLevel) {
      const selectedLevelIndex = hierarchyLevels.indexOf(selectedLevel);
      hierarchyEntries.forEach((entry) => {
        hierarchyEntryLevels.forEach((level) => {
          const levelIndex = hierarchyLevels.indexOf(level);
          if (
            entry[level] &&
            !uniqueSet[level].has(entry[level]) &&
            levelIndex > selectedLevelIndex
          ) {
            uniqueSet[level].add(entry[level]);
            grouped[level].push({
              code: entry[level],
              name: codeNameMap[entry[level]] || null,
            });
          }
        });
      });
    }

    // Step 4: Fetch data for district, town, zone from User, filtered by dealer
    // Derive dealer filter from hierarchyEntries for levels below selectedLevel
    let dealerFilter = userFilters.dealer || [];
    if (selectedLevel && hierarchyEntryLevels.includes(selectedLevel)) {
      dealerFilter = [
        ...new Set(
          hierarchyEntries.map((entry) => entry.dealer).filter((code) => code)
        ),
      ];
      if (userFilters.dealer) {
        dealerFilter = dealerFilter.filter((dealer) =>
          userFilters.dealer.includes(dealer)
        );
      }
    }

    // console.log("dealerFilter:", dealerFilter);

    for (const level of ["district", "town", "zone"]) {
      // Build filters for User model, prioritizing dealer filter
      const levelFilters = {};
      if (dealerFilter.length > 0) {
        levelFilters.code = dealerFilter; // Apply dealer filter based on hierarchy
      }
      // Only apply level-specific filter if explicitly provided in query
      // if (userFilters[level]) {
      //   levelFilters[level] = userFilters[level];
      // }

      // console.log(`levelFilters for ${level}:`, levelFilters);

      // Fetch distinct codes for the current level
      const entries = await User.find(levelFilters, { [level]: 1 })
        .distinct(level)
        .lean();

      // console.log(`entries for ${level}:`, entries);

      // Build grouped response for this level (only include code)
      grouped[level] = entries
        .filter((code) => code) // Remove null/undefined codes
        .map((code) => ({
          code,
        }));
    }

    return res.status(200).json(grouped);
  } catch (error) {
    console.error("Error in getHierarchyFilters:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
