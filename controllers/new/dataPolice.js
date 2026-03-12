const ActivationData = require("../../model/ActivationData");
const SecondaryData = require("../../model/SecondaryData");
const TertiaryData = require("../../model/TertiaryData");
const ProductMaster = require("../../model/ProductMaster");
const Product = require("../../model/Product");
const moment = require("moment-timezone");
const { getDealerCodesFromFilters } = require("../../services/dealerFilterService");


// =====================================================
// GET PRODUCTS NOT IN PRODUCT MASTER
// =====================================================
exports.getUnmappedProducts = async (req, res) => {
  try {
    // 1️⃣ Get distinct models from all 3 collections
    const activationModels = await ActivationData.distinct("model_no");
    const secondaryModels = await SecondaryData.distinct("model");
    const tertiaryModels = await TertiaryData.distinct("model");

    // Combine all models
    const allSalesModels = [
      ...activationModels,
      ...secondaryModels,
      ...tertiaryModels,
    ];

    // Normalize & remove duplicates
    const uniqueSalesModels = [
      ...new Set(
        allSalesModels
          .filter(Boolean)
          .map((m) => m.toString().trim())
      ),
    ];

    // 2️⃣ Get product master models
    const masterModels = await ProductMaster.distinct("model");

    const normalizedMasterModels = new Set(
      masterModels
        .filter(Boolean)
        .map((m) => m.toString().trim())
    );

    // 3️⃣ Find missing models
    const missingModels = uniqueSalesModels.filter(
      (model) => !normalizedMasterModels.has(model)
    );

    res.json({
      success: true,
      totalSalesModels: uniqueSalesModels.length,
      totalMasterModels: normalizedMasterModels.size,
      missingCount: missingModels.length,
      missingModels,
    });

  } catch (err) {
    console.error("Unmapped Products Error:", err);
    res.status(500).json({
      success: false,
      message: "Error fetching unmapped products",
    });
  }
};

exports.getExcludedRawData = async (req, res) => {
  try {
    let { start_date, end_date, filters } = req.body || {};
    const user = req.user;

    const indiaNow = moment().tz("Asia/Kolkata");

    if (!start_date || !end_date) {
      start_date = indiaNow.clone().startOf("month").format("YYYY-MM-DD");
      end_date = indiaNow.format("YYYY-MM-DD");
    }

    const startDate = moment(start_date, "YYYY-MM-DD").startOf("day");
    const endDate = moment(end_date, "YYYY-MM-DD").endOf("day");

    const { dealerCodes = [], mddCodes = [] } =
      await getDealerCodesFromFilters(filters, user);

    const getExcluded = async (
      Model,
      dateField,
      dealerField,
      codes,
      valueField,
      qtyField
    ) => {
      const safeCodes = Array.isArray(codes) ? codes : [];

      const docs = await Model.aggregate([
        {
          $addFields: {
            parsedDate: {
              $let: {
                vars: { parts: { $split: [`$${dateField}`, "/"] } },
                in: {
                  $cond: [
                    { $eq: [{ $size: "$$parts" }, 3] },
                    {
                      $dateFromParts: {
                        year: {
                          $add: [
                            2000,
                            { $toInt: { $arrayElemAt: ["$$parts", 2] } }
                          ]
                        },
                        month: { $toInt: { $arrayElemAt: ["$$parts", 0] } },
                        day: { $toInt: { $arrayElemAt: ["$$parts", 1] } }
                      }
                    },
                    null
                  ]
                }
              }
            }
          }
        },
        {
          $match: {
            parsedDate: {
              $gte: startDate.toDate(),
              $lte: endDate.toDate(),
            }
          }
        },
        {
          $match: {
            $or: [
              { [dealerField]: { $nin: safeCodes } },
              { parsedDate: null }
            ]
          }
        }
      ]);

      let totalVal = 0;
      let totalQty = 0;

      docs.forEach(d => {
        totalVal += Number(d[valueField] || 0);
        totalQty += Number(d[qtyField] || 0);
      });

      return {
        rows: docs,
        totalVal,
        totalQty
      };
    };

    const [activation, tertiary, secondary] = await Promise.all([
      getExcluded(
        ActivationData,
        "activation_date_raw",
        "tertiary_buyer_code",
        dealerCodes,
        "val",
        "qty"
      ),
      getExcluded(
        TertiaryData,
        "invoice_date_raw",
        "dealer_code",
        dealerCodes,
        "net_value",
        "qty"
      ),
      getExcluded(
        SecondaryData,
        "invoice_date_raw",
        "mdd_code",
        mddCodes, // ✅ beat_code based mddCodes
        "net_value",
        "qty"
      )
    ]);

    return res.json({
      success: true,
      dateRange: { start_date, end_date },
      activation,
      tertiary,
      secondary
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


exports.getSalesReportFlags = async (req, res) => {
  try {
    const moment = require("moment-timezone");

    let { start_date, end_date, filters } = req.body || {};
    const user = req.user;

    const indiaNow = moment().tz("Asia/Kolkata");

    if (!start_date || !end_date) {
      start_date = indiaNow.clone().startOf("month").format("YYYY-MM-DD");
      end_date = indiaNow.format("YYYY-MM-DD");
    }

    const startDate = moment(start_date, "YYYY-MM-DD").startOf("day");
    const endDate = moment(end_date, "YYYY-MM-DD").endOf("day");

    const { dealerCodes = [], mddCodes = [] } =
      await getDealerCodesFromFilters(filters, user);

    const analyzeModel = async (
      Model,
      dateField,
      dealerField,
      codes,
      valueField,
      qtyField
    ) => {
      const safeCodes = Array.isArray(codes) ? codes : [];

      const docs = await Model.find({}).lean();

      let summary = {};
      let totalExcluded = 0;
      let totalVal = 0;
      let totalQty = 0;

      docs.forEach((doc) => {
        let reason = null;
        let parsedDate = null;

        if (doc[dateField]) {
          const parts = doc[dateField].split("/");
          if (parts.length === 3) {
            parsedDate = moment(
              `20${parts[2]}-${parts[0]}-${parts[1]}`,
              "YYYY-MM-DD"
            );
          }
        }

        if (!parsedDate || !parsedDate.isValid()) {
          reason = "Invalid date format";
        } else if (
          parsedDate.isBefore(startDate) ||
          parsedDate.isAfter(endDate)
        ) {
          reason = "Outside selected date range";
        } else if (
            safeCodes.length &&
            !safeCodes.includes(doc[dealerField])
            ) {
            reason =
                dealerField === "mdd_code"
                ? "MDD not in hierarchy"
                : "Dealer not in hierarchy";
            }


        if (reason) {
          totalExcluded++;
          totalVal += Number(doc[valueField] || 0);
          totalQty += Number(doc[qtyField] || 0);
          summary[reason] = (summary[reason] || 0) + 1;
        }
      });

      return {
        totalExcluded,
        totalVal,
        totalQty,
        breakdown: summary,
      };
    };

    const analyzeWOD = async (
      Model,
      dateField,
      dealerField,
      codes,
      qtyField
    ) => {
      const safeCodes = Array.isArray(codes) ? codes : [];
      const docs = await Model.find({}).lean();

      const dealerMap = {};
      let excludedDealers = 0;

      docs.forEach((doc) => {
        let parsedDate = null;

        if (doc[dateField]) {
          const parts = doc[dateField].split("/");
          if (parts.length === 3) {
            parsedDate = moment(
              `20${parts[2]}-${parts[0]}-${parts[1]}`,
              "YYYY-MM-DD"
            );
          }
        }

        if (!parsedDate || !parsedDate.isValid()) return;
        if (
          parsedDate.isBefore(startDate) ||
          parsedDate.isAfter(endDate)
        ) return;

        if (!doc[dealerField]) return;
        if (Number(doc[qtyField] || 0) <= 0) return;

        if (!dealerMap[doc[dealerField]]) {
          dealerMap[doc[dealerField]] = {
            inHierarchy:
              !safeCodes.length ||
              safeCodes.includes(doc[dealerField]),
          };
        }
      });

      const uniqueDealers = Object.keys(dealerMap);

      uniqueDealers.forEach((code) => {
        if (!dealerMap[code].inHierarchy) excludedDealers++;
      });

      return {
        totalDealers: uniqueDealers.length,
        excludedDealers,
      };
    };

    const [activation, tertiary, secondary, wod] =

    await Promise.all([
      analyzeModel(
        ActivationData,
        "activation_date_raw",
        "tertiary_buyer_code",
        dealerCodes,
        "val",
        "qty"
      ),
      analyzeModel(
        TertiaryData,
        "invoice_date_raw",
        "dealer_code",
        dealerCodes,
        "net_value",
        "qty"
      ),
      analyzeModel(
        SecondaryData,
        "invoice_date_raw",
        "mdd_code",
        mddCodes,
        "net_value",
        "qty"
      ),
      analyzeWOD(
        TertiaryData, // 🔥 change to ActivationData if needed
        "invoice_date_raw",
        "dealer_code",
        dealerCodes,
        "qty"
      ),
    ]);


    return res.json({
      success: true,
      dateRange: { start_date, end_date },
      activation,
      tertiary,
      secondary,
      wod
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};




// correct product price segments 

function toNumber(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  const s = String(val).replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function bucketFromPrice(price) {
  if (!price || price <= 0) return "";

  if (price <= 10000) return "6-10";
  if (price <= 20000) return "10-20";
  if (price <= 30000) return "20-30";
  if (price <= 40000) return "30-40";
  if (price <= 70000) return "40-70";
  if (price <= 100000) return "70-100";
  if (price <= 120000) return "100-120";
  return "120";
}

exports.recalculateProductSegmentsByFilter = async (req, res) => {
  try {
    let { segments = [] } = req.body;

    if (!Array.isArray(segments) || !segments.length) {
      return res.status(400).json({
        success: false,
        message: "segments array is required",
      });
    }

    segments = segments.map((s) => String(s).trim()).filter(Boolean);

    const products = await Product.find({
      segment: { $in: segments },
    }).lean();

    if (!products.length) {
      return res.status(200).json({
        success: true,
        matchedCount: 0,
        modifiedCount: 0,
        message: "No products found for given segments",
      });
    }

    const bulkOps = [];
    const preview = [];

    for (const product of products) {
      const price = toNumber(product.price);
      const newSegment = bucketFromPrice(price);
      const oldSegment = String(product.segment || "").trim();

      if (!newSegment || oldSegment === newSegment) continue;

      bulkOps.push({
        updateOne: {
          filter: { _id: product._id },
          update: {
            $set: {
              segment: newSegment,
            },
          },
        },
      });

      if (preview.length < 20) {
        preview.push({
          product_code: product.product_code,
          product_name: product.product_name,
          price: product.price,
          oldSegment,
          newSegment,
        });
      }
    }

    if (!bulkOps.length) {
      return res.status(200).json({
        success: true,
        matchedCount: products.length,
        modifiedCount: 0,
        message: "All matching products already have correct segments",
      });
    }

    const result = await Product.bulkWrite(bulkOps);

    return res.status(200).json({
      success: true,
      matchedCount: products.length,
      modifiedCount: result.modifiedCount || 0,
      preview,
      message: "Product segments recalculated successfully",
    });
  } catch (error) {
    console.error("Error in recalculateProductSegmentsByFilter:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};


// correct price segments

