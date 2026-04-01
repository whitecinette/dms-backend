const axios = require("axios");
const ExtractionRecord = require("../../model/ExtractionRecord");
const Product = require("../../model/Product"); // Adjust path as needed
const User = require("../../model/User");
const moment = require("moment");
const HierarchyEntries = require("../../model/HierarchyEntries");
const { Parser } = require("json2csv");
const ActorCode = require("../../model/ActorCode");
const SalesData = require("../../model/SalesData");
const ActorTypesHierarchy = require("../../model/ActorTypesHierarchy");

const ActivationData = require("../../model/ActivationData");

const XLSX = require("xlsx");

const ExcelJS = require("exceljs");


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
    console.log("Extrac rec dates: ", startIST, endIST);

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


exports.getExtractionStatusRoleWise = async (req, res) => {
  try {
    let { roles = [], startDate, endDate, topOutlet = false } = req.body;
    console.log("Extraction start last: ", startDate, endDate, "topOutlet:", topOutlet);

    const {
      code: userCode,
      position: rawUserPosition,
      role: rawUserRole,
      name: userName,
    } = req.user || {};

    if (!userCode || !rawUserPosition || !rawUserRole) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    const userPosition = String(rawUserPosition).toLowerCase().trim();
    const userRole = String(rawUserRole).toLowerCase().trim();

    const blockedRoles = ["tse", "so", "dealer"];
    const isRestricted =
      blockedRoles.includes(userRole) || blockedRoles.includes(userPosition);

    const isAdminUser = ["admin", "super_admin"].includes(userRole);

    const start = startDate
      ? new Date(startDate)
      : moment().startOf("month").toDate();

    const end = endDate
      ? new Date(endDate)
      : moment().endOf("month").toDate();

    const shouldFilterTopOutlet =
      String(topOutlet).toLowerCase() === "true" || topOutlet === true;

    // ==========================================
    // ROLE DECISION LOGIC
    // ==========================================
    let finalRoles = [];

    if (!isRestricted) {
      if (isAdminUser) {
        // admin/super_admin can manually send roles
        if (!Array.isArray(roles) || roles.length === 0) {
          finalRoles = ["asm"];
        } else {
          finalRoles = roles.map((r) => String(r).toLowerCase().trim());
        }
      } else {
        // employee roles are auto-derived from hierarchy
        const hierarchyDoc = await ActorTypesHierarchy.findOne({
          name: "default_sales_flow",
        }).lean();

        if (
          !hierarchyDoc ||
          !Array.isArray(hierarchyDoc.hierarchy) ||
          hierarchyDoc.hierarchy.length === 0
        ) {
          return res.status(400).json({
            success: false,
            message: "Hierarchy definition not found for default_sales_flow",
          });
        }

        const hierarchyOrder = hierarchyDoc.hierarchy.map((item) =>
          String(item).toLowerCase().trim()
        );

        const selfIndex = hierarchyOrder.indexOf(userPosition);

        if (selfIndex === -1) {
          return res.status(400).json({
            success: false,
            message: `User position '${userPosition}' not found in hierarchy`,
          });
        }

        finalRoles = hierarchyOrder
          .slice(selfIndex + 1)
          .filter((role) => role !== "dealer");
      }
    }

    const results = [];

    // ==========================================
    // SUBORDINATE ROLE DATA
    // ==========================================
    if (!isRestricted && finalRoles.length > 0) {
      for (let role of finalRoles) {
        const users = await User.find(
          { position: role },
          { name: 1, code: 1, position: 1 }
        ).lean();

        for (let user of users) {
          const actorCode = user.code;

          const hierarchyFilter = {
            hierarchy_name: "default_sales_flow",
            [role]: actorCode,
          };

          // employees should only see users below themselves
          if (!isAdminUser) {
            hierarchyFilter[userPosition] = userCode;
          }

          const hierarchyEntries = await HierarchyEntries.find(hierarchyFilter).lean();

          const dealerSet = new Set();
          for (let entry of hierarchyEntries) {
            if (entry.dealer) dealerSet.add(String(entry.dealer).trim());
          }

          let dealers = Array.from(dealerSet);

          if (shouldFilterTopOutlet && dealers.length > 0) {
            const topOutletDealers = await User.find(
              {
                code: { $in: dealers },
                top_outlet: true,
              },
              { code: 1 }
            ).lean();

            const topOutletDealerSet = new Set(
              topOutletDealers.map((d) => String(d.code).trim())
            );

            dealers = dealers.filter((dealerCode) =>
              topOutletDealerSet.has(String(dealerCode).trim())
            );
          }

          if (dealers.length === 0) continue;

          const doneDealersFromRecord = await ExtractionRecord.distinct("dealer", {
            dealer: { $in: dealers },
            createdAt: { $gte: start, $lte: end },
          });

          const autoDoneDealers = await User.find(
            {
              code: { $in: dealers },
              extraction_active: false,
            },
            { code: 1 }
          ).lean();

          const doneDealerSet = new Set([
            ...doneDealersFromRecord.map((d) => String(d).trim()),
            ...autoDoneDealers.map((d) => String(d.code).trim()),
          ]);

          const totalCount = dealers.length;
          const doneCount = doneDealerSet.size;
          const pendingCount = totalCount - doneCount;
          const donePercent =
            totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
          const pendingPercent = 100 - donePercent;

          results.push({
            name: user.name || "N/A",
            code: actorCode,
            position: role.toUpperCase(),
            total: totalCount,
            done: doneCount,
            "Done Percent": `${donePercent}%`,
            pending: pendingCount,
            "Pending Percent": `${pendingPercent}%`,
          });
        }
      }
    }

    // ==========================================
    // SELF DATA
    // ==========================================
    let selfData = null;

    const selfFilter = {
      hierarchy_name: "default_sales_flow",
      [userPosition]: userCode,
    };

    const selfEntries = await HierarchyEntries.find(selfFilter).lean();
    const selfDealers = new Set();

    for (let entry of selfEntries) {
      if (entry.dealer) selfDealers.add(String(entry.dealer).trim());
    }

    let selfDealerList = Array.from(selfDealers);

    if (shouldFilterTopOutlet && selfDealerList.length > 0) {
      const selfTopOutletDealers = await User.find(
        {
          code: { $in: selfDealerList },
          top_outlet: true,
        },
        { code: 1 }
      ).lean();

      const selfTopOutletDealerSet = new Set(
        selfTopOutletDealers.map((d) => String(d.code).trim())
      );

      selfDealerList = selfDealerList.filter((dealerCode) =>
        selfTopOutletDealerSet.has(String(dealerCode).trim())
      );
    }

    if (selfDealerList.length > 0) {
      const selfDoneDealersFromRecord = await ExtractionRecord.distinct("dealer", {
        dealer: { $in: selfDealerList },
        createdAt: { $gte: start, $lte: end },
      });

      const selfAutoDoneDealers = await User.find(
        {
          code: { $in: selfDealerList },
          extraction_active: false,
        },
        { code: 1 }
      ).lean();

      const selfDoneDealerSet = new Set([
        ...selfDoneDealersFromRecord.map((d) => String(d).trim()),
        ...selfAutoDoneDealers.map((d) => String(d.code).trim()),
      ]);

      const total = selfDealerList.length;
      const done = selfDoneDealerSet.size;
      const pending = total - done;
      const donePct = total > 0 ? Math.round((done / total) * 100) : 0;
      const pendingPct = 100 - donePct;

      selfData = {
        name: userName || "You",
        code: userCode,
        position: userPosition.toUpperCase(),
        total: total,
        done: done,
        "Done Percent": `${donePct}%`,
        pending: pending,
        "Pending Percent": `${pendingPct}%`,
      };
    } else {
      selfData = {
        name: userName || "You",
        code: userCode,
        position: userPosition.toUpperCase(),
        total: 0,
        done: 0,
        "Done Percent": "0%",
        pending: 0,
        "Pending Percent": "0%",
      };
    }

    return res.status(200).json({
      success: true,
      data: results,
      selfData,
      rolesUsed: finalRoles,
    });
  } catch (error) {
    console.error("Error in getExtractionStatusRoleWise:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};



exports.updateExtractionCreatedAtMonthByDateRange = async (req, res) => {
  try {
    const { startDate, endDate, newMonth } = req.body;

    if (!startDate || !endDate || !newMonth) {
      return res.status(400).json({
        success: false,
        message: "startDate, endDate and newMonth are required",
      });
    }

    const monthNum = Number(newMonth);

    if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({
        success: false,
        message: "newMonth must be between 1 and 12",
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    const filter = {
      createdAt: { $gte: start, $lte: end },
      $or: [{ external: { $exists: false } }, { external: false }],
    };

    const records = await ExtractionRecord.find(filter).lean();

    if (!records.length) {
      return res.status(200).json({
        success: true,
        matchedCount: 0,
        modifiedCount: 0,
        message: "No matching records found",
      });
    }

    const bulkOps = records.map((record) => {
      const oldDate = new Date(record.createdAt);
      const newDate = new Date(oldDate);
      newDate.setUTCMonth(monthNum - 1);

      return {
        updateOne: {
          filter: { _id: record._id },
          update: {
            $set: {
              createdAt: newDate,
            },
          },
        },
      };
    });

    const result = await ExtractionRecord.collection.bulkWrite(bulkOps);

    return res.status(200).json({
      success: true,
      matchedCount: records.length,
      modifiedCount: result.modifiedCount || 0,
      message: "createdAt month updated successfully",
    });
  } catch (error) {
    console.error("Error in updateExtractionCreatedAtMonthByDateRange:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};


exports.getDealersWithStatusForExtraction = async (req, res) => {
  try {
    console.log("Here!<3")
    const { startDate, endDate, topOutlet = false } = req.query;
    const start = startDate ? new Date(startDate) : moment().startOf("month").toDate();
    const end = endDate ? new Date(endDate) : moment().endOf("month").toDate();

    const shouldFilterTopOutlet =
      String(topOutlet).toLowerCase() === "true" || topOutlet === true;

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

    let dealerCodes = Array.from(dealerSet);

    // ✅ apply top_outlet filter only when toggle is true
    if (shouldFilterTopOutlet && dealerCodes.length > 0) {
      const topOutletDealers = await User.find(
        {
          code: { $in: dealerCodes },
          top_outlet: true,
          role: "dealer",
        },
        { code: 1 }
      ).lean();

      const topOutletDealerSet = new Set(
        topOutletDealers.map((d) => String(d.code).trim())
      );

      dealerCodes = dealerCodes.filter((dealerCode) =>
        topOutletDealerSet.has(String(dealerCode).trim())
      );
    }

    if (dealerCodes.length === 0) {
      return res.status(200).json({ success: true, dealers: [] });
    }

    // 🔍 Fetch extraction done dealers
    const doneDealers = await ExtractionRecord.distinct("dealer", {
      dealer: { $in: dealerCodes },
      createdAt: { $gte: start, $lte: end },
    });

    // 🔍 Fetch auto-done dealers (inactive for extraction)
    const inactiveDealers = await User.distinct("code", {
      code: { $in: dealerCodes },
      extraction_active: false,
      role: "dealer",
    });

    const doneSet = new Set([
      ...doneDealers.map((d) => String(d).trim()),
      ...inactiveDealers.map((d) => String(d).trim()),
    ]);

    // 🧾 Get full dealer info
    const allDealers = await User.find({ code: { $in: dealerCodes }, role: "dealer" });

    const dealersWithStatus = allDealers.map(dealer => ({
      ...dealer.toObject(),
      status: doneSet.has(String(dealer.code).trim()) ? "done" : "pending"
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

const hierarchyLevels = ["smd", "asm", "mdd", "tse", "dealer"];
const locationLevels = ["zone", "district", "town"];



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


//////////////////////////////////////////////////
// ADMIN ACTIVATION EXTRACTION REPORT NEW 
/////////////////////////////////////////////////


exports.getExtractionReportForAdminFromActivation = async (req, res) => {
  try {
    console.log("Extraction for admin");

    const {
      startDate,
      endDate,
      segment,
      brand,
      metric = "volume",
      view = "default",
    } = req.query;

    console.log("report", req.query);

    // -----------------------------
    // Helpers
    // -----------------------------
    function parseISTDate(dateStr) {
      const [year, month, day] = dateStr.split("T")[0].split("-").map(Number);
      const istDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
      return new Date(istDate.getTime() - IST_OFFSET_MS);
    }

    function parseActivationRawDate(raw) {
      // expected format: M/D/YY or MM/DD/YY
      if (!raw || typeof raw !== "string") return null;

      const parts = raw.split("/");
      if (parts.length !== 3) return null;

      let [month, day, year] = parts.map((x) => parseInt(x, 10));
      if (!month || !day || year === undefined || Number.isNaN(year)) return null;

      // convert 2-digit year => 20xx
      if (year < 100) year += 2000;

      // make IST midnight and convert to UTC date object
      const istDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
      return new Date(istDate.getTime() - IST_OFFSET_MS);
    }

    function getYearMonthRange(start, end) {
      const months = [];
      const current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
      const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));

      while (current <= last) {
        const y = current.getUTCFullYear();
        const m = String(current.getUTCMonth() + 1).padStart(2, "0");
        months.push(`${y}-${m}`);
        current.setUTCMonth(current.getUTCMonth() + 1);
      }

      return months;
    }

    function bucketFromPrice(price) {
      if (!price || price <= 0) return "";

      if (price <= 6000) return "0-6";
      if (price <= 10000) return "6-10";
      if (price <= 20000) return "10-20";
      if (price <= 30000) return "20-30";
      if (price <= 40000) return "30-40";
      if (price <= 70000) return "40-70";
      if (price <= 100000) return "70-100";
      if (price <= 120000) return "100-120";
      return "120";
    }

    function normalizeSegment(seg) {
      if (!seg) return "";
      return String(seg).trim().replace(/\s+/g, "");
    }

    const segmentOrderMap = {
      "0-6": 0,
      "6-10": 1,
      "10-20": 2,
      "20-30": 3,
      "30-40": 4,
      "40-70": 5,
      "70-100": 6,
      "100-120": 7,
      "120": 8,
    };

    const priceClassMap = {
      0: "0-6",
      1: "6-10",
      2: "10-20",
      3: "20-30",
      4: "30-40",
      5: "40-70",
      6: "70-100",
      7: "100-120",
      8: "120",
    };

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

    // -----------------------------
    // Parse start/end dates
    // -----------------------------
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
      end.setUTCHours(23, 59, 59, 999);
    } else {
      const now = new Date();
      const y = now.getUTCFullYear();
      const m = now.getUTCMonth() + 1;
      const lastDay = new Date(y, m, 0).getDate();
      end = parseISTDate(`${y}-${String(m).padStart(2, "0")}-${lastDay}`);
      end.setUTCHours(23, 59, 59, 999);
    }

    // -----------------------------
    // Dealer filter from hierarchy + location
    // -----------------------------
    const hierarchyFilters = {};
    hierarchyLevels.forEach((level) => {
      if (req.query[level]) {
        const values = Array.isArray(req.query[level])
          ? req.query[level]
          : req.query[level].split(",").map((v) => v.trim());
        hierarchyFilters[level] = { $in: values };
      }
    });

    const locationFilters = {};
    locationLevels.forEach((level) => {
      if (req.query[level]) {
        const values = Array.isArray(req.query[level])
          ? req.query[level]
          : req.query[level].split(",").map((v) => v.trim());
        locationFilters[level] = { $in: values };
      }
    });

    let dealerFilter = [];

    if (
      Object.keys(hierarchyFilters).length > 0 ||
      Object.keys(locationFilters).length > 0
    ) {
      let hierarchyDealers = [];
      if (Object.keys(hierarchyFilters).length > 0) {
        const matchingHierarchy = await HierarchyEntries.find({
          hierarchy_name: "default_sales_flow",
          ...hierarchyFilters,
        }).lean();

        hierarchyDealers = matchingHierarchy
          .map((entry) => entry.dealer)
          .filter(Boolean);
      }

      let locationDealers = [];
      if (Object.keys(locationFilters).length > 0) {
        const matchingLocations = await User.find(locationFilters).lean();
        locationDealers = matchingLocations
          .map((location) => location.code)
          .filter(Boolean);
      }

      if (
        Object.keys(hierarchyFilters).length > 0 &&
        Object.keys(locationFilters).length > 0
      ) {
        const hierarchySet = new Set(hierarchyDealers);
        dealerFilter = locationDealers.filter((dealer) => hierarchySet.has(dealer));

        if (dealerFilter.length === 0) {
          return res.status(200).json({
            metricUsed: metric,
            viewUsed: view,
            data: [],
            dealerFilter: [],
            message: "No dealers found matching both hierarchy and location filters",
          });
        }
      } else if (Object.keys(hierarchyFilters).length > 0) {
        dealerFilter = hierarchyDealers;

        if (dealerFilter.length === 0) {
          return res.status(200).json({
            metricUsed: metric,
            viewUsed: view,
            data: [],
            dealerFilter: [],
            message: "No dealers found matching hierarchy filters",
          });
        }
      } else {
        dealerFilter = locationDealers;

        if (dealerFilter.length === 0) {
          return res.status(200).json({
            metricUsed: metric,
            viewUsed: view,
            data: [],
            dealerFilter: [],
            message: "No dealers found matching location filters",
          });
        }
      }
    }

    console.log("Dealer filters:", dealerFilter.length);

    // ============================================================
    // STEP A: Samsung from ActivationData
    // ============================================================
    const yearMonths = getYearMonthRange(start, end);

    const samsungActivationMatch = {
      year_month: { $in: yearMonths }, 
    };

    if (dealerFilter.length > 0) {
      samsungActivationMatch.tertiary_buyer_code = { $in: dealerFilter };
    }

    // optional brand filter:
    // if brand is selected and it's not Samsung, then Samsung side should be empty
    let samsungRows = [];
    if (!brand || String(brand).toLowerCase() === "samsung") {
      samsungRows = await ActivationData.find(samsungActivationMatch).lean();
    }

    // exact date filter using activation_date_raw
    samsungRows = samsungRows.filter((row) => {
      const parsedDate = parseActivationRawDate(row.activation_date_raw);
      if (!parsedDate) return false;
      return parsedDate >= start && parsedDate <= end;
    });

    // product lookup for Samsung only
    const samsungProductCodes = [
      ...new Set(samsungRows.map((r) => r.product_code).filter(Boolean)),
    ];
    const samsungModelCodes = [
      ...new Set(samsungRows.map((r) => r.model_no).filter(Boolean)),
    ];

    const samsungProducts = await Product.find({
      brand: { $regex: /^samsung$/i },
      $or: [
        { product_code: { $in: samsungProductCodes } },
        { model_code: { $in: samsungModelCodes } },
      ],
    }).lean();

    const productByCode = new Map();
    const productByModel = new Map();

    samsungProducts.forEach((p) => {
      if (p.product_code) productByCode.set(String(p.product_code).trim(), p);
      if (p.model_code) productByModel.set(String(p.model_code).trim(), p);
    });

    const requestedSegment = normalizeSegment(segment);

    const samsungGroupedMap = new Map();

    for (const row of samsungRows) {
      const qty = Number(row.qty) || 0;
      const val = Number(row.val) || 0;

      if (qty <= 0 && metric === "volume") continue;

      const matchedProduct =
        productByCode.get(String(row.product_code || "").trim()) ||
        productByModel.get(String(row.model_no || "").trim());

      let resolvedSegment = "";

      if (matchedProduct && matchedProduct.segment) {
        resolvedSegment = normalizeSegment(matchedProduct.segment);
      }

      if (!resolvedSegment) {
        const derivedPrice = qty > 0 ? val / qty : 0;
        resolvedSegment = bucketFromPrice(derivedPrice);
      }

      if (!resolvedSegment || segmentOrderMap[resolvedSegment] === undefined) {
        continue;
      }

      if (requestedSegment && requestedSegment !== resolvedSegment) {
        continue;
      }

      const priceClassOrder = segmentOrderMap[resolvedSegment];
      const groupKey = `${priceClassOrder}__Samsung`;

      const rowValue = metric === "value" ? val : qty;

      samsungGroupedMap.set(groupKey, (samsungGroupedMap.get(groupKey) || 0) + rowValue);
    }

    const samsungData = [];
    const samsungPriceClassMap = new Map();

    for (const [key, total] of samsungGroupedMap.entries()) {
      const [priceClassOrderStr] = key.split("__");
      const priceClassOrder = Number(priceClassOrderStr);

      if (!samsungPriceClassMap.has(priceClassOrder)) {
        samsungPriceClassMap.set(priceClassOrder, {
          _id: priceClassOrder,
          brands: [],
        });
      }

      samsungPriceClassMap.get(priceClassOrder).brands.push({
        brand: "Samsung",
        total,
      });
    }

    samsungPriceClassMap.forEach((value) => samsungData.push(value));

    console.log("Samsung data prepared:", samsungData.length);

    // ============================================================
    // STEP B: Other brands from ExtractionRecord
    // ============================================================
    const otherBrandsMatchStage = {
      createdAt: { $gte: start, $lte: end },
      brand: { $ne: "samsung" },
    };

    if (segment) {
      otherBrandsMatchStage.segment = normalizeSegment(segment);
    }

    if (brand && String(brand).toLowerCase() !== "samsung") {
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
                { case: { $eq: [{ $trim: { input: "$segment" } }, "0-6"] }, then: 0 },
                { case: { $eq: [{ $trim: { input: "$segment" } }, "6-10"] }, then: 1 },
                { case: { $eq: [{ $trim: { input: "$segment" } }, "10-20"] }, then: 2 },
                { case: { $eq: [{ $trim: { input: "$segment" } }, "20-30"] }, then: 3 },
                { case: { $eq: [{ $trim: { input: "$segment" } }, "30-40"] }, then: 4 },
                { case: { $eq: [{ $trim: { input: "$segment" } }, "40-70"] }, then: 5 },
                { case: { $eq: [{ $trim: { input: "$segment" } }, "70-100"] }, then: 6 },
                { case: { $eq: [{ $trim: { input: "$segment" } }, "100-120"] }, then: 7 },
                { case: { $eq: [{ $trim: { input: "$segment" } }, "120"] }, then: 8 },
              ],
              default: null,
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
        $match: {
          priceClassOrder: { $ne: null },
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

    // ============================================================
    // STEP C: Combine and sort data
    // ============================================================
    const aggregatedData = [];
    const priceClasses = Object.keys(priceClassMap).map(Number);

    priceClasses.forEach((priceClass) => {
      aggregatedData.push({
        _id: priceClass,
        brands: [],
      });
    });

    samsungData.forEach((entry) => {
      const index = aggregatedData.findIndex(
        (item) => item._id === Number(entry._id)
      );
      if (index >= 0) {
        aggregatedData[index].brands = entry.brands;
      }
    });

    otherBrandsData.forEach((entry) => {
      const index = aggregatedData.findIndex(
        (item) => item._id === Number(entry._id)
      );
      if (index >= 0) {
        aggregatedData[index].brands = aggregatedData[index].brands.concat(
          entry.brands
        );
      } else {
        aggregatedData.push({ _id: Number(entry._id), brands: entry.brands });
      }
    });

    aggregatedData.sort((a, b) => a._id - b._id);

    // ============================================================
    // STEP D: Final response formatting
    // ============================================================
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

    // ============================================================
    // STEP E: Total row
    // ============================================================
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
    console.error("Error in getExtractionReportForAdmin:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

//////////////////////////////////////////////////
// ADMIN ACTIVATION EXTRACTION REPORT NEW 
/////////////////////////////////////////////////




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




const normalizeCode = (value) => String(value || "").trim();

const normalizeBool = (value) =>
  value === true || String(value).toLowerCase() === "true";

const formatExcelDate = (value) => {
  if (!value) return "";
  return moment(value).format("DD-MM-YYYY HH:mm");
};

const pct = (num, total) => {
  if (!total) return "0%";
  return `${Math.round((Number(num || 0) / Number(total || 0)) * 100)}%`;
};

/* ---------------------------------- */
/* COMBINED SHEET (dealer wise)       */
/* ---------------------------------- */

const COMBINED_COLUMNS = [
  { header: "Dealer Code", key: "dealer_code", width: 18 },
  { header: "Dealer Name", key: "dealer_name", width: 28 },
  { header: "Town", key: "town", width: 18 },
  { header: "Top Outlet", key: "top_outlet", width: 14 },

  { header: "SMD Code", key: "smd_code", width: 18 },
  { header: "SMD Name", key: "smd_name", width: 24 },

  { header: "ZSM Code", key: "zsm_code", width: 18 },
  { header: "ZSM Name", key: "zsm_name", width: 24 },

  { header: "ASM Code", key: "asm_code", width: 18 },
  { header: "ASM Name", key: "asm_name", width: 24 },

  { header: "MDD Code", key: "mdd_code", width: 18 },
  { header: "MDD Name", key: "mdd_name", width: 24 },

  { header: "TSE Code", key: "tse_code", width: 18 },
  { header: "TSE Name", key: "tse_name", width: 24 },

  { header: "Status", key: "status", width: 14 },
  { header: "Done Date", key: "done_date", width: 22 },
];

const addCombinedWorksheet = (workbook, sheetName, rows = []) => {
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = COMBINED_COLUMNS;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "P1" };

  const headerRow = sheet.getRow(1);
  headerRow.height = 22;
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F4E78" },
  };

  rows.forEach((row) => {
    const excelRow = sheet.addRow({
      dealer_code: row.dealer_code || "",
      dealer_name: row.dealer_name || "",
      town: row.town || "",
      top_outlet: row.top_outlet || "No",

      smd_code: row.smd_code || "",
      smd_name: row.smd_name || "",

      zsm_code: row.zsm_code || "",
      zsm_name: row.zsm_name || "",

      asm_code: row.asm_code || "",
      asm_name: row.asm_name || "",

      mdd_code: row.mdd_code || "",
      mdd_name: row.mdd_name || "",

      tse_code: row.tse_code || "",
      tse_name: row.tse_name || "",

      status: row.status || "PENDING",
      done_date: row.done_date || "",
    });

    excelRow.alignment = { vertical: "middle", horizontal: "center" };

    const statusCell = excelRow.getCell("O");
    if (String(row.status).toUpperCase() === "DONE") {
      statusCell.font = { bold: true, color: { argb: "FF0A6E31" } };
      statusCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD9F2D9" },
      };
    } else {
      statusCell.font = { bold: true, color: { argb: "FF9C0006" } };
      statusCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFE0E0" },
      };
    }
  });

  return sheet;
};

/* ---------------------------------- */
/* ROLE SUMMARY SHEETS                */
/* ---------------------------------- */

const ROLE_SUMMARY_COLUMNS = [
  { header: "Name", key: "name", width: 26 },
  { header: "Code", key: "code", width: 18 },
  { header: "Position", key: "position", width: 14 },
  { header: "Total", key: "total", width: 12 },
  { header: "Done", key: "done", width: 12 },
  { header: "Done Percentage", key: "done_percentage", width: 18 },
  { header: "Pending", key: "pending", width: 12 },
  { header: "Pending Percentage", key: "pending_percentage", width: 18 },
  { header: "Total Top Outlets (Under)", key: "total_top_outlets", width: 24 },
  { header: "Done Top Outlet", key: "done_top_outlet", width: 18 },
  { header: "Done Top Outlet %", key: "done_top_outlet_percentage", width: 20 },
  { header: "Pending Top Outlet", key: "pending_top_outlet", width: 20 },
  { header: "Pending Top Outlet %", key: "pending_top_outlet_percentage", width: 22 },
];

const addRoleSummaryWorksheet = (workbook, sheetName, rows = []) => {
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = ROLE_SUMMARY_COLUMNS;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "M1" };

  const headerRow = sheet.getRow(1);
  headerRow.height = 22;
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF7A3E00" },
  };

  rows.forEach((row) => {
    const excelRow = sheet.addRow({
      name: row.name || "",
      code: row.code || "",
      position: row.position || "",
      total: row.total || 0,
      done: row.done || 0,
      done_percentage: row.done_percentage || "0%",
      pending: row.pending || 0,
      pending_percentage: row.pending_percentage || "0%",
      total_top_outlets: row.total_top_outlets || 0,
      done_top_outlet: row.done_top_outlet || 0,
      done_top_outlet_percentage: row.done_top_outlet_percentage || "0%",
      pending_top_outlet: row.pending_top_outlet || 0,
      pending_top_outlet_percentage: row.pending_top_outlet_percentage || "0%",
    });

    excelRow.alignment = { vertical: "middle", horizontal: "center" };
  });

  return sheet;
};

/* ---------------------------------- */
/* BUILD DEALER ROWS                  */
/* ---------------------------------- */

const buildDealerWiseRows = async ({
  startDate,
  endDate,
  topOutlet,
  userCode,
  userPosition,
  userRole,
}) => {
  const start = startDate
    ? moment(startDate).startOf("day").toDate()
    : moment().startOf("month").toDate();

  const end = endDate
    ? moment(endDate).endOf("day").toDate()
    : moment().endOf("month").toDate();

  const shouldFilterTopOutlet = normalizeBool(topOutlet);

  const hierarchyFilter = {
    hierarchy_name: "default_sales_flow",
  };

  if (String(userRole).toLowerCase() !== "admin") {
    hierarchyFilter[userPosition] = userCode;
  }

  const hierarchyEntries = await HierarchyEntries.find(hierarchyFilter).lean();

  if (!hierarchyEntries.length) {
    return {
      rows: [],
      hierarchyEntries: [],
      start,
      end,
    };
  }

  const dealerCodes = [
    ...new Set(
      hierarchyEntries.map((item) => normalizeCode(item.dealer)).filter(Boolean)
    ),
  ];

  const actorCodes = [
    ...new Set(
      hierarchyEntries
        .flatMap((item) => [
          normalizeCode(item.smd),
          normalizeCode(item.zsm),
          normalizeCode(item.asm),
          normalizeCode(item.mdd),
          normalizeCode(item.tse),
        ])
        .filter(Boolean)
        .filter((code) => code.toUpperCase() !== "VACANT")
    ),
  ];

  const [dealerUsers, actorUsers] = await Promise.all([
    User.find(
      { code: { $in: dealerCodes } },
      { code: 1, name: 1, town: 1, top_outlet: 1, extraction_active: 1 }
    ).lean(),
    User.find(
      { code: { $in: actorCodes } },
      { code: 1, name: 1, position: 1 }
    ).lean(),
  ]);

  const dealerMap = new Map();
  for (const dealer of dealerUsers) {
    dealerMap.set(normalizeCode(dealer.code), dealer);
  }

  const actorMap = new Map();
  for (const actor of actorUsers) {
    actorMap.set(normalizeCode(actor.code), actor);
  }

  let filteredEntries = hierarchyEntries;

  if (shouldFilterTopOutlet) {
    filteredEntries = hierarchyEntries.filter((entry) => {
      const dealer = dealerMap.get(normalizeCode(entry.dealer));
      return dealer?.top_outlet === true;
    });
  }

  const filteredDealerCodes = [
    ...new Set(
      filteredEntries.map((item) => normalizeCode(item.dealer)).filter(Boolean)
    ),
  ];

  if (!filteredDealerCodes.length) {
    return {
      rows: [],
      hierarchyEntries: filteredEntries,
      start,
      end,
    };
  }

  const extractionRecords = await ExtractionRecord.find(
    {
      dealer: { $in: filteredDealerCodes },
      createdAt: { $gte: start, $lte: end },
    },
    { dealer: 1, createdAt: 1 }
  )
    .sort({ createdAt: -1 })
    .lean();

const doneDealerMap = new Map();
for (const record of extractionRecords) {
  const dealerCode = normalizeCode(record.dealer);
  if (!doneDealerMap.has(dealerCode)) {
    doneDealerMap.set(dealerCode, record.createdAt);
  }
}

// ✅ mark extraction_active:false dealers as done too
for (const dealerCode of filteredDealerCodes) {
  const dealer = dealerMap.get(dealerCode);
  if (dealer?.extraction_active === false && !doneDealerMap.has(dealerCode)) {
    doneDealerMap.set(dealerCode, null);
  }
}

  const rows = filteredEntries.map((entry) => {
    const dealerCode = normalizeCode(entry.dealer);
    const dealer = dealerMap.get(dealerCode);
    const doneDate = doneDealerMap.get(dealerCode);

    const smdCode = normalizeCode(entry.smd);
    const zsmCode = normalizeCode(entry.zsm);
    const asmCode = normalizeCode(entry.asm);
    const mddCode = normalizeCode(entry.mdd);
    const tseCode = normalizeCode(entry.tse);

    return {
      dealer_code: dealerCode,
      dealer_name: dealer?.name || "",
      town: dealer?.town || "",
      top_outlet: dealer?.top_outlet ? "Yes" : "No",

      smd_code: smdCode,
      smd_name: actorMap.get(smdCode)?.name || "",

      zsm_code: zsmCode,
      zsm_name: actorMap.get(zsmCode)?.name || "",

      asm_code: asmCode,
      asm_name: actorMap.get(asmCode)?.name || "",

      mdd_code: mddCode,
      mdd_name: actorMap.get(mddCode)?.name || "",

      tse_code: tseCode,
      tse_name: tseCode.toUpperCase() === "VACANT" ? "VACANT" : actorMap.get(tseCode)?.name || "",

      status: doneDealerMap.has(dealerCode) ? "DONE" : "PENDING",
      done_date: doneDate ? formatExcelDate(doneDate) : "",
    };
  });

  rows.sort((a, b) => {
    const aStatus = a.status === "PENDING" ? 0 : 1;
    const bStatus = b.status === "PENDING" ? 0 : 1;
    if (aStatus !== bStatus) return aStatus - bStatus;

    return String(a.dealer_name || a.dealer_code).localeCompare(
      String(b.dealer_name || b.dealer_code)
    );
  });

  return {
    rows,
    hierarchyEntries: filteredEntries,
    start,
    end,
  };
};

/* ---------------------------------- */
/* BUILD ROLE SUMMARY ROWS            */
/* ---------------------------------- */

const buildRoleSummaryRows = async ({ hierarchyEntries, start, end, role }) => {
  const cleanRole = String(role || "").toLowerCase();

  const actorCodes = [
    ...new Set(
      hierarchyEntries
        .map((entry) => normalizeCode(entry[cleanRole]))
        .filter((code) => code && code.toUpperCase() !== "VACANT")
    ),
  ];

  if (!actorCodes.length) return [];

  const actorUsers = await User.find(
    { code: { $in: actorCodes } },
    { code: 1, name: 1, position: 1 }
  ).lean();

  const actorMap = new Map();
  actorUsers.forEach((user) => {
    actorMap.set(normalizeCode(user.code), user);
  });

  const dealerCodes = [
    ...new Set(
      hierarchyEntries.map((entry) => normalizeCode(entry.dealer)).filter(Boolean)
    ),
  ];

  const dealerUsers = await User.find(
    { code: { $in: dealerCodes } },
    { code: 1, top_outlet: 1, extraction_active: 1 }
  ).lean();

  const dealerTopOutletMap = new Map();
  dealerUsers.forEach((dealer) => {
    dealerTopOutletMap.set(normalizeCode(dealer.code), dealer?.top_outlet === true);
  });

  const extractionRecords = await ExtractionRecord.find(
    {
      dealer: { $in: dealerCodes },
      createdAt: { $gte: start, $lte: end },
    },
    { dealer: 1 }
  ).lean();

  const doneDealerSet = new Set(
    extractionRecords.map((item) => normalizeCode(item.dealer)).filter(Boolean)
  );

  // ✅ add extraction_active:false dealers also as done
  dealerUsers.forEach((dealer) => {
    const dealerCode = normalizeCode(dealer.code);
    if (dealer?.extraction_active === false) {
      doneDealerSet.add(dealerCode);
    }
  });

  const summaryMap = new Map();

  for (const entry of hierarchyEntries) {
    const actorCode = normalizeCode(entry[cleanRole]);
    const dealerCode = normalizeCode(entry.dealer);

    if (!actorCode || actorCode.toUpperCase() === "VACANT" || !dealerCode) continue;

    if (!summaryMap.has(actorCode)) {
      const actorUser = actorMap.get(actorCode);

      summaryMap.set(actorCode, {
        name: actorUser?.name || "N/A",
        code: actorCode,
        position: String(cleanRole).toUpperCase(),
        total: 0,
        done: 0,
        pending: 0,
        total_top_outlets: 0,
        done_top_outlet: 0,
        pending_top_outlet: 0,
        _dealerSet: new Set(),
      });
    }

    const item = summaryMap.get(actorCode);
    const isTopOutlet = dealerTopOutletMap.get(dealerCode) === true;
    const isDone = doneDealerSet.has(dealerCode);

    if (!item._dealerSet.has(dealerCode)) {
      item._dealerSet.add(dealerCode);
      item.total += 1;

      if (isDone) item.done += 1;
      else item.pending += 1;

      if (isTopOutlet) {
        item.total_top_outlets += 1;

        if (isDone) item.done_top_outlet += 1;
        else item.pending_top_outlet += 1;
      }
    }
  }

  const rows = Array.from(summaryMap.values()).map((item) => {
    const totalTop = item.total_top_outlets || 0;

    return {
      name: item.name,
      code: item.code,
      position: item.position,
      total: item.total,
      done: item.done,
      done_percentage: pct(item.done, item.total),
      pending: item.pending,
      pending_percentage: pct(item.pending, item.total),
      total_top_outlets: item.total_top_outlets,
      done_top_outlet: item.done_top_outlet,
      done_top_outlet_percentage: pct(item.done_top_outlet, totalTop),
      pending_top_outlet: item.pending_top_outlet,
      pending_top_outlet_percentage: pct(item.pending_top_outlet, totalTop),
    };
  });

  rows.sort((a, b) => {
    const aPending = Number(a.pending || 0);
    const bPending = Number(b.pending || 0);
    if (bPending !== aPending) return bPending - aPending;
    return String(a.name || a.code).localeCompare(String(b.name || b.code));
  });

  return rows;
};

/* ---------------------------------- */
/* MAIN EXPORT API                    */
/* ---------------------------------- */

exports.downloadExtractionStatusRoleWiseExcel = async (req, res) => {
  try {
    const { startDate, endDate, topOutlet = false } = req.body;

    const { code: userCode, position: userPosition, role: userRole } = req.user;

    if (!userCode || !userPosition || !userRole) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    const { rows, hierarchyEntries, start, end } = await buildDealerWiseRows({
      startDate,
      endDate,
      topOutlet,
      userCode,
      userPosition,
      userRole,
    });

    const [smdRows, zsmRows, asmRows, mddRows, tseRows] = await Promise.all([
      buildRoleSummaryRows({ hierarchyEntries, start, end, role: "smd" }),
      buildRoleSummaryRows({ hierarchyEntries, start, end, role: "zsm" }),
      buildRoleSummaryRows({ hierarchyEntries, start, end, role: "asm" }),
      buildRoleSummaryRows({ hierarchyEntries, start, end, role: "mdd" }),
      buildRoleSummaryRows({ hierarchyEntries, start, end, role: "tse" }),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "OpenAI";
    workbook.created = new Date();

    addCombinedWorksheet(workbook, "Combined", rows);
    addRoleSummaryWorksheet(workbook, "SMD", smdRows);
    addRoleSummaryWorksheet(workbook, "ZSM", zsmRows);
    addRoleSummaryWorksheet(workbook, "ASM", asmRows);
    addRoleSummaryWorksheet(workbook, "MDD", mddRows);
    addRoleSummaryWorksheet(workbook, "TSE", tseRows);

    const fileName = `Extraction_Dealer_Wise_${moment(start).format(
      "DDMMYYYY"
    )}_to_${moment(end).format("DDMMYYYY")}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    console.error("Error in downloadExtractionStatusRoleWiseExcel:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};



exports.downloadExtractionMonthWiseExcel = async (req, res) => {
  try {
    let {
      month,
      year,
      smd = [],
      zsm = [],
      asm = [],
      mdd = [],
      tse = [],
      dealer = [],
      topOutlet = null,
      extractionActive = null,
    } = req.body;

    const { code: userCode, position: userPosition, role: userRole } = req.user;

    if (!userCode || !userPosition || !userRole) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    month = Number(month);
    year = Number(year);

    if (!month || !year || month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: "Valid month and year are required",
      });
    }

    if (typeof smd === "string") smd = smd ? smd.split(",") : [];
    if (typeof zsm === "string") zsm = zsm ? zsm.split(",") : [];
    if (typeof asm === "string") asm = asm ? asm.split(",") : [];
    if (typeof mdd === "string") mdd = mdd ? mdd.split(",") : [];
    if (typeof tse === "string") tse = tse ? tse.split(",") : [];
    if (typeof dealer === "string") dealer = dealer ? dealer.split(",") : [];

    const start = moment
      .utc({ year, month: month - 1, day: 1 })
      .startOf("day")
      .toDate();

    const end = moment.utc(start).add(1, "month").toDate();

    const hierarchyFilter = {
      hierarchy_name: "default_sales_flow",
    };

    if (smd.length) hierarchyFilter.smd = { $in: smd };
    if (zsm.length) hierarchyFilter.zsm = { $in: zsm };
    if (asm.length) hierarchyFilter.asm = { $in: asm };
    if (mdd.length) hierarchyFilter.mdd = { $in: mdd };
    if (tse.length) hierarchyFilter.tse = { $in: tse };
    if (dealer.length) hierarchyFilter.dealer = { $in: dealer };

    // Optional role-based restriction from logged-in user
    // Adjust this if your access rules are different
    if (userRole !== "admin") {
      if (userPosition === "smd") hierarchyFilter.smd = userCode;
      if (userPosition === "zsm") hierarchyFilter.zsm = userCode;
      if (userPosition === "asm") hierarchyFilter.asm = userCode;
      if (userPosition === "mdd") hierarchyFilter.mdd = userCode;
      if (userPosition === "tse") hierarchyFilter.tse = userCode;
      if (userPosition === "dealer") hierarchyFilter.dealer = userCode;
    }

    const hierarchyEntries = await HierarchyEntries.find(hierarchyFilter).lean();

    if (!hierarchyEntries.length) {
      return res.status(404).json({
        success: false,
        message: "No hierarchy entries found",
      });
    }

    const hierarchyMap = {};
    const dealerCodes = [];
    const actorCodesSet = new Set();

    hierarchyEntries.forEach((entry) => {
      if (entry.dealer) {
        hierarchyMap[entry.dealer] = entry;
        dealerCodes.push(entry.dealer);
      }

      if (entry.smd && entry.smd !== "VACANT") actorCodesSet.add(entry.smd);
      if (entry.zsm && entry.zsm !== "VACANT") actorCodesSet.add(entry.zsm);
      if (entry.asm && entry.asm !== "VACANT") actorCodesSet.add(entry.asm);
      if (entry.mdd && entry.mdd !== "VACANT") actorCodesSet.add(entry.mdd);
      if (entry.tse && entry.tse !== "VACANT") actorCodesSet.add(entry.tse);
      if (entry.dealer && entry.dealer !== "VACANT") actorCodesSet.add(entry.dealer);
    });

    const uniqueDealerCodes = [...new Set(dealerCodes)];

    const dealerUserFilter = {
      code: { $in: uniqueDealerCodes },
    };

    if (topOutlet === true) dealerUserFilter.top_outlet = true;
    if (topOutlet === false && req.body.hasOwnProperty("topOutlet")) {
      dealerUserFilter.top_outlet = false;
    }

    if (extractionActive === true) dealerUserFilter.extraction_active = true;
    if (
      extractionActive === false &&
      req.body.hasOwnProperty("extractionActive")
    ) {
      dealerUserFilter.extraction_active = false;
    }

    const dealerUsers = await User.find(
      dealerUserFilter,
      {
        code: 1,
        name: 1,
        top_outlet: 1,
        extraction_active: 1,
        latitude: 1,
        longitude: 1,
        district: 1,
        taluka: 1,
        zone: 1,
        town: 1,
        _id: 0,
      }
    ).lean();

    if (!dealerUsers.length) {
      return res.status(404).json({
        success: false,
        message: "No dealer users found",
      });
    }

    const dealerUserMap = {};
    const filteredDealerCodes = [];

    dealerUsers.forEach((user) => {
      dealerUserMap[user.code] = user;
      filteredDealerCodes.push(user.code);
    });

    const actorCodeDocs = await ActorCode.find(
      { code: { $in: Array.from(actorCodesSet) } },
      { code: 1, name: 1, position: 1, _id: 0 }
    ).lean();

    const actorCodeMap = {};
    actorCodeDocs.forEach((item) => {
      actorCodeMap[item.code] = {
        name: item.name || "",
        position: item.position || "",
      };
    });

    const extractionRecords = await ExtractionRecord.find({
      dealer: { $in: filteredDealerCodes },
      createdAt: { $gte: start, $lt: end },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!extractionRecords.length) {
      return res.status(404).json({
        success: false,
        message: "No extraction records found for selected month/year",
      });
    }

    const rows = extractionRecords.map((record, index) => {
      const hierarchy = hierarchyMap[record.dealer] || {};
      const dealerUser = dealerUserMap[record.dealer] || {};

      const smdCode = hierarchy.smd || "";
      const zsmCode = hierarchy.zsm || "";
      const asmCode = hierarchy.asm || "";
      const mddCode = hierarchy.mdd || "";
      const tseCode = hierarchy.tse || "";
      const dealerCode = hierarchy.dealer || record.dealer || "";

      return {
        sr_no: index + 1,

        uploaded_by: record.uploaded_by || "",
        extraction_date: record.createdAt
          ? moment(record.createdAt).format("DD-MM-YYYY")
          : "",
        extraction_time: record.createdAt
          ? moment(record.createdAt).format("HH:mm:ss")
          : "",
        month: record.month || String(month),

        dealer_code: dealerCode,
        dealer_name: dealerUser.name || actorCodeMap[dealerCode]?.name || "",
        top_outlet:
          dealerUser.top_outlet === true
            ? "Yes"
            : dealerUser.top_outlet === false
            ? "No"
            : "",
        extraction_active:
          dealerUser.extraction_active === true
            ? "Yes"
            : dealerUser.extraction_active === false
            ? "No"
            : "",
       dealer_latitude:
  dealerUser.latitude !== undefined && dealerUser.latitude !== null
    ? Number(dealerUser.latitude.toString())
    : "",
dealer_longitude:
  dealerUser.longitude !== undefined && dealerUser.longitude !== null
    ? Number(dealerUser.longitude.toString())
    : "",

        smd_code: smdCode,
        smd_name: actorCodeMap[smdCode]?.name || "",

        zsm_code: zsmCode,
        zsm_name: actorCodeMap[zsmCode]?.name || "",

        asm_code: asmCode,
        asm_name: actorCodeMap[asmCode]?.name || "",

        mdd_code: mddCode,
        mdd_name: actorCodeMap[mddCode]?.name || "",

        tse_code: tseCode,
        tse_name: actorCodeMap[tseCode]?.name || "",

        brand: record.brand || "",
        product_code: record.product_code || "",
        product_name: record.product_name || "",
        product_category: record.product_category || "",
        segment: record.segment || "",
        price: record.price || 0,
        quantity: record.quantity || 0,
        amount: record.amount || 0,
      };
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "OpenAI";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Extraction Records");

    worksheet.columns = [
      { header: "SR NO", key: "sr_no", width: 10 },
      { header: "UPLOADED BY", key: "uploaded_by", width: 18 },
      { header: "EXTRACTION DATE", key: "extraction_date", width: 16 },
      { header: "EXTRACTION TIME", key: "extraction_time", width: 14 },
      { header: "MONTH", key: "month", width: 10 },

      { header: "DEALER CODE", key: "dealer_code", width: 18 },
      { header: "DEALER NAME", key: "dealer_name", width: 28 },
      { header: "TOP OUTLET", key: "top_outlet", width: 14 },
      { header: "EXTRACTION ACTIVE", key: "extraction_active", width: 18 },
      { header: "DEALER LATITUDE", key: "dealer_latitude", width: 18 },
      { header: "DEALER LONGITUDE", key: "dealer_longitude", width: 18 },

      { header: "SMD CODE", key: "smd_code", width: 16 },
      { header: "SMD NAME", key: "smd_name", width: 24 },

      { header: "ZSM CODE", key: "zsm_code", width: 16 },
      { header: "ZSM NAME", key: "zsm_name", width: 24 },

      { header: "ASM CODE", key: "asm_code", width: 16 },
      { header: "ASM NAME", key: "asm_name", width: 24 },

      { header: "MDD CODE", key: "mdd_code", width: 16 },
      { header: "MDD NAME", key: "mdd_name", width: 24 },

      { header: "TSE CODE", key: "tse_code", width: 16 },
      { header: "TSE NAME", key: "tse_name", width: 24 },

      { header: "BRAND", key: "brand", width: 16 },
      { header: "PRODUCT CODE", key: "product_code", width: 28 },
      { header: "PRODUCT NAME", key: "product_name", width: 28 },
      { header: "PRODUCT CATEGORY", key: "product_category", width: 20 },
      { header: "SEGMENT", key: "segment", width: 14 },
      { header: "PRICE", key: "price", width: 12 },
      { header: "QUANTITY", key: "quantity", width: 12 },
      { header: "AMOUNT", key: "amount", width: 14 },
    ];

    rows.forEach((row) => {
      worksheet.addRow(row);
    });

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.alignment = { vertical: "middle", horizontal: "left" };
      });
    });

    const fileName = `Extraction_Month_Wise_${String(month).padStart(
      2,
      "0"
    )}_${year}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    console.error("Error in downloadExtractionMonthWiseExcel:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};


