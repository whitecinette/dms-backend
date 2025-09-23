const ActorCode = require("../model/ActorCode");
const ActorTypesHierarchy = require("../model/ActorTypesHierarchy");
const HierarchyEntries = require("../model/HierarchyEntries");
const MddWiseTarget = require("../model/MddWiseTarget");
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

const getPriceBandWiseTargets = async ({
  code,
  role,
  position,
  subordinate_codes,
  startDate,
  endDate,
  filter_type,
}) => {
  // default filter
  filter_type = filter_type || "value";

  // derive month & year from startDate
  const month = startDate.getMonth() + 1; // JS is 0-indexed
  const year = startDate.getFullYear();

  let mddCodes = [];

  if (subordinate_codes && subordinate_codes.length > 0) {
    // Admin: resolve subordinate MDDs
    const hierarchyConfig = await ActorTypesHierarchy.findOne({
      name: "default_sales_flow",
    });

    if (!hierarchyConfig || !Array.isArray(hierarchyConfig.hierarchy)) {
      return {};
    }

    const hierarchyPositions = hierarchyConfig.hierarchy.filter(
      (pos) => pos !== "dealer"
    );
    const orFilters = hierarchyPositions.map((pos) => ({
      [pos]: { $in: subordinate_codes },
    }));

    const hierarchyEntries = await HierarchyEntries.find({
      hierarchy_name: "default_sales_flow",
      $or: orFilters,
    });

    mddCodes = [...new Set(hierarchyEntries.map((e) => e.mdd))];
  } else {
    if (["admin", "super_admin"].includes(role)) {
      const hierarchyEntries = await HierarchyEntries.find({
        hierarchy_name: "default_sales_flow",
      });
      mddCodes = [...new Set(hierarchyEntries.map((e) => e.mdd))];
    } else if (role === "employee" && position) {
      const hierarchyEntries = await HierarchyEntries.find({
        hierarchy_name: "default_sales_flow",
        [position]: code,
      });
      mddCodes = [...new Set(hierarchyEntries.map((e) => e.mdd))];
    } else if (role === "mdd") {
      // MDD himself
      mddCodes = [code];
    }
  }

  if (mddCodes.length === 0) return {};

  // fetch targets for these MDDs for the month/year
  const targets = await MddWiseTarget.find({
    mdd_code: { $in: mddCodes },
    month,
    year,
  });

  // group by segment
  let segmentTargets = {};
  for (let t of targets) {
    let seg = t.segment || "Unknown";

    // normalize names to align with Product.segment
    if (/Above 100K/i.test(seg)) seg = "100+";
    else if (/Less than 10K/i.test(seg)) seg = "0-10";
    else seg = seg.replace(/k/gi, ""); // "70-100k" -> "70-100"

    // apply filter_type logic
    let amount = 0;
    if (filter_type === "value") {
      const qty = Number(t.vol_tgt) || 0;
      const dp = Number(t.dp) || 0;
      amount = qty * dp;
    } else {
      amount = Number(t.vol_tgt) || 0;
    }

    if (!segmentTargets[seg]) segmentTargets[seg] = 0;
    segmentTargets[seg] += amount;
  }

  return segmentTargets;
};


const getProductWiseTargets = async (code, filter_type = "value", startDate) => {
  console.log("REACH")
  // derive month & year from report's startDate
  const month = startDate.getMonth() + 1; // JS is 0-indexed
  const year = startDate.getFullYear();

  // 🔍 Resolve actor
  const actor = await ActorCode.findOne({ code });
  if (!actor) return {};

  const { role, position } = actor;
  let mddCodes = [];

  if (["admin", "super_admin"].includes(role)) {
    const hierarchyEntries = await HierarchyEntries.find({
      hierarchy_name: "default_sales_flow",
    });
    mddCodes = [...new Set(hierarchyEntries.map((e) => e.mdd))];
  } else if (role === "employee" && position) {
    const hierarchyEntries = await HierarchyEntries.find({
      hierarchy_name: "default_sales_flow",
      [position]: code,
    });
    mddCodes = [...new Set(hierarchyEntries.map((e) => e.mdd))];
  } else if (role === "mdd") {
    mddCodes = [code]; // MDD himself
  }

  if (mddCodes.length === 0) return {};

  // 🗂 Fetch targets for MDDs for this month/year
  const targets = await MddWiseTarget.find({
    mdd_code: { $in: mddCodes },
    month,
    year,
  });

  // 📊 Group by model_code
  let productTargets = {};
  for (let t of targets) {
    const key = t.model_code || "Unknown";
    if (!productTargets[key]) productTargets[key] = 0;

    if (filter_type === "value") {
      // Value target = quantity * dp
      productTargets[key] += (t.vol_tgt ?? 0) * (t.dp ?? 0);
    } else {
      // Volume target = just quantity
      productTargets[key] += t.vol_tgt ?? 0;
    }
  }
  console.log("REACH")
  // 🖨️ Print only non-zero targets
// for (let [modelCode, targetVal] of Object.entries(productTargets)) {
//   if (targetVal > 0) {
//     console.log(`Model: ${modelCode}, Target: ${targetVal}`);
//   }
// }

  return productTargets; // { model_code: targetValue }
};






module.exports = {
  getDashboardOverview,
  getPriceBandWiseTargets,
  getProductWiseTargets
};



