const ActivationData = require("../../model/ActivationData")
const SecondaryData = require("../../model/SecondaryData");
const TertiaryData = require("../../model/TertiaryData");
const ProductMaster = require("../../model/ProductMaster");


const {
  getLastThreeMonths,
  getYesterdayIndia,
} = require("../../utils/reportHelpers");

const {
  getDealerCodesFromFilters,
} = require("../../services/dealerFilterService");

exports.getReportSummary = async (req, res) => {
  try {
    const { type, selectedMonth, filters } = req.body;

    if (!type || !selectedMonth) {
      return res.status(400).json({
        success: false,
        message: "type and selectedMonth required",
      });
    }

    const months = getLastThreeMonths(selectedMonth);

    // Get dealer codes if filtering applied
    const dealerCodes = await getDealerCodesFromFilters(filters);

    let Model;
    let dateField;
    let valueField;
    let qtyField;
    let dealerField;

    if (type === "activation") {
      Model = ActivationData;
      dateField = "activation_date_raw";
      valueField = "val";
      qtyField = "qty";
      dealerField = "tertiary_buyer_code";
    }

    if (type === "tertiary") {
      Model = TertiaryData;
      dateField = "invoice_date_raw";
      valueField = "net_value";
      qtyField = "qty";
      dealerField = "dealer_code";
    }

    if (type === "secondary") {
      Model = SecondaryData;
      dateField = "invoice_date_raw";
      valueField = "net_value";
      qtyField = "qty";
      dealerField = "mdd_code";
    }

    // Base Match
    const match = {
      year_month: { $in: months },
    };

    if (dealerCodes && dealerCodes.length > 0) {
      match[dealerField] = { $in: dealerCodes };
    }

    // Monthly aggregation
    const monthlyData = await Model.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$year_month",
          totalValue: { $sum: `$${valueField}` },
          totalQty: { $sum: `$${qtyField}` },
        },
      },
    ]);

    // Convert to map
    const monthlyMap = {};
    monthlyData.forEach((m) => {
      monthlyMap[m._id] = m;
    });

    // MTD
    const [year, month] = selectedMonth.split("-");
    const yesterdayRaw = getYesterdayIndia();

    const mtdData = await Model.aggregate([
      {
        $match: {
          year_month: selectedMonth,
          ...(dealerCodes && dealerCodes.length > 0
            ? { [dealerField]: { $in: dealerCodes } }
            : {}),
        },
      },
      {
        $group: {
          _id: null,
          totalValue: { $sum: `$${valueField}` },
          totalQty: { $sum: `$${qtyField}` },
        },
      },
    ]);

    // FTD (Yesterday only)
    const ftdData = await Model.aggregate([
      {
        $match: {
          [dateField]: yesterdayRaw,
          ...(dealerCodes && dealerCodes.length > 0
            ? { [dealerField]: { $in: dealerCodes } }
            : {}),
        },
      },
      {
        $group: {
          _id: null,
          totalValue: { $sum: `$${valueField}` },
          totalQty: { $sum: `$${qtyField}` },
        },
      },
    ]);

    const current = monthlyMap[selectedMonth] || {
      totalValue: 0,
      totalQty: 0,
    };

    const prev = monthlyMap[months[1]] || {
      totalValue: 0,
      totalQty: 0,
    };

    const growth =
      prev.totalValue === 0
        ? 0
        : ((current.totalValue - prev.totalValue) /
            prev.totalValue) *
          100;

    return res.json({
      success: true,
      months,
      data: {
        monthly: monthlyMap,
        mtd: mtdData[0] || { totalValue: 0, totalQty: 0 },
        ftd: ftdData[0] || { totalValue: 0, totalQty: 0 },
        growthPercent: Number(growth.toFixed(2)),
      },
    });
  } catch (err) {
    console.error("Report error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};




exports.getSegmentSummary = async (req, res) => {
  try {
    const { selectedMonth, filters } = req.body;

    const dealerCodes = await getDealerCodesFromFilters(filters);

    const match = {
      year_month: selectedMonth,
    };

    if (dealerCodes && dealerCodes.length > 0) {
      match.dealer_code = { $in: dealerCodes };
    }

    const result = await TertiaryData.aggregate([
      // STEP 1: FILTER EARLY (uses year_month index)
      { $match: match },

      // STEP 2: JOIN WITH PRODUCT MASTER (uses sku index)
      {
        $lookup: {
          from: "productmasters",
          localField: "sku",
          foreignField: "sku",
          as: "product",
        },
      },

      // STEP 3: Flatten
      { $unwind: "$product" },

      // STEP 4: GROUP BY SEGMENT
      {
        $group: {
          _id: "$product.segment",
          totalValue: { $sum: "$net_value" },
          totalQty: { $sum: "$qty" },
        },
      },

      // STEP 5: Sort
      { $sort: { totalValue: -1 } },
    ]);

    res.json({
      success: true,
      data: result,
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
