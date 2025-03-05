const SalesData = require("../../model/SalesData");
const Product = require("../../model/Product");
const Target = require("../../model/Target");
const Entity = require("../../model/Entity");
const ActorCode = require("../../model/ActorCode");
const HeirarchyEntries = require("../../model/HierarchyEntries");

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
    const products = await Product.find({ status: "active" });
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

exports.getSalesReportForUser = async (req, res) => {
  try {
    let {code} = req.user;
    let { start_date, end_date, filter_type, report_type } = req.body;
    filter_type = filter_type || "value"; // Default to 'value' if not provided
    report_type = report_type || "segment"; // Default to segment-wise report

    console.log("Filters: ", start_date, end_date, filter_type, report_type);

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
    const products = await Product.find({ status: "active" });
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

exports.getDashboardSalesMetricsForUser = async (req, res) => {
  try {
    let {code} = req.user;
    let { filter_type, start_date, end_date } = req.body;
    console.log("Filetrs: ", filter_type, start_date, end_date);
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


