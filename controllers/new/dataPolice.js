const ActivationData = require("../../model/ActivationData");
const SecondaryData = require("../../model/SecondaryData");
const TertiaryData = require("../../model/TertiaryData");
const ProductMaster = require("../../model/ProductMaster");
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

    const [activation, tertiary, secondary] =
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
          mddCodes, // ✅ beat_code-based mddCodes
          "net_value",
          "qty"
        ),
      ]);

    return res.json({
      success: true,
      dateRange: { start_date, end_date },
      activation,
      tertiary,
      secondary,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


