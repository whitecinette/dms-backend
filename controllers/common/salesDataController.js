const SalesData = require("../../model/SalesData");
const Product = require("../../model/Product");
const Target = require("../../model/Target");
const Entity = require("../../model/Entity");
const ActorCode = require("../../model/ActorCode");
const HeirarchyEntries = require("../../model/HierarchyEntries");
const moment = require("moment");
const { getDashboardOverview } = require("../../helpers/salesHelpers");
const ActorTypesHierarchy = require("../../model/ActorTypesHierarchy");
const { Parser } = require('json2csv');

exports.getSalesReportByCode = async (req, res) => {
  try {
    let { start_date, end_date, filter_type, code, report_type } = req.body;
    filter_type = filter_type || "value"; // Default to 'value' if not provided
    report_type = report_type || "segment"; // Default to segment-wise report

    if (!start_date || !end_date || !code) {
      return res.status(400).json({ success: false, message: "Start date, end date, and code are required." });
    }

    if (!["segment", "channel"].includes(report_type)) {
      return res.status(400).json({ success: false, message: "Invalid report_type. Choose 'segment' or 'channel'." });
    }

    // Convert dates to Indian Standard Time (IST)
    const convertToIST = (date) => {
      let d = new Date(date);
      return new Date(d.getTime() + (5.5 * 60 * 60 * 1000)); // Convert UTC to IST
    };

    const startDate = convertToIST(new Date(start_date));
    const endDate = convertToIST(new Date(end_date));

    // Fetch actor details using the code
    const actor = await ActorCode.findOne({ code });
    if (!actor) {
      return res.status(404).json({ success: false, message: "Actor not found for the provided code." });
    }

    const { role, position } = actor;

    // Determine whether to fetch all data or filter by dealers
    let dealerCodes = [];
    if (["admin", "mdd", "super_admin"].includes(role)) {
      dealerCodes = null; // No filtering needed
    } else if (role === "employee" && position) {
      // Fetch dealers assigned to this position
      const hierarchyEntries = await HeirarchyEntries.find({
        hierarchy_name: "default_sales_flow",
        [position]: code, // Match the position dynamically
      });

      dealerCodes = hierarchyEntries.map(entry => entry.dealer);
    } else {
      return res.status(403).json({ success: false, message: "Unauthorized role." });
    }

    // Fetch segments or channels based on `report_type`
    const entity = await Entity.findOne({ name: report_type === "segment" ? "segments" : "channels" });
    if (!entity) {
      return res.status(400).json({ success: false, message: `No ${report_type} found in the database.` });
    }
    const reportCategories = entity.value || [];

    // Fetch Target for the given `code`
    const target = await Target.findOne({ entity: code });
    if (!target) {
      return res.status(404).json({ success: false, message: "Target not found for the provided code." });
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
    let lastMonthSalesQuery = { date: { $gte: lmtdStartDate, $lte: lmtdEndDate } };
    if (dealerCodes) {
      lastMonthSalesQuery.buyer_code = { $in: dealerCodes };
    }
    const lastMonthSalesData = await SalesData.find(lastMonthSalesQuery);

    // Group Products by Segment
    const products = await Product.find({ segment: segment, status: "active", brand: "samsung" });
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
        categorySales = salesData.filter(sale => productSegmentMap[sale.product_code] === category);
        lastMonthCategorySales = lastMonthSalesData.filter(sale => productSegmentMap[sale.product_code] === category);
        targetValue = target.value[filter_type]?.segment?.[category] || 0;
      } else {
        categorySales = salesData.filter(sale => sale.channel === category);
        lastMonthCategorySales = lastMonthSalesData.filter(sale => sale.channel === category);
        targetValue = target.value[filter_type]?.channel?.[category] || 0;
      }

      let mtdValue = categorySales.reduce((sum, sale) => sum + (filter_type === "value" ? sale.total_amount : sale.quantity), 0);
      let lmtdValue = lastMonthCategorySales.reduce((sum, sale) => sum + (filter_type === "value" ? sale.total_amount : sale.quantity), 0);

      let pending = targetValue - mtdValue;
      let ads = (mtdValue / todayDate).toFixed(2);
      let reqAds = ((pending > 0 ? pending : 0) / (30 - todayDate)).toFixed(2);
      let growth = lmtdValue !== 0 ? ((mtdValue - lmtdValue) / lmtdValue) * 100 : 0;
      let ftd = categorySales.filter(sale => new Date(sale.date).getDate() === todayDate)
        .reduce((sum, sale) => sum + (filter_type === "value" ? sale.total_amount : sale.quantity), 0);

      reportData.push({
        "Segment/Channel": category,
        "Target": targetValue,
        "MTD": mtdValue,
        "LMTD": lmtdValue,
        "Pending": pending,
        "ADS": ads,
        "Req. ADS": reqAds,
        "% Growth": growth.toFixed(2),
        "FTD": ftd,
        "% Contribution": 0, // Placeholder, calculated later
      });
    }

    // Calculate % Contribution
    let totalSales = reportData.reduce((sum, row) => sum + row.MTD, 0);
    reportData = reportData.map(row => ({
      ...row,
      "% Contribution": totalSales !== 0 ? ((row.MTD / totalSales) * 100).toFixed(2) : 0
    }));

    // Headers for Flutter
    const headers = ["Segment/Channel", "Target", "MTD", "LMTD", "Pending", "ADS", "Req. ADS", "% Growth", "FTD", "% Contribution"];

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
//       const hierarchyEntries = await HeirarchyEntries.find({
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
    let { code, filter_type, start_date, end_date } = req.body;
    filter_type = filter_type || "value"; // Default to 'value'

    if (!code || !start_date || !end_date) {
      return res.status(400).json({ success: false, message: "Code, start_date, and end_date are required." });
    }

    // Convert dates to IST
    const convertToIST = (date) => {
      let d = new Date(date);
      return new Date(d.getTime() + (5.5 * 60 * 60 * 1000)); // Convert UTC to IST
    };

    const startDate = convertToIST(new Date(start_date));
    const endDate = convertToIST(new Date(end_date));

    // Fetch actor details using the code
    const actor = await ActorCode.findOne({ code });
    if (!actor) {
      return res.status(404).json({ success: false, message: "Actor not found for the provided code." });
    }

    const { role, position } = actor;

    // Determine dealer filtering based on role
    let dealerCodes = [];
    if (["admin", "super_admin"].includes(role)) {
      dealerCodes = null; // Fetch all data
    } else if (role === "employee" && position) {
      // Fetch dealers assigned to this position
      const hierarchyEntries = await HeirarchyEntries.find({
        hierarchy_name: "default_sales_flow",
        [position]: code,
      });

      dealerCodes = hierarchyEntries.map(entry => entry.dealer);
    } else {
      return res.status(403).json({ success: false, message: "Unauthorized role." });
    }

    // Get last month’s start & end date till today's date
    let lmtdStartDate = new Date(startDate);
    lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);

    let lmtdEndDate = new Date(endDate);
    lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

    let baseQuery = dealerCodes ? { buyer_code: { $in: dealerCodes } } : {};

    // Fetch MTD Sell Out
    let mtdSellOut = await SalesData.aggregate([
      { $match: { ...baseQuery, sales_type: "Sell Out", date: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: null, total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } } } }
    ]);

    // Fetch LMTD Sell Out
    let lmtdSellOut = await SalesData.aggregate([
      { $match: { ...baseQuery, sales_type: "Sell Out", date: { $gte: lmtdStartDate, $lte: lmtdEndDate } } },
      { $group: { _id: null, total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } } } }
    ]);

    // Fetch MTD Sell In
    let mtdSellIn = await SalesData.aggregate([
      { $match: { ...baseQuery, sales_type: { $in: ["Sell In", "Sell Thru2"] }, date: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: null, total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } } } }
    ]);

    // Fetch LMTD Sell In
    let lmtdSellIn = await SalesData.aggregate([
      { $match: { ...baseQuery, sales_type: { $in: ["Sell In", "Sell Thru2"] }, date: { $gte: lmtdStartDate, $lte: lmtdEndDate } } },
      { $group: { _id: null, total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } } } }
    ]);

    // Calculate Growth %
    const calculateGrowth = (current, last) => (last !== 0 ? ((current - last) / last) * 100 : 0);

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
//       const hierarchyEntries = await HeirarchyEntries.find({
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
      state
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
      segment
    });

    return res.status(200).json({
      success: true,
      overview
    });

  } catch (error) {
    console.error("Error in masterSalesAPI:", error);
    return res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};

exports.getSalesWithHierarchyCSV = async (req, res) => {
  try {
    // Step 1: Get all sales entries (you can filter by date if needed)
    const salesEntries = await SalesData.find({}); // Optionally filter by date

    // Step 2: Fetch positions from default_sales_flow hierarchy
    const hierarchyConfig = await ActorTypesHierarchy.findOne({ name: "default_sales_flow" });
    if (!hierarchyConfig || !Array.isArray(hierarchyConfig.hierarchy)) {
      return res.status(500).json({ success: false, message: "Hierarchy config not found or invalid." });
    }

    const hierarchyPositions = hierarchyConfig.hierarchy; // e.g., ['smd', 'asm', 'mdd', 'tse', 'dealer']

    // Step 3: Fetch all hierarchy entries for default_sales_flow
    const hierarchyEntries = await HeirarchyEntries.find({ hierarchy_name: "default_sales_flow" });

    // Build a map of dealer => hierarchy
    const dealerHierarchyMap = {};
    for (const entry of hierarchyEntries) {
      if (entry.dealer) {
        dealerHierarchyMap[entry.dealer] = entry;
      }
    }

    // Step 4: Merge sales entries with dynamic hierarchy
    const enrichedSales = salesEntries.map(sale => {
      const hierarchy = dealerHierarchyMap[sale.buyer_code] || {};
      const hierarchyData = {};

      hierarchyPositions.forEach(pos => {
        if (pos !== 'dealer') { // skip 'dealer' since it's already in buyer_code
          hierarchyData[pos] = hierarchy[pos] || '';
        }
      });

      return {
        ...sale._doc,
        ...hierarchyData
      };
    });

    // Step 5: Generate dynamic CSV fields
    const allFields = Object.keys(enrichedSales[0] || {});
    const parser = new Parser({ fields: allFields });
    const csv = parser.parse(enrichedSales);

    res.header('Content-Type', 'text/csv');
    res.attachment('sales_with_hierarchy.csv');
    return res.send(csv);

  } catch (error) {
    console.error("Error in getSalesWithHierarchyCSV:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
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

    const convertToIST = (date) => new Date(new Date(date).getTime() + 5.5 * 60 * 60 * 1000);
    const startDate = convertToIST(start_date);
    const endDate = convertToIST(end_date);
    const lmtdStartDate = new Date(startDate);
    const lmtdEndDate = new Date(endDate);
    lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
    lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

    const actor = await ActorCode.findOne({ code });
    if (!actor) return res.status(404).json({ success: false, message: "Actor not found for the provided code." });

    const { role, position } = actor;
    let dealerCodes = [];

    if (subordinate_codes && subordinate_codes.length > 0) {
      const hierarchyConfig = await ActorTypesHierarchy.findOne({ name: "default_sales_flow" });
      if (!hierarchyConfig || !Array.isArray(hierarchyConfig.hierarchy)) {
        return res.status(500).json({ success: false, message: "Hierarchy config not found or invalid." });
      }

      const hierarchyPositions = hierarchyConfig.hierarchy.filter(pos => pos !== "dealer");
      const orFilters = hierarchyPositions.map(pos => ({ [pos]: { $in: subordinate_codes } }));

      const hierarchyEntries = await HeirarchyEntries.find({
        hierarchy_name: "default_sales_flow",
        $or: orFilters,
      });

      const dealersFromHierarchy = hierarchyEntries.map(entry => entry.dealer);

      const directDealers = await ActorCode.find({
        code: { $in: subordinate_codes },
        position: "dealer"
      }).distinct("code");

      dealerCodes = [...new Set([...dealersFromHierarchy, ...directDealers])];
    } else {
      if (["admin", "mdd", "super_admin"].includes(role)) {
        dealerCodes = null;
      } else if (role === "employee" && position) {
        const hierarchyEntries = await HeirarchyEntries.find({
          hierarchy_name: "default_sales_flow",
          [position]: code,
        });

        dealerCodes = hierarchyEntries.map(entry => entry.dealer);
      } else {
        return res.status(403).json({ success: false, message: "Unauthorized role." });
      }
    }

    const entity = await Entity.findOne({ name: report_type === "segment" ? "segments" : "channels" });
    if (!entity) return res.status(400).json({ success: false, message: `No ${report_type} found in the database.` });

    const reportCategories = entity.value || [];
    const target = await Target.findOne({ entity: code });
    if (!target) return res.status(404).json({ success: false, message: "Target not found for the provided code." });

    const matchQuery = {
      sales_type: "Sell Out",
      date: { $gte: startDate, $lte: endDate }
    };
    if (dealerCodes) matchQuery.buyer_code = { $in: dealerCodes };

    const salesData = await SalesData.aggregate([
      { $match: matchQuery },
      { $group: {
        _id: report_type === "segment" ? "$product_code" : "$channel",
        total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } },
        dateArray: { $push: "$date" }
      }}
    ]);

    const lastMonthMatch = {
      sales_type: "Sell Out",
      date: { $gte: lmtdStartDate, $lte: lmtdEndDate }
    };
    if (dealerCodes) lastMonthMatch.buyer_code = { $in: dealerCodes };

    const lastMonthSalesData = await SalesData.aggregate([
      { $match: lastMonthMatch },
      { $group: {
        _id: report_type === "segment" ? "$product_code" : "$channel",
        total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } }
      }}
    ]);

    const productMap = {};
    if (report_type === "segment") {
      const products = await Product.find({ status: "active" });
      products.forEach(p => productMap[p.product_code] = p.segment);
    }

    const salesMap = {};
    salesData.forEach(row => {
      const key = report_type === "segment" ? productMap[row._id] : row._id;
      if (key) salesMap[key] = (salesMap[key] || 0) + row.total;
    });

    const lastMonthMap = {};
    lastMonthSalesData.forEach(row => {
      const key = report_type === "segment" ? productMap[row._id] : row._id;
      if (key) lastMonthMap[key] = (lastMonthMap[key] || 0) + row.total;
    });

    let reportData = [];
    const todayDate = new Date().getDate();

    for (let category of reportCategories) {
      const mtdValue = salesMap[category] || 0;
      const lmtdValue = lastMonthMap[category] || 0;
      const targetValue = target.value[filter_type]?.[report_type]?.[category] || 0;
      const pending = targetValue - mtdValue;
      const ads = (mtdValue / todayDate).toFixed(2);
      const reqAds = ((pending > 0 ? pending : 0) / (30 - todayDate)).toFixed(2);
      const growth = lmtdValue !== 0 ? ((mtdValue - lmtdValue) / lmtdValue) * 100 : 0;
      const ftd = 0; // optionally can fetch FTD using separate query

      reportData.push({
        "Segment/Channel": category,
        "Target": targetValue,
        "MTD": mtdValue,
        "LMTD": lmtdValue,
        "Pending": pending,
        "ADS": ads,
        "Req. ADS": reqAds,
        "% Growth": growth.toFixed(2),
        "FTD": ftd,
        "% Contribution": 0
      });
    }

    const totalSales = reportData.reduce((sum, row) => sum + row.MTD, 0);
    reportData = reportData.map(row => ({
      ...row,
      "% Contribution": totalSales !== 0 ? ((row.MTD / totalSales) * 100).toFixed(2) : 0
    }));

    const headers = ["Segment/Channel", "Target", "MTD", "LMTD", "Pending", "ADS", "Req. ADS", "% Growth", "FTD", "% Contribution"];
    res.status(200).json({ headers, data: reportData });

  } catch (error) {
    console.error("Error generating sales report:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};


// exports.getSalesReportForUser = async (req, res) => {
//   try {
//     let { code } = req.user;
//     let { start_date, end_date, filter_type, report_type, subordinate_codes } = req.body;
//     filter_type = filter_type || "value";
//     report_type = report_type || "segment";

//     console.log("Filters: ", start_date, end_date, filter_type, report_type, subordinate_codes);

//     if (!start_date || !end_date || !code) {
//       return res.status(400).json({ success: false, message: "Start date, end date, and code are required." });
//     }

//     if (!["segment", "channel"].includes(report_type)) {
//       return res.status(400).json({ success: false, message: "Invalid report_type. Choose 'segment' or 'channel'." });
//     }

//     const convertToIST = (date) => {
//       let d = new Date(date);
//       return new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
//     };

//     const startDate = convertToIST(new Date(start_date));
//     const endDate = convertToIST(new Date(end_date));

//     const actor = await ActorCode.findOne({ code });
//     if (!actor) {
//       return res.status(404).json({ success: false, message: "Actor not found for the provided code." });
//     }

//     const { role, position } = actor;
//     let dealerCodes = [];

//     if (subordinate_codes && subordinate_codes.length > 0) {
//       // 1. Get dynamic position fields from ActorTypesHierarchies
//       const hierarchyConfig = await ActorTypesHierarchy.findOne({ name: "default_sales_flow" });
//       if (!hierarchyConfig || !Array.isArray(hierarchyConfig.hierarchy)) {
//         return res.status(500).json({ success: false, message: "Hierarchy config not found or invalid." });
//       }

//       const hierarchyPositions = hierarchyConfig.hierarchy.filter(pos => pos !== "dealer");

//       const orFilters = hierarchyPositions.map(pos => ({ [pos]: { $in: subordinate_codes } }));

//       const hierarchyEntries = await HeirarchyEntries.find({
//         hierarchy_name: "default_sales_flow",
//         $or: orFilters,
//       });

//       const dealersFromHierarchy = hierarchyEntries.map(entry => entry.dealer);

//       const directDealers = await ActorCode.find({
//         code: { $in: subordinate_codes },
//         position: "dealer"
//       }).distinct("code");

//       dealerCodes = [...new Set([...dealersFromHierarchy, ...directDealers])];
//     } else {
//       if (["admin", "mdd", "super_admin"].includes(role)) {
//         dealerCodes = null;
//       } else if (role === "employee" && position) {
//         const hierarchyEntries = await HeirarchyEntries.find({
//           hierarchy_name: "default_sales_flow",
//           [position]: code,
//         });

//         dealerCodes = hierarchyEntries.map(entry => entry.dealer);
//       } else {
//         return res.status(403).json({ success: false, message: "Unauthorized role." });
//       }
//     }

//     const entity = await Entity.findOne({ name: report_type === "segment" ? "segments" : "channels" });
//     if (!entity) {
//       return res.status(400).json({ success: false, message: `No ${report_type} found in the database.` });
//     }

//     const reportCategories = entity.value || [];
//     const target = await Target.findOne({ entity: code });
//     if (!target) {
//       return res.status(404).json({ success: false, message: "Target not found for the provided code." });
//     }

//     let lmtdStartDate = new Date(startDate);
//     lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
//     let lmtdEndDate = new Date(endDate);
//     lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

//     let todayDate = new Date().getDate();

//     console.log("Sales Report dealers: ", dealerCodes);

//     let salesQuery = { date: { $gte: startDate, $lte: endDate } };
//     if (dealerCodes) {
//       salesQuery.buyer_code = { $in: dealerCodes };
//     }
//     const salesData = await SalesData.find(salesQuery);

//     let lastMonthSalesQuery = { date: { $gte: lmtdStartDate, $lte: lmtdEndDate } };
//     if (dealerCodes) {
//       lastMonthSalesQuery.buyer_code = { $in: dealerCodes };
//     }
//     const lastMonthSalesData = await SalesData.find(lastMonthSalesQuery);

//     const products = await Product.find({ status: "active" });
//     const productSegmentMap = {};
//     products.forEach((product) => {
//       productSegmentMap[product.product_code] = product.segment;
//     });

//     let reportData = [];

//     for (let category of reportCategories) {
//       let categorySales, lastMonthCategorySales, targetValue;

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
//         "% Contribution": 0,
//       });
//     }

//     let totalSales = reportData.reduce((sum, row) => sum + row.MTD, 0);
//     reportData = reportData.map(row => ({
//       ...row,
//       "% Contribution": totalSales !== 0 ? ((row.MTD / totalSales) * 100).toFixed(2) : 0
//     }));

//     const headers = ["Segment/Channel", "Target", "MTD", "LMTD", "Pending", "ADS", "Req. ADS", "% Growth", "FTD", "% Contribution"];

//     res.status(200).json({ headers, data: reportData });

//   } catch (error) {
//     console.error("Error generating sales report:", error);
//     res.status(500).json({ success: false, message: "Internal server error" });
//   }
// };

exports.getDashboardSalesMetricsForUser = async (req, res) => {
  try {
    let { code } = req.user;
    let { filter_type, start_date, end_date, subordinate_codes } = req.body;
    console.log("Filters: ", filter_type, start_date, end_date, subordinate_codes);
    filter_type = filter_type || "value"; // Default to 'value'

    console.log("Subords: ", subordinate_codes);

    if (!code || !start_date || !end_date) {
      return res.status(400).json({ success: false, message: "Code, start_date, and end_date are required." });
    }

    const convertToIST = (date) => {
      let d = new Date(date);
      return new Date(d.getTime() + (5.5 * 60 * 60 * 1000)); // Convert UTC to IST
    };

    const startDate = convertToIST(new Date(start_date));
    const endDate = convertToIST(new Date(end_date));

    const actor = await ActorCode.findOne({ code });
    if (!actor) {
      return res.status(404).json({ success: false, message: "Actor not found for the provided code." });
    }

    const { role, position } = actor;
    let dealerCodes = [];

    // Case: Subordinates are provided
    if (subordinate_codes && subordinate_codes.length > 0) {
      let allDealers = [];
    
      // Step 1: Fetch dynamic positions from ActorTypesHierarchies
      const hierarchyConfig = await ActorTypesHierarchy.findOne({ name: "default_sales_flow" });
      if (!hierarchyConfig || !Array.isArray(hierarchyConfig.hierarchy)) {
        return res.status(500).json({ success: false, message: "Hierarchy config not found or invalid." });
      }
    
      // Step 2: Remove 'dealer' and create dynamic $or filter
      const hierarchyPositions = hierarchyConfig.hierarchy.filter(pos => pos !== "dealer");
      const orFilters = hierarchyPositions.map(pos => ({ [pos]: { $in: subordinate_codes } }));
    
      // Step 3: Query HeirarchyEntries for all matching subords
      const hierarchyEntries = await HeirarchyEntries.find({
        hierarchy_name: "default_sales_flow",
        $or: orFilters
      });
    
      const dealersFromHierarchy = hierarchyEntries.map(entry => entry.dealer);
    
      // Step 4: Include subords who are directly dealers
      const directDealers = await ActorCode.find({
        code: { $in: subordinate_codes },
        position: "dealer"
      }).distinct("code");
    
      // Step 5: Combine & deduplicate
      dealerCodes = [...new Set([...dealersFromHierarchy, ...directDealers])];
    }
     else {
      // No subords selected
      if (["admin", "super_admin"].includes(role)) {
        dealerCodes = null; // Means: fetch all dealers (no restriction)
      } else if (role === "employee" && position) {
        const hierarchyEntries = await HeirarchyEntries.find({
          hierarchy_name: "default_sales_flow",
          [position]: code,
        });

        dealerCodes = hierarchyEntries.map(entry => entry.dealer);
      } else {
        return res.status(403).json({ success: false, message: "Unauthorized role." });
      }
    }

    console.log("Dealers for dashboard: ", dealerCodes);
    // console.log("No. of dealers: ", dealerCodes.length);

    // Calculate LMTD date range
    let lmtdStartDate = new Date(startDate);
    lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
    let lmtdEndDate = new Date(endDate);
    lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

    let baseQuery = dealerCodes ? { buyer_code: { $in: dealerCodes } } : {};

    // Aggregation helpers
    const getTotal = async (salesType, dateRange) => {
      return await SalesData.aggregate([
        {
          $match: {
            ...baseQuery,
            sales_type: salesType,
            date: { $gte: dateRange.start, $lte: dateRange.end }
          }
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}`
              }
            }
          }
        }
      ]);
    };

    const mtdSellOut = await getTotal("Sell Out", { start: startDate, end: endDate });
    const lmtdSellOut = await getTotal("Sell Out", { start: lmtdStartDate, end: lmtdEndDate });

    const mtdSellIn = await getTotal({ $in: ["Sell In", "Sell Thru2"] }, { start: startDate, end: endDate });
    const lmtdSellIn = await getTotal({ $in: ["Sell In", "Sell Thru2"] }, { start: lmtdStartDate, end: lmtdEndDate });

    const calculateGrowth = (current, last) => (last !== 0 ? ((current - last) / last) * 100 : 0);

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
    };

    res.status(200).json({ success: true, data: response });
  } catch (error) {
    console.error("Error in getDashboardSalesMetrics:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.getSalesReportProductWise = async (req, res) => {
  try {
    let { code } = req.user;
    let { start_date, end_date, filter_type, segment, subordinate_codes } = req.body;
    filter_type = filter_type || "value";

    if (!start_date || !end_date || !code || !segment) {
      return res.status(400).json({ success: false, message: "Start date, end date, code, and segment are required." });
    }

    const convertToIST = (date) => {
      let d = new Date(date);
      return new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
    };

    const startDate = convertToIST(new Date(start_date));
    const endDate = convertToIST(new Date(end_date));
    const todayDate = new Date().getDate();

    const actor = await ActorCode.findOne({ code });
    if (!actor) {
      return res.status(404).json({ success: false, message: "Actor not found." });
    }

    const { role, position } = actor;
    let dealerCodes = [];

    if (subordinate_codes && subordinate_codes.length > 0) {
      const hierarchyConfig = await ActorTypesHierarchy.findOne({ name: "default_sales_flow" });
      if (!hierarchyConfig || !Array.isArray(hierarchyConfig.hierarchy)) {
        return res.status(500).json({ success: false, message: "Hierarchy config not found or invalid." });
      }

      const hierarchyPositions = hierarchyConfig.hierarchy.filter(pos => pos !== "dealer");
      const orFilters = hierarchyPositions.map(pos => ({ [pos]: { $in: subordinate_codes } }));

      const hierarchyEntries = await HeirarchyEntries.find({
        hierarchy_name: "default_sales_flow",
        $or: orFilters,
      });

      const dealersFromHierarchy = hierarchyEntries.map(entry => entry.dealer);

      const directDealers = await ActorCode.find({
        code: { $in: subordinate_codes },
        position: "dealer"
      }).distinct("code");

      dealerCodes = [...new Set([...dealersFromHierarchy, ...directDealers])];
    } else {
      if (["admin", "mdd", "super_admin"].includes(role)) {
        dealerCodes = null;
      } else if (role === "employee" && position) {
        const hierarchyEntries = await HeirarchyEntries.find({
          hierarchy_name: "default_sales_flow",
          [position]: code,
        });
        dealerCodes = hierarchyEntries.map(entry => entry.dealer);
      } else {
        return res.status(403).json({ success: false, message: "Unauthorized role." });
      }
    }

    const products = await Product.find({ segment: segment, status: "active", brand: "samsung" });
    const productCodeToNameMap = {};
    const productCodes = products.map(p => {
      productCodeToNameMap[p.product_code] = p.product_name;
      return p.product_code;
    });

    let salesQuery = {
      date: { $gte: startDate, $lte: endDate },
      product_code: { $in: productCodes }
    };
    if (dealerCodes) {
      salesQuery.buyer_code = { $in: dealerCodes };
    }
    const salesData = await SalesData.find(salesQuery);

    let lmtdStartDate = new Date(startDate);
    lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
    let lmtdEndDate = new Date(endDate);
    lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

    let lastMonthSalesQuery = {
      date: { $gte: lmtdStartDate, $lte: lmtdEndDate },
      product_code: { $in: productCodes }
    };
    if (dealerCodes) {
      lastMonthSalesQuery.buyer_code = { $in: dealerCodes };
    }
    const lastMonthSalesData = await SalesData.find(lastMonthSalesQuery);

    const target = await Target.findOne({ entity: code });
    if (!target) {
      return res.status(404).json({ success: false, message: "Target not found for the provided code." });
    }

    let reportData = [];

    for (let product of products) {
      const productSales = salesData.filter(sale => sale.product_code === product.product_code);
      const lastMonthProductSales = lastMonthSalesData.filter(sale => sale.product_code === product.product_code);

      const targetValue = target.value?.[filter_type]?.product?.[product.product_code] || 0;

      const mtdValue = productSales.reduce((sum, s) => sum + (filter_type === "value" ? s.total_amount : s.quantity), 0);
      const lmtdValue = lastMonthProductSales.reduce((sum, s) => sum + (filter_type === "value" ? s.total_amount : s.quantity), 0);

      const pending = targetValue - mtdValue;
      const ads = (mtdValue / todayDate).toFixed(2);
      const reqAds = ((pending > 0 ? pending : 0) / (30 - todayDate)).toFixed(2);
      const growth = lmtdValue !== 0 ? ((mtdValue - lmtdValue) / lmtdValue) * 100 : 0;

      const ftd = productSales.filter(s => new Date(s.date).getDate() === todayDate)
        .reduce((sum, s) => sum + (filter_type === "value" ? s.total_amount : s.quantity), 0);

      reportData.push({
        "Segment/Channel": product.product_name,
        "Target": targetValue,
        "MTD": mtdValue,
        "LMTD": lmtdValue,
        "Pending": pending,
        "ADS": ads,
        "Req. ADS": reqAds,
        "% Growth": growth.toFixed(2),
        "FTD": ftd,
        "% Contribution": 0,
      });
    }

    const totalSales = reportData.reduce((sum, row) => sum + row.MTD, 0);
    reportData = reportData.map(row => ({
      ...row,
      "% Contribution": totalSales !== 0 ? ((row.MTD / totalSales) * 100).toFixed(2) : 0
    }));

    const headers = ["Product", "Target", "MTD", "LMTD", "Pending", "ADS", "Req. ADS", "% Growth", "FTD", "% Contribution"];
    res.status(200).json({ headers, data: reportData });

  } catch (error) {
    console.error("Error in getSalesReportProductWise:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};



  



