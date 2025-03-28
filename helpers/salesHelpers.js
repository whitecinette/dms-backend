const ActorCode = require("../model/ActorCode");
const HierarchyEntries = require("../model/HierarchyEntries");
const SalesData = require("../model/SalesData");

// Convert UTC to IST
const convertToIST = (date) => {
  let d = new Date(date);
  return new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
};

// Calculate growth percentage
const calculateGrowth = (current, previous) =>
  previous !== 0 ? ((current - previous) / previous) * 100 : 0;

// Get dealer codes under user or selected entities
const getDealersForUser = async (userCode, entities) => {
  let dealerCodes = [];

  if (entities && entities.length > 0) {
    const hierarchyFilter = {
      hierarchy_name: "default_sales_flow",
      $or: [
        { smd: { $in: entities } },
        { asm: { $in: entities } },
        { mdd: { $in: entities } },
        { tse: { $in: entities } },
        { dealer: { $in: entities } }
      ]
    };

    const hierarchyEntries = await HierarchyEntries.find(hierarchyFilter);
    dealerCodes = hierarchyEntries.map(entry => entry.dealer);
  } else {
    const actor = await ActorCode.findOne({ code: userCode });
    if (!actor || !actor.position) return [];

    const hierarchyEntries = await HierarchyEntries.find({
      hierarchy_name: "default_sales_flow",
      [actor.position]: userCode
    });

    dealerCodes = hierarchyEntries.map(entry => entry.dealer);
  }

  return dealerCodes;
};

// Aggregate total sales based on filters
const aggregateSales = async (baseQuery, type, from, to, valueOrVolume) => {
  let salesTypeFilter = {};
  if (type === "sell_out") salesTypeFilter.sales_type = "Sell Out";
  if (type === "sell_in") salesTypeFilter.sales_type = { $in: ["Sell In", "Sell Thru2"] };

  const result = await SalesData.aggregate([
    { $match: { ...baseQuery, ...salesTypeFilter, date: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: null,
        total: {
          $sum: { $toDouble: `$${valueOrVolume}` }
        }
      }
    }
  ]);

  return result.length > 0 ? result[0].total : 0;
};

// Get dashboard overview (MTD/LMTD for Sell In and Sell Out)
const getDashboardOverview = async ({
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
}) => {
  const start_Date = convertToIST(startdate);
  const end_Date = convertToIST(endDate);

  const lmtdStart = new Date(start_Date);
  lmtdStart.setMonth(lmtdStart.getMonth() - 1);
  const lmtdEnd = new Date(end_Date);
  lmtdEnd.setMonth(lmtdEnd.getMonth() - 1);

  const dealerCodes = await getDealersForUser(userCode, entities);
  const valueOrVolume = data_type === "volume" ? "quantity" : "total_amount";

  let baseQuery = {
    ...(dealerCodes.length > 0 && { buyer_code: { $in: dealerCodes } }),
    ...(smd && { spd: smd }),
    ...(cluster && { cluster }),
    ...(city && { city }),
    ...(state && { state }),
    ...(segment && { segment })
  };

  const mtd_sell_out = await aggregateSales(baseQuery, "sell_out", start_Date, end_Date, valueOrVolume);
  const lmtd_sell_out = await aggregateSales(baseQuery, "sell_out", lmtdStart, lmtdEnd, valueOrVolume);
  const mtd_sell_in = await aggregateSales(baseQuery, "sell_in", start_Date, end_Date, valueOrVolume);
  const lmtd_sell_in = await aggregateSales(baseQuery, "sell_in", lmtdStart, lmtdEnd, valueOrVolume);

  const overview = {
    mtd_sell_in,
    lmtd_sell_in,
    sell_in_growth: calculateGrowth(mtd_sell_in, lmtd_sell_in).toFixed(2),
    mtd_sell_out,
    lmtd_sell_out,
    sell_out_growth: calculateGrowth(mtd_sell_out, lmtd_sell_out).toFixed(2)
  };

  return overview;
};

module.exports = {
  getDashboardOverview
};
