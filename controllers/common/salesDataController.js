const SalesData = require("../../model/SalesData");
const Product = require("../../model/Product");
const Target = require("../../model/Target");
const Entity = require("../../model/Entity");
const ActorCode = require("../../model/ActorCode");
const HierarchyEntries = require("../../model/HierarchyEntries");
const moment = require("moment");
const { getDashboardOverview, getProductWiseTargets } = require("../../helpers/salesHelpers");
const {getPriceBandWiseTargets} = require("../../helpers/salesHelpers");

const ActorTypesHierarchy = require("../../model/ActorTypesHierarchy");
const User = require("../../model/User");
const { Parser } = require("json2csv");
const MddWiseTarget = require("../../model/MddWiseTarget");

// helpers/targets.js


exports.getSalesReportByCode = async (req, res) => {
  try {
    let { start_date, end_date, filter_type, code, report_type } = req.body;
    filter_type = filter_type || "value"; // Default to 'value' if not provided
    report_type = report_type || "segment"; // Default to segment-wise report

    if (!start_date || !end_date || !code) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Start date, end date, and code are required.",
        });
    }

    if (!["segment", "channel"].includes(report_type)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Invalid report_type. Choose 'segment' or 'channel'.",
        });
    }

    // Convert dates to Indian Standard Time (IST)
    const convertToIST = (date) => {
      let d = new Date(date);
      return new Date(d.getTime() + 5.5 * 60 * 60 * 1000); // Convert UTC to IST
    };

    const startDate = convertToIST(new Date(start_date));
    const endDate = convertToIST(new Date(end_date));

    // Fetch actor details using the code
    const actor = await ActorCode.findOne({ code });
    if (!actor) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Actor not found for the provided code.",
        });
    }

    const { role, position } = actor;

    // Determine whether to fetch all data or filter by dealers
    let dealerCodes = [];
    if (["admin", "mdd", "super_admin"].includes(role)) {
      dealerCodes = null; // No filtering needed
    } else if (role === "employee" && position) {
      // Fetch dealers assigned to this position
      const hierarchyEntries = await HierarchyEntries.find({
        hierarchy_name: "default_sales_flow",
        [position]: code, // Match the position dynamically
      });

      dealerCodes = hierarchyEntries.map((entry) => entry.dealer);
    } else {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized role." });
    }

    // Fetch segments or channels based on `report_type`
    const entity = await Entity.findOne({
      name: report_type === "segment" ? "segments" : "channels",
    });
    if (!entity) {
      return res
        .status(400)
        .json({
          success: false,
          message: `No ${report_type} found in the database.`,
        });
    }
    const reportCategories = entity.value || [];

    // Fetch Target for the given `code`
    const target = await Target.findOne({ entity: code });
    if (!target) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Target not found for the provided code.",
        });
    }

    // Get last month’s start & end date till today's date
    let lmtdStartDate = new Date(startDate);
    lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);

    let lmtdEndDate = new Date(endDate);
    lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

    let todayDate = new Date().getDate(); // Today's day in the month

    // Fetch Sales Data (MTD) with dealer filtering
    let salesQuery = { date: { $gte: startDate, $lte: endDate } };
    if (dealerCodes) {
      salesQuery.buyer_code = { $in: dealerCodes };
    }
    const salesData = await SalesData.find(salesQuery);

    // Fetch Sales Data (LMTD) with dealer filtering
    let lastMonthSalesQuery = {
      date: { $gte: lmtdStartDate, $lte: lmtdEndDate },
    };
    if (dealerCodes) {
      lastMonthSalesQuery.buyer_code = { $in: dealerCodes };
    }
    const lastMonthSalesData = await SalesData.find(lastMonthSalesQuery);

    // Group Products by Segment
    const products = await Product.find({
      segment: segment,
      status: "active",
      brand: "samsung",
    });
    const productSegmentMap = {};
    products.forEach((product) => {
      productSegmentMap[product.product_code] = product.segment;
    });

    let reportData = [];

    // Process categories (segments or channels)
    for (let category of reportCategories) {
      let categorySales;
      let lastMonthCategorySales;
      let targetValue;

      if (report_type === "segment") {
        categorySales = salesData.filter(
          (sale) => productSegmentMap[sale.product_code] === category
        );
        lastMonthCategorySales = lastMonthSalesData.filter(
          (sale) => productSegmentMap[sale.product_code] === category
        );
        targetValue = target.value[filter_type]?.segment?.[category] || 0;
      } else {
        categorySales = salesData.filter((sale) => sale.channel === category);
        lastMonthCategorySales = lastMonthSalesData.filter(
          (sale) => sale.channel === category
        );
        targetValue = target.value[filter_type]?.channel?.[category] || 0;
      }

      let mtdValue = categorySales.reduce(
        (sum, sale) =>
          sum + (filter_type === "value" ? sale.total_amount : sale.quantity),
        0
      );
      let lmtdValue = lastMonthCategorySales.reduce(
        (sum, sale) =>
          sum + (filter_type === "value" ? sale.total_amount : sale.quantity),
        0
      );

      let pending = targetValue - mtdValue;
      let ads = (mtdValue / todayDate).toFixed(2);
      let reqAds = ((pending > 0 ? pending : 0) / (30 - todayDate)).toFixed(2);
      let growth =
        lmtdValue !== 0 ? ((mtdValue - lmtdValue) / lmtdValue) * 100 : 0;
      let ftd = categorySales
        .filter((sale) => new Date(sale.date).getDate() === todayDate)
        .reduce(
          (sum, sale) =>
            sum + (filter_type === "value" ? sale.total_amount : sale.quantity),
          0
        );

      reportData.push({
        "Segment/Channel": category,
        Target: targetValue,
        MTD: mtdValue,
        LMTD: lmtdValue,
        Pending: pending,
        ADS: ads,
        "Req. ADS": reqAds,
        "% Growth": growth.toFixed(2),
        FTD: ftd,
        "% Contribution": 0, // Placeholder, calculated later
      });
    }

    // Calculate % Contribution
    let totalSales = reportData.reduce((sum, row) => sum + row.MTD, 0);
    reportData = reportData.map((row) => ({
      ...row,
      "% Contribution":
        totalSales !== 0 ? ((row.MTD / totalSales) * 100).toFixed(2) : 0,
    }));

    // Headers for Flutter
    const headers = [
      "Segment/Channel",
      "Target",
      "MTD",
      "LMTD",
      "Pending",
      "ADS",
      "Req. ADS",
      "% Growth",
      "FTD",
      "% Contribution",
    ];

    res.status(200).json({ headers, data: reportData });
  } catch (error) {
    console.error("Error generating sales report:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// exports.getSalesReportForUser = async (req, res) => {
//   try {
//     let {code} = req.user;
//     let { start_date, end_date, filter_type, report_type } = req.body;
//     filter_type = filter_type || "value"; // Default to 'value' if not provided
//     report_type = report_type || "segment"; // Default to segment-wise report

//     console.log("Filters: ", start_date, end_date, filter_type, report_type);

//     if (!start_date || !end_date || !code) {
//       return res.status(400).json({ success: false, message: "Start date, end date, and code are required." });
//     }

//     if (!["segment", "channel"].includes(report_type)) {
//       return res.status(400).json({ success: false, message: "Invalid report_type. Choose 'segment' or 'channel'." });
//     }

//     // Convert dates to Indian Standard Time (IST)
//     const convertToIST = (date) => {
//       let d = new Date(date);
//       return new Date(d.getTime() + (5.5 * 60 * 60 * 1000)); // Convert UTC to IST
//     };

//     const startDate = convertToIST(new Date(start_date));
//     const endDate = convertToIST(new Date(end_date));

//     // Fetch actor details using the code
//     const actor = await ActorCode.findOne({ code });
//     if (!actor) {
//       return res.status(404).json({ success: false, message: "Actor not found for the provided code." });
//     }

//     const { role, position } = actor;

//     // Determine whether to fetch all data or filter by dealers
//     let dealerCodes = [];
//     if (["admin", "mdd", "super_admin"].includes(role)) {
//       dealerCodes = null; // No filtering needed
//     } else if (role === "employee" && position) {
//       // Fetch dealers assigned to this position
//       const hierarchyEntries = await HierarchyEntries.find({
//         hierarchy_name: "default_sales_flow",
//         [position]: code, // Match the position dynamically
//       });

//       dealerCodes = hierarchyEntries.map(entry => entry.dealer);
//     } else {
//       return res.status(403).json({ success: false, message: "Unauthorized role." });
//     }

//     // Fetch segments or channels based on `report_type`
//     const entity = await Entity.findOne({ name: report_type === "segment" ? "segments" : "channels" });
//     if (!entity) {
//       return res.status(400).json({ success: false, message: `No ${report_type} found in the database.` });
//     }
//     const reportCategories = entity.value || [];

//     // Fetch Target for the given `code`
//     const target = await Target.findOne({ entity: code });
//     if (!target) {
//       return res.status(404).json({ success: false, message: "Target not found for the provided code." });
//     }

//     // Get last month’s start & end date till today's date
//     let lmtdStartDate = new Date(startDate);
//     lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);

//     let lmtdEndDate = new Date(endDate);
//     lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

//     let todayDate = new Date().getDate(); // Today's day in the month

//     // Fetch Sales Data (MTD) with dealer filtering
//     let salesQuery = { date: { $gte: startDate, $lte: endDate } };
//     if (dealerCodes) {
//       salesQuery.buyer_code = { $in: dealerCodes };
//     }
//     const salesData = await SalesData.find(salesQuery);

//     // Fetch Sales Data (LMTD) with dealer filtering
//     let lastMonthSalesQuery = { date: { $gte: lmtdStartDate, $lte: lmtdEndDate } };
//     if (dealerCodes) {
//       lastMonthSalesQuery.buyer_code = { $in: dealerCodes };
//     }
//     const lastMonthSalesData = await SalesData.find(lastMonthSalesQuery);

//     // Group Products by Segment
//     const products = await Product.find({ status: "active" });
//     const productSegmentMap = {};
//     products.forEach((product) => {
//       productSegmentMap[product.product_code] = product.segment;
//     });

//     let reportData = [];

//     // Process categories (segments or channels)
//     for (let category of reportCategories) {
//       let categorySales;
//       let lastMonthCategorySales;
//       let targetValue;

//       if (report_type === "segment") {
//         categorySales = salesData.filter(sale => productSegmentMap[sale.product_code] === category);
//         lastMonthCategorySales = lastMonthSalesData.filter(sale => productSegmentMap[sale.product_code] === category);
//         targetValue = target.value[filter_type]?.segment?.[category] || 0;
//       } else {
//         categorySales = salesData.filter(sale => sale.channel === category);
//         lastMonthCategorySales = lastMonthSalesData.filter(sale => sale.channel === category);
//         targetValue = target.value[filter_type]?.channel?.[category] || 0;
//       }

//       let mtdValue = categorySales.reduce((sum, sale) => sum + (filter_type === "value" ? sale.total_amount : sale.quantity), 0);
//       let lmtdValue = lastMonthCategorySales.reduce((sum, sale) => sum + (filter_type === "value" ? sale.total_amount : sale.quantity), 0);

//       let pending = targetValue - mtdValue;
//       let ads = (mtdValue / todayDate).toFixed(2);
//       let reqAds = ((pending > 0 ? pending : 0) / (30 - todayDate)).toFixed(2);
//       let growth = lmtdValue !== 0 ? ((mtdValue - lmtdValue) / lmtdValue) * 100 : 0;
//       let ftd = categorySales.filter(sale => new Date(sale.date).getDate() === todayDate)
//         .reduce((sum, sale) => sum + (filter_type === "value" ? sale.total_amount : sale.quantity), 0);

//       reportData.push({
//         "Segment/Channel": category,
//         "Target": targetValue,
//         "MTD": mtdValue,
//         "LMTD": lmtdValue,
//         "Pending": pending,
//         "ADS": ads,
//         "Req. ADS": reqAds,
//         "% Growth": growth.toFixed(2),
//         "FTD": ftd,
//         "% Contribution": 0, // Placeholder, calculated later
//       });
//     }

//     // Calculate % Contribution
//     let totalSales = reportData.reduce((sum, row) => sum + row.MTD, 0);
//     reportData = reportData.map(row => ({
//       ...row,
//       "% Contribution": totalSales !== 0 ? ((row.MTD / totalSales) * 100).toFixed(2) : 0
//     }));

//     // Headers for Flutter
//     const headers = ["Segment/Channel", "Target", "MTD", "LMTD", "Pending", "ADS", "Req. ADS", "% Growth", "FTD", "% Contribution"];

//     res.status(200).json({ headers, data: reportData });

//   } catch (error) {
//     console.error("Error generating sales report:", error);
//     res.status(500).json({ success: false, message: "Internal server error" });
//   }
// };

exports.getDashboardSalesMetricsByCode = async (req, res) => {
  try {
    console.log("19 Reaching");
    let { code, filter_type, start_date, end_date } = req.body;
    filter_type = filter_type || "value"; // Default to 'value'

    if (!code || !start_date || !end_date) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Code, start_date, and end_date are required.",
        });
    }

    // Convert dates to IST
    const convertToIST = (date) => {
      let d = new Date(date);
      return new Date(d.getTime() + 5.5 * 60 * 60 * 1000); // Convert UTC to IST
    };

    const startDate = convertToIST(new Date(start_date));
    const endDate = convertToIST(new Date(end_date));

    // Fetch actor details using the code
    const actor = await ActorCode.findOne({ code });
    if (!actor) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Actor not found for the provided code.",
        });
    }

    const { role, position } = actor;

    // Determine dealer filtering based on role
    let dealerCodes = [];
    if (["admin", "super_admin"].includes(role)) {
      dealerCodes = null; // Fetch all data
    } else if (role === "employee" && position) {
      // Fetch dealers assigned to this position
      const hierarchyEntries = await HierarchyEntries.find({
        hierarchy_name: "default_sales_flow",
        [position]: code,
      });

      dealerCodes = hierarchyEntries.map((entry) => entry.dealer);
    } else {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized role." });
    }

    // Get last month’s start & end date till today's date
    let lmtdStartDate = new Date(startDate);
    lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);

    let lmtdEndDate = new Date(endDate);
    lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

    let baseQuery = dealerCodes ? { buyer_code: { $in: dealerCodes } } : {};

    // Fetch MTD Sell Out
    let mtdSellOut = await SalesData.aggregate([
      {
        $match: {
          ...baseQuery,
          sales_type: "Sell Out",
          date: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $toDouble: `$${
                filter_type === "value" ? "total_amount" : "quantity"
              }`,
            },
          },
        },
      },
    ]);

    // Fetch LMTD Sell Out
    let lmtdSellOut = await SalesData.aggregate([
      {
        $match: {
          ...baseQuery,
          sales_type: "Sell Out",
          date: { $gte: lmtdStartDate, $lte: lmtdEndDate },
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $toDouble: `$${
                filter_type === "value" ? "total_amount" : "quantity"
              }`,
            },
          },
        },
      },
    ]);

    // Fetch MTD Sell In
    let mtdSellIn = await SalesData.aggregate([
      {
        $match: {
          ...baseQuery,
          sales_type: { $in: ["Sell In", "Sell Thru2"] },
          date: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $toDouble: `$${
                filter_type === "value" ? "total_amount" : "quantity"
              }`,
            },
          },
        },
      },
    ]);

    // Fetch LMTD Sell In
    let lmtdSellIn = await SalesData.aggregate([
      {
        $match: {
          ...baseQuery,
          sales_type: { $in: ["Sell In", "Sell Thru2"] },
          date: { $gte: lmtdStartDate, $lte: lmtdEndDate },
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $toDouble: `$${
                filter_type === "value" ? "total_amount" : "quantity"
              }`,
            },
          },
        },
      },
    ]);

    // Calculate Growth %
    const calculateGrowth = (current, last) =>
      last !== 0 ? ((current - last) / last) * 100 : 0;

    let response = {
      lmtd_sell_out: lmtdSellOut.length > 0 ? lmtdSellOut[0].total : 0,
      mtd_sell_out: mtdSellOut.length > 0 ? mtdSellOut[0].total : 0,
      lmtd_sell_in: lmtdSellIn.length > 0 ? lmtdSellIn[0].total : 0,
      mtd_sell_in: mtdSellIn.length > 0 ? mtdSellIn[0].total : 0,
      sell_out_growth: calculateGrowth(
        mtdSellOut.length > 0 ? mtdSellOut[0].total : 0,
        lmtdSellOut.length > 0 ? lmtdSellOut[0].total : 0
      ).toFixed(2),
      sell_in_growth: calculateGrowth(
        mtdSellIn.length > 0 ? mtdSellIn[0].total : 0,
        lmtdSellIn.length > 0 ? lmtdSellIn[0].total : 0
      ).toFixed(2),
    };

    res.status(200).json({ success: true, data: response });
  } catch (error) {
    console.error("Error in getDashboardSalesMetrics:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// exports.getDashboardSalesMetricsForUser = async (req, res) => {
//   try {
//     let {code} = req.user;
//     let { filter_type, start_date, end_date } = req.body;
//     console.log("Filetrs: ", filter_type, start_date, end_date);
//     filter_type = filter_type || "value"; // Default to 'value'

//     if (!code || !start_date || !end_date) {
//       return res.status(400).json({ success: false, message: "Code, start_date, and end_date are required." });
//     }

//     // Convert dates to IST
//     const convertToIST = (date) => {
//       let d = new Date(date);
//       return new Date(d.getTime() + (5.5 * 60 * 60 * 1000)); // Convert UTC to IST
//     };

//     const startDate = convertToIST(new Date(start_date));
//     const endDate = convertToIST(new Date(end_date));

//     // Fetch actor details using the code
//     const actor = await ActorCode.findOne({ code });
//     if (!actor) {
//       return res.status(404).json({ success: false, message: "Actor not found for the provided code." });
//     }

//     const { role, position } = actor;

//     // Determine dealer filtering based on role
//     let dealerCodes = [];
//     if (["admin", "super_admin"].includes(role)) {
//       dealerCodes = null; // Fetch all data
//     } else if (role === "employee" && position) {
//       // Fetch dealers assigned to this position
//       const hierarchyEntries = await HierarchyEntries.find({
//         hierarchy_name: "default_sales_flow",
//         [position]: code,
//       });

//       dealerCodes = hierarchyEntries.map(entry => entry.dealer);
//     } else {
//       return res.status(403).json({ success: false, message: "Unauthorized role." });
//     }

//     // Get last month’s start & end date till today's date
//     let lmtdStartDate = new Date(startDate);
//     lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);

//     let lmtdEndDate = new Date(endDate);
//     lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

//     let baseQuery = dealerCodes ? { buyer_code: { $in: dealerCodes } } : {};

//     // Fetch MTD Sell Out
//     let mtdSellOut = await SalesData.aggregate([
//       { $match: { ...baseQuery, sales_type: "Sell Out", date: { $gte: startDate, $lte: endDate } } },
//       { $group: { _id: null, total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } } } }
//     ]);

//     // Fetch LMTD Sell Out
//     let lmtdSellOut = await SalesData.aggregate([
//       { $match: { ...baseQuery, sales_type: "Sell Out", date: { $gte: lmtdStartDate, $lte: lmtdEndDate } } },
//       { $group: { _id: null, total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } } } }
//     ]);

//     // Fetch MTD Sell In
//     let mtdSellIn = await SalesData.aggregate([
//       { $match: { ...baseQuery, sales_type: { $in: ["Sell In", "Sell Thru2"] }, date: { $gte: startDate, $lte: endDate } } },
//       { $group: { _id: null, total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } } } }
//     ]);

//     // Fetch LMTD Sell In
//     let lmtdSellIn = await SalesData.aggregate([
//       { $match: { ...baseQuery, sales_type: { $in: ["Sell In", "Sell Thru2"] }, date: { $gte: lmtdStartDate, $lte: lmtdEndDate } } },
//       { $group: { _id: null, total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } } } }
//     ]);

//     // Calculate Growth %
//     const calculateGrowth = (current, last) => (last !== 0 ? ((current - last) / last) * 100 : 0);

//     let response = {
//       lmtd_sell_out: lmtdSellOut.length > 0 ? lmtdSellOut[0].total : 0,
//       mtd_sell_out: mtdSellOut.length > 0 ? mtdSellOut[0].total : 0,
//       lmtd_sell_in: lmtdSellIn.length > 0 ? lmtdSellIn[0].total : 0,
//       mtd_sell_in: mtdSellIn.length > 0 ? mtdSellIn[0].total : 0,
//       sell_out_growth: calculateGrowth(
//         mtdSellOut.length > 0 ? mtdSellOut[0].total : 0,
//         lmtdSellOut.length > 0 ? lmtdSellOut[0].total : 0
//       ).toFixed(2),
//       sell_in_growth: calculateGrowth(
//         mtdSellIn.length > 0 ? mtdSellIn[0].total : 0,
//         lmtdSellIn.length > 0 ? lmtdSellIn[0].total : 0
//       ).toFixed(2),
//     };

//     res.status(200).json({ success: true, data: response });

//   } catch (error) {
//     console.error("Error in getDashboardSalesMetrics:", error);
//     res.status(500).json({ success: false, message: "Internal server error" });
//   }
// };

// controllers/salesController.js

//master plan dropped for now

exports.masterSalesAPI = async (req, res) => {
  try {
    const userCode = req.user.code;

    const {
      smd = "6434002",
      startdate,
      endDate,
      entities = [],
      data_type,
      report_type,
      segment,
      cluster,
      city,
      state,
    } = req.body;

    console.log("Filters received for dashboard overview...");

    const overview = await getDashboardOverview({
      userCode,
      startdate,
      endDate,
      entities,
      data_type,
      smd,
      cluster,
      city,
      state,
      segment,
    });

    return res.status(200).json({
      success: true,
      overview,
    });
  } catch (error) {
    console.error("Error in masterSalesAPI:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server Error", error: error.message });
  }
};

exports.getSalesWithHierarchyCSV = async (req, res) => {
  try {
    // Step 1: Get all sales entries (you can filter by date if needed)
    const salesEntries = await SalesData.find({}); // Optionally filter by date

    // Step 2: Fetch positions from default_sales_flow hierarchy
    const hierarchyConfig = await ActorTypesHierarchy.findOne({
      name: "default_sales_flow",
    });
    if (!hierarchyConfig || !Array.isArray(hierarchyConfig.hierarchy)) {
      return res
        .status(500)
        .json({
          success: false,
          message: "Hierarchy config not found or invalid.",
        });
    }

    const hierarchyPositions = hierarchyConfig.hierarchy; // e.g., ['smd', 'asm', 'mdd', 'tse', 'dealer']

    // Step 3: Fetch all hierarchy entries for default_sales_flow
    const hierarchyEntries = await HierarchyEntries.find({
      hierarchy_name: "default_sales_flow",
    });

    // Build a map of dealer => hierarchy
    const dealerHierarchyMap = {};
    for (const entry of hierarchyEntries) {
      if (entry.dealer) {
        dealerHierarchyMap[entry.dealer] = entry;
      }
    }

    // Step 4: Merge sales entries with dynamic hierarchy
    const enrichedSales = salesEntries.map((sale) => {
      const hierarchy = dealerHierarchyMap[sale.buyer_code] || {};
      const hierarchyData = {};

      hierarchyPositions.forEach((pos) => {
        if (pos !== "dealer") {
          // skip 'dealer' since it's already in buyer_code
          hierarchyData[pos] = hierarchy[pos] || "";
        }
      });

      return {
        ...sale._doc,
        ...hierarchyData,
      };
    });

    // Step 5: Generate dynamic CSV fields
    const allFields = Object.keys(enrichedSales[0] || {});
    const parser = new Parser({ fields: allFields });
    const csv = parser.parse(enrichedSales);

    res.header("Content-Type", "text/csv");
    res.attachment("sales_with_hierarchy.csv");
    return res.send(csv);
  } catch (error) {
    console.error("Error in getSalesWithHierarchyCSV:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// FInal apis
exports.getSalesReportForUser = async (req, res) => {
  try {
    let { code } = req.user;
    let { start_date, end_date, filter_type, report_type, subordinate_codes } = req.body;
    filter_type = filter_type || "value";
    report_type = report_type || "segment";

    if (!start_date || !end_date || !code) {
      return res.status(400).json({ success: false, message: "Start date, end date, and code are required." });
    }

    if (!["segment", "channel"].includes(report_type)) {
      return res.status(400).json({ success: false, message: "Invalid report_type. Choose 'segment' or 'channel'." });
    }

    // ✅ Inclusive, metrics-style date handling
    const startDate = new Date(start_date);
    startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(end_date);
    endDate.setUTCHours(23, 59, 59, 999);

    const lmtdStartDate = new Date(startDate);
    const lmtdEndDate = new Date(endDate);
    lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
    lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);
    lmtdEndDate.setUTCHours(23, 59, 59, 999);
    if (lmtdEndDate.getMonth() === endDate.getMonth()) lmtdEndDate.setDate(0);

    const actor = await ActorCode.findOne({ code });
    if (!actor)
      return res.status(404).json({ success: false, message: "Actor not found for the provided code." });

    const { role, position } = actor;
    let dealerCodes = [];

    // 🔹 Hierarchy & subordinate logic unchanged
    if (subordinate_codes && subordinate_codes.length > 0) {
      const hierarchyConfig = await ActorTypesHierarchy.findOne({ name: "default_sales_flow" });
      if (!hierarchyConfig || !Array.isArray(hierarchyConfig.hierarchy)) {
        return res.status(500).json({ success: false, message: "Hierarchy config not found or invalid." });
      }

      const hierarchyPositions = hierarchyConfig.hierarchy.filter((pos) => pos !== "dealer");
      const orFilters = hierarchyPositions.map((pos) => ({ [pos]: { $in: subordinate_codes } }));
      const hierarchyEntries = await HierarchyEntries.find({ hierarchy_name: "default_sales_flow", $or: orFilters });

      const dealersFromHierarchy = hierarchyEntries.map((entry) => entry.dealer);

      const directDealers = await ActorCode.find({ code: { $in: subordinate_codes }, position: "dealer" }).distinct("code");

      const dealerCategories = await User.find({ role: "dealer", labels: { $in: subordinate_codes } }, { code: 1 }).distinct("code");
      const dealerTown = await User.find({ role: "dealer", town: { $in: subordinate_codes } }, { code: 1 }).distinct("code");
      const dealerDistrict = await User.find({ role: "dealer", district: { $in: subordinate_codes } }, { code: 1 }).distinct("code");
      const dealerTaluka = await User.find({ role: "dealer", taluka: { $in: subordinate_codes } }, { code: 1 }).distinct("code");

      dealerCodes = [...new Set([...dealersFromHierarchy, ...directDealers, ...dealerCategories, ...dealerTown, ...dealerDistrict, ...dealerTaluka])];
    } else {
      if (["admin", "super_admin"].includes(role)) {
        const hierarchyConfig = await ActorTypesHierarchy.findOne({ name: "default_sales_flow" });
        if (!hierarchyConfig || !Array.isArray(hierarchyConfig.hierarchy)) {
          return res.status(500).json({ success: false, message: "Hierarchy config not found or invalid." });
        }

        const hierarchyFields = hierarchyConfig.hierarchy;
        const orFilters = hierarchyFields.map((field) => ({ [field]: { $exists: true } }));

        const [hierarchyDealers, salesDealers, actorDealers, userDealers] = await Promise.all([
          HierarchyEntries.find({ hierarchy_name: "default_sales_flow", $or: orFilters }).distinct("dealer"),
          SalesData.distinct("buyer_code"),
          ActorCode.find({ position: "dealer" }).distinct("code"),
          User.find({ role: "dealer" }).distinct("code"),
        ]);

        dealerCodes = [...new Set([...hierarchyDealers, ...salesDealers, ...actorDealers, ...userDealers])];
      } else if (role === "employee" && position) {
        const hierarchyEntries = await HierarchyEntries.find({
          hierarchy_name: "default_sales_flow",
          [position]: code,
        });
        dealerCodes = hierarchyEntries.map((entry) => entry.dealer);
      } else {
        return res.status(403).json({ success: false, message: "Unauthorized role." });
      }
    }

    // 🔹 Build month/year range between start and end
    const getMonthYearRange = (start, end) => {
      const months = [];
      const current = new Date(start);
      current.setDate(1);
      while (current <= end) {
        months.push({ month: current.getMonth() + 1, year: current.getFullYear() });
        current.setMonth(current.getMonth() + 1);
      }
      return months;
    };
    const monthYearRange = getMonthYearRange(startDate, endDate);

    const months = [...new Set(monthYearRange.map((m) => m.month))];
    const years = [...new Set(monthYearRange.map((m) => m.year))];

    const productCategories = ["smart_phone", "tab", "wearable"];
    const selectedProductCategories = subordinate_codes
      ? subordinate_codes.filter((code) => productCategories.includes(code))
      : [];
    let allowedProductCodes = [];
    if (selectedProductCategories.length > 0) {
      const products = await Product.find({ product_category: { $in: selectedProductCategories } }, { product_code: 1 });
      allowedProductCodes = products.map((p) => p.product_code);
    }

    const entity = await Entity.findOne({ name: report_type === "segment" ? "segments" : "channels" });
    if (!entity)
      return res.status(400).json({ success: false, message: `No ${report_type} found in the database.` });

    const reportCategories = entity.value || [];
    console.log("Report categories: ", reportCategories);
    const targetValueMap = await getPriceBandWiseTargets({
      code,
      role,
      position,
      subordinate_codes,
      startDate,
      endDate,
      filter_type,
    });

    // ✅ Fast match first by month/year, then exact date
    const matchQuery = {
      sales_type: "Sell Out",
      month: { $in: months },
      year: { $in: years },
    };
    if (dealerCodes.length > 0) matchQuery.buyer_code = { $in: dealerCodes };
    if (allowedProductCodes.length > 0) matchQuery.product_code = { $in: allowedProductCodes };
    console.log("report mtd: ", startDate, endDate)

    console.log("Match query: ", matchQuery)

    const allSales = await SalesData.aggregate([
      { $match: matchQuery },
      { $match: { date: { $gte: startDate, $lte: endDate } } }, // ✅ precise date filter after month-year filter
      {
        $group: {
          _id: report_type === "segment" ? "$product_code" : "$channel",
          total: {
            $sum: {
              $toDouble: `$${
                filter_type === "value" ? "total_amount" : "quantity"
              }`,
            },
          },
        },
      },
    ]);

    console.log("Total sales count:", allSales.length);
    console.log("📊 First 5 of allSales:", allSales.slice(0, 5));


    // mtd console 

    // 🧮 Get overall MTD Sell Out total before segmentation
const mtdTotal = await SalesData.aggregate([
  { $match: matchQuery },
  { $match: { date: { $gte: startDate, $lte: endDate } } },
  {
    $group: {
      _id: null,
      total: {
        $sum: {
          $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}`,
        },
      },
    },
  },
]);

console.log("📊 Raw MTD Sell Out total:", mtdTotal[0]?.total || 0);


    // mtd console. 


    // ✅ Repeat for LMTD period
    const lmtdMonthYearRange = getMonthYearRange(lmtdStartDate, lmtdEndDate);
    const lmtdMonths = [...new Set(lmtdMonthYearRange.map((m) => m.month))];
    const lmtdYears = [...new Set(lmtdMonthYearRange.map((m) => m.year))];

    const lastMonthMatch = {
      sales_type: "Sell Out",
      month: { $in: lmtdMonths },
      year: { $in: lmtdYears },
    };
    if (dealerCodes.length > 0) lastMonthMatch.buyer_code = { $in: dealerCodes };
    if (allowedProductCodes.length > 0) lastMonthMatch.product_code = { $in: allowedProductCodes };

    const lastMonthSalesData = await SalesData.aggregate([
      { $match: lastMonthMatch },
      { $match: { date: { $gte: lmtdStartDate, $lte: lmtdEndDate } } },
      {
        $group: {
          _id: report_type === "segment" ? "$product_code" : "$channel",
          total: {
            $sum: {
              $toDouble: `$${
                filter_type === "value" ? "total_amount" : "quantity"
              }`,
            },
          },
        },
      },
    ]);

    const productMap = {};
    if (report_type === "segment") {
      const products = await Product.find(); // not { status: "active" }

      products.forEach((p) => (productMap[p.product_code] = p.segment));
    }
    console.log("📦 First 10 of productMap:", Object.entries(productMap).slice(0, 10));


    const salesMap = {};
    allSales.forEach((row) => {
      const key = report_type === "segment" ? productMap[row._id] : row._id;
      if (key) salesMap[key] = (salesMap[key] || 0) + row.total;

      if (!productMap[row._id]) console.warn("⚠️ Unmapped product:", row._id);
      
    });


console.log(`🧾 Total products processed: ${allSales.length}`);
console.log("📊 Final salesMap sample:", Object.entries(salesMap).slice(0, 10));


    console.log("🧭 Sample productMap pairs:", Object.entries(productMap).slice(0, 10));

    console.log("salesMap: ", salesMap);
    

    const lastMonthMap = {};
    lastMonthSalesData.forEach((row) => {
      const key = report_type === "segment" ? productMap[row._id] : row._id;
      if (key) lastMonthMap[key] = (lastMonthMap[key] || 0) + row.total;
    });

    let reportData = [];
    const todayDate = new Date().getDate();

    for (let category of reportCategories) {
      const mtdValue = salesMap[category] || 0;
      const lmtdValue = lastMonthMap[category] || 0;
      const targetValue = targetValueMap?.[category] || 0;
      const pending = targetValue - mtdValue;
      const ads = (mtdValue / todayDate).toFixed(2);
      const reqAds = ((pending > 0 ? pending : 0) / (30 - todayDate)).toFixed(2);
      const growth = lmtdValue !== 0 ? ((mtdValue - lmtdValue) / lmtdValue) * 100 : 0;

      console.log("MTD Value: ", mtdValue)

      reportData.push({
        "Segment/Channel": category,
        Target: targetValue,
        MTD: mtdValue,
        LMTD: lmtdValue,
        Pending: pending,
        ADS: ads,
        "Req. ADS": reqAds,
        "% Growth": growth.toFixed(2),
        FTD: 0,
        "% Contribution": 0,
      });
    }

    const totalSales = reportData.reduce((sum, row) => sum + row.MTD, 0);
    console.log("Total sales: ", totalSales);
    reportData = reportData.map((row) => ({
      ...row,
      "% Contribution": totalSales !== 0 ? ((row.MTD / totalSales) * 100).toFixed(2) : 0,
    }));

    // res console 

    console.log("📦 Final Sales Report Response:", JSON.stringify({
  headers: [
    "Segment/Channel",
    "Target",
    "MTD",
    "LMTD",
    "Pending",
    "ADS",
    "Req. ADS",
    "% Growth",
    "FTD",
    "% Contribution",
  ],
  data: reportData,
}, null, 2));

    // res console 

    res.status(200).json({
      headers: [
        "Segment/Channel",
        "Target",
        "MTD",
        "LMTD",
        "Pending",
        "ADS",
        "Req. ADS",
        "% Growth",
        "FTD",
        "% Contribution",
      ],
      data: reportData,
    });
  } catch (error) {
    console.error("Error generating sales report:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};





// exports.getSalesReportForUser = async (req, res) => {
//   try {
//     let { code } = req.user;
//     let { start_date, end_date, filter_type, report_type, subordinate_codes } =
//       req.body;
//     filter_type = filter_type || "value";
//     report_type = report_type || "segment";

//     if (!start_date || !end_date || !code) {
//       return res
//         .status(400)
//         .json({
//           success: false,
//           message: "Start date, end date, and code are required.",
//         });
//     }

//     if (!["segment", "channel"].includes(report_type)) {
//       return res
//         .status(400)
//         .json({
//           success: false,
//           message: "Invalid report_type. Choose 'segment' or 'channel'.",
//         });
//     }

//     const startDate = new Date(start_date);
//     startDate.setUTCHours(0, 0, 0, 0);

//     const endDate = new Date(end_date);
//     endDate.setUTCHours(0, 0, 0, 0);

//     const lmtdStartDate = new Date(startDate);
//     const lmtdEndDate = new Date(endDate);
//     lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
//     lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

//     const actor = await ActorCode.findOne({ code });
//     if (!actor)
//       return res
//         .status(404)
//         .json({
//           success: false,
//           message: "Actor not found for the provided code.",
//         });

//     const { role, position } = actor;
//     let dealerCodes = [];

//     if (subordinate_codes && subordinate_codes.length > 0) {
//       const hierarchyConfig = await ActorTypesHierarchy.findOne({
//         name: "default_sales_flow",
//       });
//       if (!hierarchyConfig || !Array.isArray(hierarchyConfig.hierarchy)) {
//         return res
//           .status(500)
//           .json({
//             success: false,
//             message: "Hierarchy config not found or invalid.",
//           });
//       }

//       const hierarchyPositions = hierarchyConfig.hierarchy.filter(
//         (pos) => pos !== "dealer"
//       );
//       const orFilters = hierarchyPositions.map((pos) => ({
//         [pos]: { $in: subordinate_codes },
//       }));

//       const hierarchyEntries = await HierarchyEntries.find({
//         hierarchy_name: "default_sales_flow",
//         $or: orFilters,
//       });

//       const dealersFromHierarchy = hierarchyEntries.map(
//         (entry) => entry.dealer
//       );

//       const directDealers = await ActorCode.find({
//         code: { $in: subordinate_codes },
//         position: "dealer",
//       }).distinct("code");

//       const dealerCategories = await User.find(
//         { role: "dealer", labels: { $in: subordinate_codes } },
//         { code: 1 }
//       ).distinct("code");

//       const dealerTown = await User.find(
//         { role: "dealer", town: { $in: subordinate_codes } },
//         { code: 1 }
//       ).distinct("code");

//       const dealerDistrict = await User.find(
//         { role: "dealer", district: { $in: subordinate_codes } },
//         { code: 1 }
//       ).distinct("code");

//       const dealerTaluka = await User.find(
//         { role: "dealer", taluka: { $in: subordinate_codes } },
//         { code: 1 }
//       ).distinct("code");

//       dealerCodes = [
//         ...new Set([
//           ...dealersFromHierarchy,
//           ...directDealers,
//           ...dealerCategories,
//           ...dealerTown,
//           ...dealerDistrict,
//           ...dealerTaluka,
//         ]),
//       ];
//     } else {
//       if (["admin", "mdd", "super_admin"].includes(role)) {
//         const hierarchyEntries = await HierarchyEntries.find({
//           hierarchy_name: "default_sales_flow",
//         });
//         dealerCodes = [
//           ...new Set(hierarchyEntries.map((entry) => entry.dealer)),
//         ];
//       } else if (role === "employee" && position) {
//         const hierarchyEntries = await HierarchyEntries.find({
//           hierarchy_name: "default_sales_flow",
//           [position]: code,
//         });
//         dealerCodes = hierarchyEntries.map((entry) => entry.dealer);
//       } else {
//         return res
//           .status(403)
//           .json({ success: false, message: "Unauthorized role." });
//       }
//     }

//     // Check for product categories in subordinate_codes
//     const productCategories = ["smart_phone", "tab", "wearable"];
//     const selectedProductCategories = subordinate_codes
//       ? subordinate_codes.filter((code) => productCategories.includes(code))
//       : [];
//     let allowedProductCodes = [];
//     if (selectedProductCategories.length > 0) {
//       const products = await Product.find(
//         { product_category: { $in: selectedProductCategories } },
//         { product_code: 1 }
//       );
//       allowedProductCodes = products.map((p) => p.product_code);
//     }

//     const entity = await Entity.findOne({
//       name: report_type === "segment" ? "segments" : "channels",
//     });
//     if (!entity)
//       return res
//         .status(400)
//         .json({
//           success: false,
//           message: `No ${report_type} found in the database.`,
//         });

//     const reportCategories = entity.value || [];
//     const targetValueMap = await getPriceBandWiseTargets({
//       code,
//       role,
//       position,
//       subordinate_codes,
//       startDate,
//       endDate,
//       filter_type, 
//     });

//     console.log("tgt: ", targetValueMap)
    

//     const matchQuery = {
//       sales_type: "Sell Out",
//       date: { $gte: startDate, $lte: endDate },
//     };
//     if (dealerCodes.length > 0) matchQuery.buyer_code = { $in: dealerCodes };
//     if (allowedProductCodes.length > 0)
//       matchQuery.product_code = { $in: allowedProductCodes };

//     const salesData = await SalesData.aggregate([
//       { $match: matchQuery },
//       {
//         $group: {
//           _id: report_type === "segment" ? "$product_code" : "$channel",
//           total: {
//             $sum: {
//               $toDouble: `$${
//                 filter_type === "value" ? "total_amount" : "quantity"
//               }`,
//             },
//           },
//           dateArray: { $push: "$date" },
//         },
//       },
//     ]);

//     const lastMonthMatch = {
//       sales_type: "Sell Out",
//       date: { $gte: lmtdStartDate, $lte: lmtdEndDate },
//     };
//     if (dealerCodes.length > 0)
//       lastMonthMatch.buyer_code = { $in: dealerCodes };
//     if (allowedProductCodes.length > 0)
//       lastMonthMatch.product_code = { $in: allowedProductCodes };

//     const lastMonthSalesData = await SalesData.aggregate([
//       { $match: lastMonthMatch },
//       {
//         $group: {
//           _id: report_type === "segment" ? "$product_code" : "$channel",
//           total: {
//             $sum: {
//               $toDouble: `$${
//                 filter_type === "value" ? "total_amount" : "quantity"
//               }`,
//             },
//           },
//         },
//       },
//     ]);

//     const productMap = {};
//     if (report_type === "segment") {
//       const products = await Product.find({ status: "active" });
//       products.forEach((p) => (productMap[p.product_code] = p.segment));
//     }

//     const salesMap = {};
//     salesData.forEach((row) => {
//       const key = report_type === "segment" ? productMap[row._id] : row._id;
//       if (key) salesMap[key] = (salesMap[key] || 0) + row.total;
//     });

//     const lastMonthMap = {};
//     lastMonthSalesData.forEach((row) => {
//       const key = report_type === "segment" ? productMap[row._id] : row._id;
//       if (key) lastMonthMap[key] = (lastMonthMap[key] || 0) + row.total;
//     });

//     let reportData = [];
//     const todayDate = new Date().getDate();

//     for (let category of reportCategories) {
//       const mtdValue = salesMap[category] || 0;
//       const lmtdValue = lastMonthMap[category] || 0;
//       const targetValue = targetValueMap?.[category] || 0;
//       const pending = targetValue - mtdValue;
//       const ads = (mtdValue / todayDate).toFixed(2);
//       const reqAds = ((pending > 0 ? pending : 0) / (30 - todayDate)).toFixed(
//         2
//       );
//       const growth =
//         lmtdValue !== 0 ? ((mtdValue - lmtdValue) / lmtdValue) * 100 : 0;
//       const ftd = 0;

//       reportData.push({
//         "Segment/Channel": category,
//         Target: targetValue,
//         MTD: mtdValue,
//         LMTD: lmtdValue,
//         Pending: pending,
//         ADS: ads,
//         "Req. ADS": reqAds,
//         "% Growth": growth.toFixed(2),
//         FTD: ftd,
//         "% Contribution": 0,
//       });
//     }

//     const totalSales = reportData.reduce((sum, row) => sum + row.MTD, 0);
//     reportData = reportData.map((row) => ({
//       ...row,
//       "% Contribution":
//         totalSales !== 0 ? ((row.MTD / totalSales) * 100).toFixed(2) : 0,
//     }));

//     const headers = [
//       "Segment/Channel",
//       "Target",
//       "MTD",
//       "LMTD",
//       "Pending",
//       "ADS",
//       "Req. ADS",
//       "% Growth",
//       "FTD",
//       "% Contribution",
//     ];
//     res.status(200).json({ headers, data: reportData });
//   } catch (error) {
//     console.error("Error generating sales report:", error);
//     res.status(500).json({ success: false, message: "Internal server error" });
//   }
// };

exports.getDashboardSalesMetricsForUser = async (req, res) => {
  try {
    console.log("hui")
    let { code } = req.user;
    let { filter_type, start_date, end_date, subordinate_codes, product_categories } = req.body;
    console.log(
      "Filters: ",
      filter_type,
      start_date,
      end_date,
      subordinate_codes,
      product_categories,
      code
    );
    filter_type = filter_type || "value"; // Default to 'value'

    if (!code || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: "Code, start_date, and end_date are required.",
      });
    }

    console.log("SUBSSS: ", subordinate_codes);

    const startDate = new Date(start_date);
    startDate.setUTCHours(0, 0, 0, 0);

    const endDate = new Date(end_date);
    endDate.setUTCHours(0, 0, 0, 0);

    const actor = await ActorCode.findOne({ code });
    if (!actor) {
      return res.status(404).json({
        success: false,
        message: "Actor not found for the provided code!",
      });
    }

    const { role, position } = actor;

    console.log("Checking SPD/DMDD branch for:", subordinate_codes);

    // 🩵 Special SPD/DMDD logic from hierarchy stats
    if (
      Array.isArray(subordinate_codes) &&
      subordinate_codes.length === 1 &&
      (subordinate_codes[0] === "SPD" || subordinate_codes[0] === "DMDD")
    ) {
      const actorHierarchy = await ActorTypesHierarchy.findOne({ name: "default_sales_flow" });
      if (!actorHierarchy || !actorHierarchy.hierarchy) {
        return res.status(500).json({
          success: false,
          message: "Hierarchy data not found.",
        });
      }

      const hierarchyEntries = await HierarchyEntries.find({
        hierarchy_name: "default_sales_flow",
      });

      let filteredEntries = [];
      if (subordinate_codes.includes("SPD")) {
        filteredEntries = hierarchyEntries.filter((e) => e.mdd && e.mdd !== "4782323");
      } else if (subordinate_codes.includes("DMDD")) {
        filteredEntries = hierarchyEntries.filter((e) => e.mdd === "4782323");
      }

      const dealerCodes = [
        ...new Set(filteredEntries.map((e) => e.dealer).filter(Boolean)),
      ];

      console.log(`SPD/DMDD mode active (${subordinate_codes}): ${dealerCodes.length} dealers found.`);

      // === LMTD window
      const lmtdStartDate = new Date(startDate);
      lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
      const lmtdEndDate = new Date(endDate);
      lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);
      lmtdEndDate.setUTCHours(23, 59, 59, 999);
      console.log("lmtd division end date:", lmtdEndDate);

      // === Aggregation helpers
      const getTotal = async (salesType, dateRange) => {
        return await SalesData.aggregate([
          {
            $match: {
              buyer_code: { $in: dealerCodes },
              sales_type: salesType,
              date: { $gte: dateRange.start, $lte: dateRange.end },
            },
          },
          {
            $group: {
              _id: null,
              total: {
                $sum: {
                  $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}`,
                },
              },
            },
          },
        ]);
      };

      const getSellinTotal = async (salesTypes, dateRange) => {
        return await SalesData.aggregate([
          {
            $match: {
              buyer_code: { $in: dealerCodes },
              sales_type: { $in: salesTypes },
              date: { $gte: dateRange.start, $lte: dateRange.end },
            },
          },
          {
            $group: {
              _id: null,
              total: {
                $sum: {
                  $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}`,
                },
              },
            },
          },
        ]);
      };

      // === Compute metrics
      const mtdSellOut = await getTotal("Sell Out", { start: startDate, end: endDate });
      const lmtdSellOut = await getTotal("Sell Out", { start: lmtdStartDate, end: lmtdEndDate });

      const mtdSellIn = await getSellinTotal(["Sell In", "Sell Thru2"], {
        start: startDate,
        end: endDate,
      });
      const lmtdSellIn = await getSellinTotal(["Sell In", "Sell Thru2"], {
        start: lmtdStartDate,
        end: lmtdEndDate,
      });

      const calcGrowth = (a, b) => (b !== 0 ? ((a - b) / b) * 100 : 0);

      const response = {
        lmtd_sell_out: lmtdSellOut[0]?.total || 0,
        mtd_sell_out: mtdSellOut[0]?.total || 0,
        lmtd_sell_in: lmtdSellIn[0]?.total || 0,
        mtd_sell_in: mtdSellIn[0]?.total || 0,
        sell_out_growth: calcGrowth(mtdSellOut[0]?.total || 0, lmtdSellOut[0]?.total || 0).toFixed(2),
        sell_in_growth: calcGrowth(mtdSellIn[0]?.total || 0, lmtdSellIn[0]?.total || 0).toFixed(2),
      };

      console.log("Returning SPD/DMDD response: ", response);
      return res.status(200).json({ success: true, data: response });
    }

    // 🧩 Continue with normal logic for everyone else (unchanged)
    const selectedProductCategories = Array.isArray(product_categories)
      ? product_categories
      : [];
    const hasProductCategories = selectedProductCategories.length > 0;

    const dealerFilters = subordinate_codes || [];
    let dealerCodes = [];

    if (dealerFilters.length > 0) {
      const hierarchyConfig = await ActorTypesHierarchy.findOne({
        name: "default_sales_flow",
      });
      if (!hierarchyConfig || !Array.isArray(hierarchyConfig.hierarchy)) {
        return res.status(500).json({
          success: false,
          message: "Hierarchy config not found or invalid.",
        });
      }

      // ✅ NEW LOGIC — Use only the last subordinate code to narrow drill-down
      const activeCode = dealerFilters[dealerFilters.length - 1];
      let activeField = null;

      const sampleEntry = await HierarchyEntries.findOne({
        hierarchy_name: "default_sales_flow",
        $or: [
          { smd: activeCode },
          { asm: activeCode },
          { mdd: activeCode },
          { tse: activeCode },
          { dealer: activeCode },
        ],
      });

      if (sampleEntry) {
        for (const level of hierarchyConfig.hierarchy) {
          if (sampleEntry[level] === activeCode) {
            activeField = level;
            break;
          }
        }
      }

      activeField = activeField || hierarchyConfig.hierarchy[Math.min(dealerFilters.length - 1, hierarchyConfig.hierarchy.length - 1)];

      const hierarchyEntries = await HierarchyEntries.find({
        hierarchy_name: "default_sales_flow",
        [activeField]: activeCode,
      });

      const dealersFromHierarchy = hierarchyEntries
        .filter((entry) => entry.dealer)
        .map((entry) => entry.dealer);

      const directDealers = await ActorCode.find({
        code: { $in: dealerFilters },
        position: "dealer",
      }).distinct("code");

      const dealerCategories = await User.find(
        { role: "dealer", labels: { $in: dealerFilters } },
        { code: 1 }
      ).distinct("code");

      const dealerTown = await User.find(
        { role: "dealer", town: { $in: dealerFilters } },
        { code: 1 }
      ).distinct("code");

      const dealerDistrict = await User.find(
        { role: "dealer", district: { $in: dealerFilters } },
        { code: 1 }
      ).distinct("code");

      const dealerTaluka = await User.find(
        { role: "dealer", taluka: { $in: dealerFilters } },
        { code: 1 }
      ).distinct("code");

      dealerCodes = [
        ...new Set([
          ...dealersFromHierarchy,
          ...directDealers,
          ...dealerCategories,
          ...dealerTown,
          ...dealerDistrict,
          ...dealerTaluka,
        ]),
      ];

      console.log(`Active field: ${activeField}, code: ${activeCode}, dealer count: ${dealerCodes.length}`);
    } else {
      if (["admin", "super_admin"].includes(role)) {
        if (dealerFilters.length === 0) {
          console.log("ADMIN BYPASS MODE: No dealer filters, returning all sales data dealers");
          dealerCodes = [];
        } else {
          console.log("Admin drill-down detected, preserving dealer filters:", dealerCodes.length);
        }
      } else if (role === "employee" && position) {
        const hierarchyEntries = await HierarchyEntries.find({
          hierarchy_name: "default_sales_flow",
          [position]: code,
        });

        dealerCodes = hierarchyEntries
          .filter((entry) => entry.dealer)
          .map((entry) => entry.dealer);
      } else {
        return res.status(403).json({ success: false, message: "Unauthorized role." });
      }
    }

    console.log("No. of dealers: ", dealerCodes.length);

    let lmtdStartDate = new Date(startDate);
    lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);

    let lmtdEndDate = new Date(endDate);
    lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

    if (lmtdEndDate.getMonth() === endDate.getMonth()) {
      lmtdEndDate.setDate(0);
    }
    lmtdEndDate.setUTCHours(23, 59, 59, 999);

    let baseQuery = {};
    if (["admin", "super_admin"].includes(role) && dealerFilters.length === 0) {
      baseQuery = {};
    } else {
      baseQuery =
        dealerCodes.length > 0
          ? { buyer_code: { $in: dealerCodes } }
          : { buyer_code: { $in: [] } };
    }

    const getTotal = async (salesType, dateRange) => {
      if (hasProductCategories) {
        const salesData = await SalesData.find(
          {
            ...baseQuery,
            sales_type: salesType,
            date: { $gte: dateRange.start, $lte: dateRange.end },
          },
          { product_category: 1, total_amount: 1, quantity: 1 }
        );

        if (salesData.length === 0) return [{ total: 0 }];

        const normalize = (str = "") => str.toLowerCase().replace(/[_\s]+/g, "");
        const normalizedSelected = selectedProductCategories.map(normalize);

        const filteredSalesData = salesData.filter((sale) => {
          const category = sale.product_category || "";
          return normalizedSelected.includes(normalize(category));
        });

        const total = filteredSalesData.reduce((sum, sale) => {
          const value =
            filter_type === "value"
              ? parseFloat(sale.total_amount)
              : parseFloat(sale.quantity);
          return sum + (isNaN(value) ? 0 : value);
        }, 0);

        return [{ total }];
      } else {
        return await SalesData.aggregate([
          {
            $match: {
              ...baseQuery,
              sales_type: salesType,
              date: { $gte: dateRange.start, $lte: dateRange.end },
            },
          },
          {
            $group: {
              _id: null,
              total: {
                $sum: {
                  $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}`,
                },
              },
            },
          },
        ]);
      }
    };

    const getSellinTotal = async (salesType, dateRange) => {
      if (hasProductCategories) {
        const salesData = await SalesData.find(
          {
            ...baseQuery,
            sales_type: { $in: salesType },
            date: { $gte: dateRange.start, $lte: dateRange.end },
          },
          { product_category: 1, total_amount: 1, quantity: 1 }
        );

        if (salesData.length === 0) return [{ total: 0 }];

        const normalize = (str = "") => str.toLowerCase().replace(/[_\s]+/g, "");
        const normalizedSelected = selectedProductCategories.map(normalize);

        const filteredSalesData = salesData.filter((sale) => {
          const category = sale.product_category || "";
          return normalizedSelected.includes(normalize(category));
        });

        const total = filteredSalesData.reduce((sum, sale) => {
          const value =
            filter_type === "value"
              ? parseFloat(sale.total_amount)
              : parseFloat(sale.quantity);
          return sum + (isNaN(value) ? 0 : value);
        }, 0);

        return [{ total }];
      } else {
        return await SalesData.aggregate([
          {
            $match: {
              ...baseQuery,
              sales_type: { $in: salesType },
              date: { $gte: dateRange.start, $lte: dateRange.end },
            },
          },
          {
            $group: {
              _id: null,
              total: {
                $sum: {
                  $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}`,
                },
              },
            },
          },
        ]);
      }
    };

    const mtdSellOut = await getTotal("Sell Out", { start: startDate, end: endDate });
    const lmtdSellOut = await getTotal("Sell Out", { start: lmtdStartDate, end: lmtdEndDate });

    const mtdSellIn = await getSellinTotal(["Sell In", "Sell Thru2"], {
      start: startDate,
      end: endDate,
    });
    // console.log("MTD SELL IN Start end: ", startDate, endDate);
    const lmtdSellIn = await getSellinTotal(["Sell In", "Sell Thru2"], {
      start: lmtdStartDate,
      end: lmtdEndDate,
    });

    const calculateGrowth = (current, last) =>
      last !== 0 ? ((current - last) / last) * 100 : 0;

    const response = {
      lmtd_sell_out: lmtdSellOut.length > 0 ? lmtdSellOut[0].total : 0,
      mtd_sell_out: mtdSellOut.length > 0 ? mtdSellOut[0].total : 0,
      lmtd_sell_in: lmtdSellIn.length > 0 ? lmtdSellIn[0].total : 0,
      mtd_sell_in: mtdSellIn.length > 0 ? mtdSellIn[0].total : 0,
      sell_out_growth: calculateGrowth(
        mtdSellOut.length > 0 ? mtdSellOut[0].total : 0,
        lmtdSellOut.length > 0 ? lmtdSellOut[0].total : 0
      ).toFixed(2),
      sell_in_growth: calculateGrowth(
        mtdSellIn.length > 0 ? mtdSellIn[0].total : 0,
        lmtdSellIn.length > 0 ? lmtdSellIn[0].total : 0
      ).toFixed(2),
      selected_product_categories: selectedProductCategories,
    };
    // console.log("RESPUNSE: ", response)

    res.status(200).json({ success: true, data: response });
    // console.log("Res: ", response);
  } catch (error) {
    console.error("Error in getDashboardSalesMetrics:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};



// exports.getDashboardSalesMetricsForUser = async (req, res) => {
//   try {
//     let { code } = req.user;
//     let { filter_type, start_date, end_date, subordinate_codes, product_categories } = req.body;
//     console.log(
//       "Filters: ",
//       filter_type,
//       start_date,
//       end_date,
//       subordinate_codes,
//       product_categories,
//       code
//     );
//     filter_type = filter_type || "value"; // Default to 'value'

//     if (!code || !start_date || !end_date) {
//       return res.status(400).json({
//         success: false,
//         message: "Code, start_date, and end_date are required.",
//       });
//     }

//     console.log("SUBSSS: ", subordinate_codes);

//     const startDate = new Date(start_date);
//     startDate.setUTCHours(0, 0, 0, 0);

//     const endDate = new Date(end_date);
//     endDate.setUTCHours(0, 0, 0, 0);

//     const actor = await ActorCode.findOne({ code });
//     if (!actor) {
//       return res.status(404).json({
//         success: false,
//         message: "Actor not found for the provided code!",
//       });
//     }

//     const { role, position } = actor;

//     // 🩵 Special SPD/DMDD logic from hierarchy stats
//     if (subordinate_codes?.includes("SPD") || subordinate_codes?.includes("DMDD")) {
//       const actorHierarchy = await ActorTypesHierarchy.findOne({ name: "default_sales_flow" });
//       if (!actorHierarchy || !actorHierarchy.hierarchy) {
//         return res.status(500).json({
//           success: false,
//           message: "Hierarchy data not found.",
//         });
//       }

//       const hierarchyEntries = await HierarchyEntries.find({
//         hierarchy_name: "default_sales_flow",
//       });

//       let filteredEntries = [];
//       if (subordinate_codes.includes("SPD")) {
//         filteredEntries = hierarchyEntries.filter((e) => e.mdd && e.mdd !== "4782323");
//       } else if (subordinate_codes.includes("DMDD")) {
//         filteredEntries = hierarchyEntries.filter((e) => e.mdd === "4782323");
//       }

//       const dealerCodes = [
//         ...new Set(filteredEntries.map((e) => e.dealer).filter(Boolean)),
//       ];

//       console.log(`SPD/DMDD mode active (${subordinate_codes}): ${dealerCodes.length} dealers found.`);

//       // === LMTD window
//       const lmtdStartDate = new Date(startDate);
//       lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
//       const lmtdEndDate = new Date(endDate);
//       lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);
//       lmtdEndDate.setUTCHours(23, 59, 59, 999);

//       // === Aggregation helpers
//       const getTotal = async (salesType, dateRange) => {
//         return await SalesData.aggregate([
//           {
//             $match: {
//               buyer_code: { $in: dealerCodes },
//               sales_type: salesType,
//               date: { $gte: dateRange.start, $lte: dateRange.end },
//             },
//           },
//           {
//             $group: {
//               _id: null,
//               total: {
//                 $sum: {
//                   $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}`,
//                 },
//               },
//             },
//           },
//         ]);
//       };

//       const getSellinTotal = async (salesTypes, dateRange) => {
//         return await SalesData.aggregate([
//           {
//             $match: {
//               buyer_code: { $in: dealerCodes },
//               sales_type: { $in: salesTypes },
//               date: { $gte: dateRange.start, $lte: dateRange.end },
//             },
//           },
//           {
//             $group: {
//               _id: null,
//               total: {
//                 $sum: {
//                   $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}`,
//                 },
//               },
//             },
//           },
//         ]);
//       };

//       // === Compute metrics
//       const mtdSellOut = await getTotal("Sell Out", { start: startDate, end: endDate });
//       const lmtdSellOut = await getTotal("Sell Out", { start: lmtdStartDate, end: lmtdEndDate });

//       const mtdSellIn = await getSellinTotal(["Sell In", "Sell Thru2"], {
//         start: startDate,
//         end: endDate,
//       });
//       const lmtdSellIn = await getSellinTotal(["Sell In", "Sell Thru2"], {
//         start: lmtdStartDate,
//         end: lmtdEndDate,
//       });

//       const calcGrowth = (a, b) => (b !== 0 ? ((a - b) / b) * 100 : 0);

//       const response = {
//         lmtd_sell_out: lmtdSellOut[0]?.total || 0,
//         mtd_sell_out: mtdSellOut[0]?.total || 0,
//         lmtd_sell_in: lmtdSellIn[0]?.total || 0,
//         mtd_sell_in: mtdSellIn[0]?.total || 0,
//         sell_out_growth: calcGrowth(mtdSellOut[0]?.total || 0, lmtdSellOut[0]?.total || 0).toFixed(2),
//         sell_in_growth: calcGrowth(mtdSellIn[0]?.total || 0, lmtdSellIn[0]?.total || 0).toFixed(2),
//       };

//       return res.status(200).json({ success: true, data: response });
//     }

//     // 🧩 Continue with normal logic for everyone else (unchanged)
//     const selectedProductCategories = Array.isArray(product_categories)
//       ? product_categories
//       : [];
//     const hasProductCategories = selectedProductCategories.length > 0;
//     const dealerFilters = subordinate_codes || [];
//     let dealerCodes = [];

//     if (dealerFilters.length > 0) {
//       const hierarchyConfig = await ActorTypesHierarchy.findOne({
//         name: "default_sales_flow",
//       });
//       if (!hierarchyConfig || !Array.isArray(hierarchyConfig.hierarchy)) {
//         return res.status(500).json({
//           success: false,
//           message: "Hierarchy config not found or invalid.",
//         });
//       }

//       const dealerCategories = await User.find(
//         { role: "dealer", labels: { $in: dealerFilters } },
//         { code: 1 }
//       ).distinct("code");

//       const dealerTown = await User.find(
//         { role: "dealer", town: { $in: dealerFilters } },
//         { code: 1 }
//       ).distinct("code");

//       const dealerDistrict = await User.find(
//         { role: "dealer", district: { $in: dealerFilters } },
//         { code: 1 }
//       ).distinct("code");

//       const dealerTaluka = await User.find(
//         { role: "dealer", taluka: { $in: dealerFilters } },
//         { code: 1 }
//       ).distinct("code");

//       const hierarchyPositions = hierarchyConfig.hierarchy.filter(
//         (pos) => pos !== "dealer"
//       );
//       const orFilters = hierarchyPositions.map((pos) => ({
//         [pos]: { $in: dealerFilters },
//       }));

//       const hierarchyEntries = await HierarchyEntries.find({
//         hierarchy_name: "default_sales_flow",
//         $or: orFilters,
//       });

//       const dealersFromHierarchy = hierarchyEntries
//         .filter((entry) => entry.dealer)
//         .map((entry) => entry.dealer);

//       const directDealers = await ActorCode.find({
//         code: { $in: dealerFilters },
//         position: "dealer",
//       }).distinct("code");

//       dealerCodes = [
//         ...new Set([
//           ...dealersFromHierarchy,
//           ...directDealers,
//           ...dealerCategories,
//           ...dealerTown,
//           ...dealerDistrict,
//           ...dealerTaluka,
//         ]),
//       ];

//       console.log("dealer count: ", dealerCodes.length);
//     } else {
//       if (["admin", "super_admin"].includes(role)) {
//         console.log("ADMIN BYPASS MODE: No dealer filters, returning all sales data dealers");
//         dealerCodes = [];
//       } else if (role === "employee" && position) {
//         const hierarchyEntries = await HierarchyEntries.find({
//           hierarchy_name: "default_sales_flow",
//           [position]: code,
//         });

//         dealerCodes = hierarchyEntries
//           .filter((entry) => entry.dealer)
//           .map((entry) => entry.dealer);
//       } else {
//         return res
//           .status(403)
//           .json({ success: false, message: "Unauthorized role." });
//       }
//     }

//     console.log("No. of dealers: ", dealerCodes.length);

//     let lmtdStartDate = new Date(startDate);
//     lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);

//     let lmtdEndDate = new Date(endDate);
//     lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

//     if (lmtdEndDate.getMonth() === endDate.getMonth()) {
//       lmtdEndDate.setDate(0);
//     }
//     lmtdEndDate.setUTCHours(23, 59, 59, 999);

//     let baseQuery = {};
//     if (["admin", "super_admin"].includes(role) && dealerFilters.length === 0) {
//       baseQuery = {};
//     } else {
//       baseQuery =
//         dealerCodes.length > 0
//           ? { buyer_code: { $in: dealerCodes } }
//           : { buyer_code: { $in: [] } };
//     }

//     // ✅ Optimized version: Uses SalesData.product_category directly
//     const getTotal = async (salesType, dateRange) => {
//       if (hasProductCategories) {
//         const salesData = await SalesData.find(
//           {
//             ...baseQuery,
//             sales_type: salesType,
//             date: { $gte: dateRange.start, $lte: dateRange.end },
//           },
//           { product_category: 1, total_amount: 1, quantity: 1 }
//         );

//         if (salesData.length === 0) return [{ total: 0 }];

//         const normalize = (str = "") => str.toLowerCase().replace(/[_\s]+/g, "");
//         const normalizedSelected = selectedProductCategories.map(normalize);

//         const filteredSalesData = salesData.filter((sale) => {
//           const category = sale.product_category || "";
//           return normalizedSelected.includes(normalize(category));
//         });

//         const total = filteredSalesData.reduce((sum, sale) => {
//           const value =
//             filter_type === "value"
//               ? parseFloat(sale.total_amount)
//               : parseFloat(sale.quantity);
//           return sum + (isNaN(value) ? 0 : value);
//         }, 0);

//         return [{ total }];
//       } else {
//         return await SalesData.aggregate([
//           {
//             $match: {
//               ...baseQuery,
//               sales_type: salesType,
//               date: { $gte: dateRange.start, $lte: dateRange.end },
//             },
//           },
//           {
//             $group: {
//               _id: null,
//               total: {
//                 $sum: {
//                   $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}`,
//                 },
//               },
//             },
//           },
//         ]);
//       }
//     };

//     const getSellinTotal = async (salesType, dateRange) => {
//       if (hasProductCategories) {
//         const salesData = await SalesData.find(
//           {
//             ...baseQuery,
//             sales_type: { $in: salesType },
//             date: { $gte: dateRange.start, $lte: dateRange.end },
//           },
//           { product_category: 1, total_amount: 1, quantity: 1 }
//         );

//         if (salesData.length === 0) return [{ total: 0 }];

//         const normalize = (str = "") => str.toLowerCase().replace(/[_\s]+/g, "");
//         const normalizedSelected = selectedProductCategories.map(normalize);

//         const filteredSalesData = salesData.filter((sale) => {
//           const category = sale.product_category || "";
//           return normalizedSelected.includes(normalize(category));
//         });

//         const total = filteredSalesData.reduce((sum, sale) => {
//           const value =
//             filter_type === "value"
//               ? parseFloat(sale.total_amount)
//               : parseFloat(sale.quantity);
//           return sum + (isNaN(value) ? 0 : value);
//         }, 0);

//         return [{ total }];
//       } else {
//         return await SalesData.aggregate([
//           {
//             $match: {
//               ...baseQuery,
//               sales_type: { $in: salesType },
//               date: { $gte: dateRange.start, $lte: dateRange.end },
//             },
//           },
//           {
//             $group: {
//               _id: null,
//               total: {
//                 $sum: {
//                   $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}`,
//                 },
//               },
//             },
//           },
//         ]);
//       }
//     };

//     const mtdSellOut = await getTotal("Sell Out", { start: startDate, end: endDate });
//     const lmtdSellOut = await getTotal("Sell Out", { start: lmtdStartDate, end: lmtdEndDate });

//     const mtdSellIn = await getSellinTotal(["Sell In", "Sell Thru2"], {
//       start: startDate,
//       end: endDate,
//     });
//     const lmtdSellIn = await getSellinTotal(["Sell In", "Sell Thru2"], {
//       start: lmtdStartDate,
//       end: lmtdEndDate,
//     });

//     const calculateGrowth = (current, last) =>
//       last !== 0 ? ((current - last) / last) * 100 : 0;

//     const response = {
//       lmtd_sell_out: lmtdSellOut.length > 0 ? lmtdSellOut[0].total : 0,
//       mtd_sell_out: mtdSellOut.length > 0 ? mtdSellOut[0].total : 0,
//       lmtd_sell_in: lmtdSellIn.length > 0 ? lmtdSellIn[0].total : 0,
//       mtd_sell_in: mtdSellIn.length > 0 ? mtdSellIn[0].total : 0,
//       sell_out_growth: calculateGrowth(
//         mtdSellOut.length > 0 ? mtdSellOut[0].total : 0,
//         lmtdSellOut.length > 0 ? lmtdSellOut[0].total : 0
//       ).toFixed(2),
//       sell_in_growth: calculateGrowth(
//         mtdSellIn.length > 0 ? mtdSellIn[0].total : 0,
//         lmtdSellIn.length > 0 ? lmtdSellIn[0].total : 0
//       ).toFixed(2),
//       selected_product_categories: selectedProductCategories,
//     };

//     res.status(200).json({ success: true, data: response });
//     console.log("Res: ", response);
//   } catch (error) {
//     console.error("Error in getDashboardSalesMetrics:", error);
//     res.status(500).json({ success: false, message: "Internal server error" });
//   }
// };


// exports.getDashboardSalesMetricsForUser = async (req, res) => {
//   try {
//     let { code } = req.user;
//     let { filter_type, start_date, end_date, subordinate_codes, product_categories } = req.body;
//     console.log(
//       "Filters: ",
//       filter_type,
//       start_date,
//       end_date,
//       subordinate_codes,
//       product_categories,
//       code
//     );
//     filter_type = filter_type || "value"; // Default to 'value'

//     if (!code || !start_date || !end_date) {
//       return res.status(400).json({
//         success: false,
//         message: "Code, start_date, and end_date are required.",
//       });
//     }

//     console.log("SUBSSS: ", subordinate_codes);

//     const startDate = new Date(start_date);
//     startDate.setUTCHours(0, 0, 0, 0);

//     const endDate = new Date(end_date);
//     endDate.setUTCHours(0, 0, 0, 0);

//     const actor = await ActorCode.findOne({ code });
//     if (!actor) {
//       return res.status(404).json({
//         success: false,
//         message: "Actor not found for the provided code!",
//       });
//     }

//     const { role, position } = actor;

//     // 🩵 Special SPD/DMDD logic from hierarchy stats
//     if (subordinate_codes?.includes("SPD") || subordinate_codes?.includes("DMDD")) {
//       const actorHierarchy = await ActorTypesHierarchy.findOne({ name: "default_sales_flow" });
//       if (!actorHierarchy || !actorHierarchy.hierarchy) {
//         return res.status(500).json({
//           success: false,
//           message: "Hierarchy data not found.",
//         });
//       }

//       const hierarchyEntries = await HierarchyEntries.find({
//         hierarchy_name: "default_sales_flow",
//       });

//       let filteredEntries = [];
//       if (subordinate_codes.includes("SPD")) {
//         filteredEntries = hierarchyEntries.filter((e) => e.mdd && e.mdd !== "4782323");
//       } else if (subordinate_codes.includes("DMDD")) {
//         filteredEntries = hierarchyEntries.filter((e) => e.mdd === "4782323");
//       }

//       const dealerCodes = [
//         ...new Set(filteredEntries.map((e) => e.dealer).filter(Boolean)),
//       ];

//       console.log(`SPD/DMDD mode active (${subordinate_codes}): ${dealerCodes.length} dealers found.`);

//       // === LMTD window
//       const lmtdStartDate = new Date(startDate);
//       lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
//       const lmtdEndDate = new Date(endDate);
//       lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);
//       lmtdEndDate.setUTCHours(23, 59, 59, 999);

//       // === Aggregation helpers
//       const getTotal = async (salesType, dateRange) => {
//         return await SalesData.aggregate([
//           {
//             $match: {
//               buyer_code: { $in: dealerCodes },
//               sales_type: salesType,
//               date: { $gte: dateRange.start, $lte: dateRange.end },
//             },
//           },
//           {
//             $group: {
//               _id: null,
//               total: {
//                 $sum: {
//                   $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}`,
//                 },
//               },
//             },
//           },
//         ]);
//       };

//       const getSellinTotal = async (salesTypes, dateRange) => {
//         return await SalesData.aggregate([
//           {
//             $match: {
//               buyer_code: { $in: dealerCodes },
//               sales_type: { $in: salesTypes },
//               date: { $gte: dateRange.start, $lte: dateRange.end },
//             },
//           },
//           {
//             $group: {
//               _id: null,
//               total: {
//                 $sum: {
//                   $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}`,
//                 },
//               },
//             },
//           },
//         ]);
//       };

//       // === Compute metrics
//       const mtdSellOut = await getTotal("Sell Out", { start: startDate, end: endDate });
//       const lmtdSellOut = await getTotal("Sell Out", { start: lmtdStartDate, end: lmtdEndDate });

//       const mtdSellIn = await getSellinTotal(["Sell In", "Sell Thru2"], {
//         start: startDate,
//         end: endDate,
//       });
//       const lmtdSellIn = await getSellinTotal(["Sell In", "Sell Thru2"], {
//         start: lmtdStartDate,
//         end: lmtdEndDate,
//       });

//       const calcGrowth = (a, b) => (b !== 0 ? ((a - b) / b) * 100 : 0);

//       const response = {
//         lmtd_sell_out: lmtdSellOut[0]?.total || 0,
//         mtd_sell_out: mtdSellOut[0]?.total || 0,
//         lmtd_sell_in: lmtdSellIn[0]?.total || 0,
//         mtd_sell_in: mtdSellIn[0]?.total || 0,
//         sell_out_growth: calcGrowth(mtdSellOut[0]?.total || 0, lmtdSellOut[0]?.total || 0).toFixed(2),
//         sell_in_growth: calcGrowth(mtdSellIn[0]?.total || 0, lmtdSellIn[0]?.total || 0).toFixed(2),
//       };

//       return res.status(200).json({ success: true, data: response });
//     }

//     // 🧩 Continue with normal logic for everyone else (unchanged)
//     const selectedProductCategories = Array.isArray(product_categories)
//       ? product_categories
//       : [];
//     const hasProductCategories = selectedProductCategories.length > 0;
//     const dealerFilters = subordinate_codes || [];
//     let dealerCodes = [];

//     if (dealerFilters.length > 0) {
//       const hierarchyConfig = await ActorTypesHierarchy.findOne({
//         name: "default_sales_flow",
//       });
//       if (!hierarchyConfig || !Array.isArray(hierarchyConfig.hierarchy)) {
//         return res.status(500).json({
//           success: false,
//           message: "Hierarchy config not found or invalid.",
//         });
//       }

//       const dealerCategories = await User.find(
//         { role: "dealer", labels: { $in: dealerFilters } },
//         { code: 1 }
//       ).distinct("code");

//       const dealerTown = await User.find(
//         { role: "dealer", town: { $in: dealerFilters } },
//         { code: 1 }
//       ).distinct("code");

//       const dealerDistrict = await User.find(
//         { role: "dealer", district: { $in: dealerFilters } },
//         { code: 1 }
//       ).distinct("code");

//       const dealerTaluka = await User.find(
//         { role: "dealer", taluka: { $in: dealerFilters } },
//         { code: 1 }
//       ).distinct("code");

//       const hierarchyPositions = hierarchyConfig.hierarchy.filter(
//         (pos) => pos !== "dealer"
//       );
//       const orFilters = hierarchyPositions.map((pos) => ({
//         [pos]: { $in: dealerFilters },
//       }));

//       const hierarchyEntries = await HierarchyEntries.find({
//         hierarchy_name: "default_sales_flow",
//         $or: orFilters,
//       });

//       const dealersFromHierarchy = hierarchyEntries
//         .filter((entry) => entry.dealer)
//         .map((entry) => entry.dealer);

//       const directDealers = await ActorCode.find({
//         code: { $in: dealerFilters },
//         position: "dealer",
//       }).distinct("code");

//       dealerCodes = [
//         ...new Set([
//           ...dealersFromHierarchy,
//           ...directDealers,
//           ...dealerCategories,
//           ...dealerTown,
//           ...dealerDistrict,
//           ...dealerTaluka,
//         ]),
//       ];

//       console.log("dealer count: ", dealerCodes.length);
//     } else {
//       if (["admin", "super_admin"].includes(role)) {
//         console.log("ADMIN BYPASS MODE: No dealer filters, returning all sales data dealers");
//         dealerCodes = [];
//       } else if (role === "employee" && position) {
//         const hierarchyEntries = await HierarchyEntries.find({
//           hierarchy_name: "default_sales_flow",
//           [position]: code,
//         });

//         dealerCodes = hierarchyEntries
//           .filter((entry) => entry.dealer)
//           .map((entry) => entry.dealer);
//       } else {
//         return res
//           .status(403)
//           .json({ success: false, message: "Unauthorized role." });
//       }
//     }

//     console.log("No. of dealers: ", dealerCodes.length);

//     let lmtdStartDate = new Date(startDate);
//     lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);

//     let lmtdEndDate = new Date(endDate);
//     lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

//     if (lmtdEndDate.getMonth() === endDate.getMonth()) {
//       lmtdEndDate.setDate(0);
//     }
//     lmtdEndDate.setUTCHours(23, 59, 59, 999);

//     let baseQuery = {};
//     if (["admin", "super_admin"].includes(role) && dealerFilters.length === 0) {
//       baseQuery = {};
//     } else {
//       baseQuery =
//         dealerCodes.length > 0
//           ? { buyer_code: { $in: dealerCodes } }
//           : { buyer_code: { $in: [] } };
//     }

//     const getTotal = async (salesType, dateRange) => {
//       if (hasProductCategories) {
//         const salesData = await SalesData.find(
//           {
//             ...baseQuery,
//             sales_type: salesType,
//             date: { $gte: dateRange.start, $lte: dateRange.end },
//           },
//           { product_code: 1, total_amount: 1, quantity: 1 }
//         );

//         if (salesData.length === 0) return [{ total: 0 }];

//         const productCodes = [...new Set(salesData.map((s) => s.product_code))];
//         const productDocs = await Product.find(
//           { product_code: { $in: productCodes } },
//           { product_code: 1, product_category: 1, _id: 0 }
//         );

//         const productMap = Object.fromEntries(
//           productDocs.map((p) => [p.product_code, p.product_category || "Uncategorized"])
//         );

//         const normalize = (str = "") => str.toLowerCase().replace(/[_\s]+/g, "");
//         const normalizedSelected = selectedProductCategories.map(normalize);

//         console.log("Normalized: ", normalizedSelected)

//         const filteredSalesData = salesData.filter((sale) => {
//           const category = productMap[sale.product_code] || "";
//           return normalizedSelected.includes(normalize(category));
//         });


//         // const filteredSalesData = salesData.filter((sale) => {
//         //   const category = productMap[sale.product_code];
//         //   return selectedProductCategories.includes(category);
//         // });

//         const total = filteredSalesData.reduce((sum, sale) => {
//           const value =
//             filter_type === "value"
//               ? parseFloat(sale.total_amount)
//               : parseFloat(sale.quantity);
//           return sum + (isNaN(value) ? 0 : value);
//         }, 0);

//         return [{ total }];
//       } else {
//         return await SalesData.aggregate([
//           {
//             $match: {
//               ...baseQuery,
//               sales_type: salesType,
//               date: { $gte: dateRange.start, $lte: dateRange.end },
//             },
//           },
//           {
//             $group: {
//               _id: null,
//               total: {
//                 $sum: {
//                   $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}`,
//                 },
//               },
//             },
//           },
//         ]);
//       }
//     };

//     const getSellinTotal = async (salesType, dateRange) => {
//       if (hasProductCategories) {
//         const salesData = await SalesData.find(
//           {
//             ...baseQuery,
//             sales_type: { $in: salesType },
//             date: { $gte: dateRange.start, $lte: dateRange.end },
//           },
//           { product_code: 1, total_amount: 1, quantity: 1 }
//         );

//         if (salesData.length === 0) return [{ total: 0 }];

//         const productCodes = [...new Set(salesData.map((s) => s.product_code))];
//         const productDocs = await Product.find(
//           { product_code: { $in: productCodes } },
//           { product_code: 1, product_category: 1, _id: 0 }
//         );

//         const productMap = Object.fromEntries(
//           productDocs.map((p) => [p.product_code, p.product_category || "Uncategorized"])
//         );

//         const filteredSalesData = salesData.filter((sale) => {
//           const category = productMap[sale.product_code];
//           return selectedProductCategories.includes(category);
//         });

//         const total = filteredSalesData.reduce((sum, sale) => {
//           const value =
//             filter_type === "value"
//               ? parseFloat(sale.total_amount)
//               : parseFloat(sale.quantity);
//           return sum + (isNaN(value) ? 0 : value);
//         }, 0);

//         return [{ total }];
//       } else {
//         return await SalesData.aggregate([
//           {
//             $match: {
//               ...baseQuery,
//               sales_type: { $in: salesType },
//               date: { $gte: dateRange.start, $lte: dateRange.end },
//             },
//           },
//           {
//             $group: {
//               _id: null,
//               total: {
//                 $sum: {
//                   $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}`,
//                 },
//               },
//             },
//           },
//         ]);
//       }
//     };

//     const mtdSellOut = await getTotal("Sell Out", { start: startDate, end: endDate });
//     const lmtdSellOut = await getTotal("Sell Out", { start: lmtdStartDate, end: lmtdEndDate });

//     const mtdSellIn = await getSellinTotal(["Sell In", "Sell Thru2"], {
//       start: startDate,
//       end: endDate,
//     });
//     const lmtdSellIn = await getSellinTotal(["Sell In", "Sell Thru2"], {
//       start: lmtdStartDate,
//       end: lmtdEndDate,
//     });

//     const calculateGrowth = (current, last) =>
//       last !== 0 ? ((current - last) / last) * 100 : 0;

//     const response = {
//       lmtd_sell_out: lmtdSellOut.length > 0 ? lmtdSellOut[0].total : 0,
//       mtd_sell_out: mtdSellOut.length > 0 ? mtdSellOut[0].total : 0,
//       lmtd_sell_in: lmtdSellIn.length > 0 ? lmtdSellIn[0].total : 0,
//       mtd_sell_in: mtdSellIn.length > 0 ? mtdSellIn[0].total : 0,
//       sell_out_growth: calculateGrowth(
//         mtdSellOut.length > 0 ? mtdSellOut[0].total : 0,
//         lmtdSellOut.length > 0 ? lmtdSellOut[0].total : 0
//       ).toFixed(2),
//       sell_in_growth: calculateGrowth(
//         mtdSellIn.length > 0 ? mtdSellIn[0].total : 0,
//         lmtdSellIn.length > 0 ? lmtdSellIn[0].total : 0
//       ).toFixed(2),
//       selected_product_categories: selectedProductCategories,
//     };

//     res.status(200).json({ success: true, data: response });
//     console.log("Res: ", response);
//   } catch (error) {
//     console.error("Error in getDashboardSalesMetrics:", error);
//     res.status(500).json({ success: false, message: "Internal server error" });
//   }
// };



exports.getSalesReportProductWise = async (req, res) => {
  try {
    const { code } = req.user;
    let { start_date, end_date, filter_type, segment, subordinate_codes } = req.body;
    filter_type = filter_type || "value";

    // Validate required fields
    if (!start_date || !end_date || !code || !segment) {
      return res.status(400).json({ success: false, message: "Start date, end date, code, and segment are required." });
    }

    // Validate subordinate_codes is an array if provided
    if (subordinate_codes && !Array.isArray(subordinate_codes)) {
      return res.status(400).json({ success: false, message: "subordinate_codes must be an array." });
    }

    // Date handling
    const startDate = new Date(start_date);
    startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(end_date);
    endDate.setUTCHours(23, 59, 59, 999);
    const todayDate = new Date().getDate();

    // Validate actor
    const actor = await ActorCode.findOne({ code });
    if (!actor) {
      return res.status(404).json({ success: false, message: "Actor not found." });
    }

    const { role, position } = actor;
    let dealerCodes = [];

    // Check if subordinate_codes contains product categories
    const productCategories = ["smart_phone", "tab", "wearable"];
    const isProductCategoryFilter = subordinate_codes && subordinate_codes.length > 0 && 
      subordinate_codes.some(code => productCategories.includes(code));

    // Fetch dealer codes
    if (!isProductCategoryFilter && subordinate_codes && subordinate_codes.length > 0) {
      // Treat subordinate_codes as hierarchy codes
      const hierarchyConfig = await ActorTypesHierarchy.findOne({ name: "default_sales_flow" });
      if (!hierarchyConfig || !Array.isArray(hierarchyConfig.hierarchy)) {
        return res.status(500).json({ success: false, message: "Hierarchy config not found or invalid." });
      }

      const hierarchyPositions = hierarchyConfig.hierarchy.filter(pos => pos !== "dealer");
      const orFilters = hierarchyPositions.map(pos => ({ [pos]: { $in: subordinate_codes } }));

      const hierarchyEntries = await HierarchyEntries.find({
        hierarchy_name: "default_sales_flow",
        $or: orFilters,
      });

      const dealersFromHierarchy = hierarchyEntries.map(entry => entry.dealer);

      const directDealers = await ActorCode.find({
        code: { $in: subordinate_codes },
        position: "dealer"
      }).distinct("code");

      const dealerCategories = await User.find(
        { role: "dealer", labels: { $in: subordinate_codes } },
        { code: 1 }
      ).distinct("code");

      const dealerTown = await User.find(
        { role: "dealer", town: { $in: subordinate_codes } },
        { code: 1 }
      ).distinct("code");

      const dealerDistrict = await User.find(
        { role: "dealer", district: { $in: subordinate_codes } },
        { code: 1 }
      ).distinct("code");

      const dealerTaluka = await User.find(
        { role: "dealer", taluka: { $in: subordinate_codes } },
        { code: 1 }
      ).distinct("code");

      dealerCodes = [...new Set([
        ...dealersFromHierarchy,
        ...directDealers,
        ...dealerCategories,
        ...dealerTown,
        ...dealerDistrict,
        ...dealerTaluka,
      ])];
    } else if (["admin", "mdd", "super_admin"].includes(role)) {
      const hierarchyEntries = await HierarchyEntries.find({
        hierarchy_name: "default_sales_flow"
      });
      dealerCodes = [...new Set(hierarchyEntries.map(entry => entry.dealer))];
    } else if (role === "employee" && position) {
      const hierarchyEntries = await HierarchyEntries.find({
        hierarchy_name: "default_sales_flow",
        [position]: code,
      });
      dealerCodes = hierarchyEntries.map(entry => entry.dealer);
    } else {
      return res.status(403).json({ success: false, message: "Unauthorized role." });
    }

    // Fetch products for the segment
    const products = await Product.find({ segment, status: "active", brand: "samsung" });
    if (!products.length) {
      return res.status(404).json({ success: false, message: "No active products found for the specified segment." });
    }

    const productCodeToDetailsMap = {};
    const productCodes = products.map(p => {
      productCodeToDetailsMap[p.product_code] = {
        product_name: p.product_name,
        product_category: p.product_category
      };
      return p.product_code;
    });

    // Fetch sales data
    let salesQuery = {
      date: { $gte: startDate, $lte: endDate },
      product_code: { $in: productCodes },
      buyer_code: { $in: dealerCodes }
    };
    const salesData = await SalesData.find(salesQuery);

    // Fetch last month's sales data
    let lmtdStartDate = new Date(startDate);
    lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
    let lmtdEndDate = new Date(endDate);
    lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

    let lastMonthSalesQuery = {
      date: { $gte: lmtdStartDate, $lte: lmtdEndDate },
      product_code: { $in: productCodes },
      buyer_code: { $in: dealerCodes }
    };
    const lastMonthSalesData = await SalesData.find(lastMonthSalesQuery);

    // 🔥 Fetch product-wise targets (grouped by model_code)
    const targetValueMap = await getProductWiseTargets(code, filter_type, startDate);




    // Filter sales data by product categories if applicable
    let filteredSalesData = salesData;
    let filteredLastMonthSalesData = lastMonthSalesData;

    if (isProductCategoryFilter) {
      filteredSalesData = salesData.filter(sale => {
        const productCategory = productCodeToDetailsMap[sale.product_code]?.product_category;
        return productCategory && subordinate_codes.includes(productCategory);
      });
      filteredLastMonthSalesData = lastMonthSalesData.filter(sale => {
        const productCategory = productCodeToDetailsMap[sale.product_code]?.product_category;
        return productCategory && subordinate_codes.includes(productCategory);
      });
    }

    // Aggregate data by product
    let reportData = [];
    for (let product of products) {
      // Skip products not matching the specified categories if product category filter is applied
      if (isProductCategoryFilter && !subordinate_codes.includes(product.product_category)) {
        continue;
      }

      const productSales = filteredSalesData.filter(sale => sale.product_code === product.product_code);
      const lastMonthProductSales = filteredLastMonthSalesData.filter(sale => sale.product_code === product.product_code);

      const targetValue = targetValueMap?.[product.model_code] || 0;
      const mtdValue = productSales.reduce((sum, s) => sum + (filter_type === "value" ? s.total_amount : s.quantity), 0);
      const lmtdValue = lastMonthProductSales.reduce((sum, s) => sum + (filter_type === "value" ? s.total_amount : s.quantity), 0);

      const pending = targetValue - mtdValue;
      const ads = todayDate !== 0 ? (mtdValue / todayDate).toFixed(2) : 0;
      const reqAds = ((pending > 0 ? pending : 0) / (30 - todayDate)).toFixed(2);
      const growth = lmtdValue !== 0 ? ((mtdValue - lmtdValue) / lmtdValue) * 100 : mtdValue > 0 ? 100 : 0;

      const ftd = productSales.filter(s => new Date(s.date).getDate() === todayDate)
        .reduce((sum, s) => sum + (filter_type === "value" ? s.total_amount : s.quantity), 0);

      reportData.push({
        "Segment/Channel": product.product_name,
        Target: targetValue,
        MTD: mtdValue,
        LMTD: lmtdValue,
        Pending: pending,
        ADS: ads,
        "Req. ADS": reqAds,
        "% Growth": growth.toFixed(2),
        FTD: ftd,
        "% Contribution": 0,
      });
    }

    // Calculate contribution percentage
    const totalSales = reportData.reduce((sum, row) => sum + row.MTD, 0);
    reportData = reportData.map(row => ({
      ...row,
      "% Contribution": totalSales !== 0 ? ((row.MTD / totalSales) * 100).toFixed(2) : 0
    }));

    // Define response headers
    const headers = [
      "Segment/Channel",
      "Target",
      "MTD",
      "LMTD",
      "Pending",
      "ADS",
      "Req. ADS",
      "% Growth",
      "FTD",
      "% Contribution"
    ];

    return res.status(200).json({ success: true, headers, data: reportData });

  } catch (error) {
    console.error("Error in getSalesReportProductWise:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.fixAbove100KSegment = async (req, res) => {
  try {
    const result = await MddWiseTarget.updateMany(
      { segment: "Above 100K" },   // filter
      { $set: { segment: "100" } } // update
    );

    return res.status(200).json({
      success: true,
      message: "Segments updated successfully.",
      matchedCount: result.matchedCount,   // how many matched
      modifiedCount: result.modifiedCount, // how many actually updated
    });
  } catch (error) {
    console.error("Error updating segments:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

