const ActivationData = require("../../model/ActivationData");
const ProductMaster = require("../../model/ProductMaster");
const { PRICE_SEGMENTS } = require("../../config/price_segment_config");

const IST_OFFSET_MIN = 330;

// ---------- IST helpers ----------
function toIstParts(date) {
  const d = new Date(date.getTime() + IST_OFFSET_MIN * 60 * 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}
function istMidnightUtc(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - IST_OFFSET_MIN * 60 * 1000);
}
function istEndOfDayUtc(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - IST_OFFSET_MIN * 60 * 1000);
}
function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function addDaysIst(y, m, d, deltaDays) {
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return { y: base.getUTCFullYear(), m: base.getUTCMonth() + 1, d: base.getUTCDate() };
}
function monthStartIstUtc(y, m) {
  return istMidnightUtc(y, m, 1);
}
function monthEndIstUtc(y, m) {
  return istEndOfDayUtc(y, m, daysInMonth(y, m));
}
function monthLabel(y, m) {
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
}

// ---------- Shared formatter ----------
function formatSegmentTable(data, isAdmin, meta, segmentOrder) {
  const valueTable = [];
  const volumeTable = [];
  const { k1, k2, k3 } = meta.monthKeys;

  const segmentMap = {};
  (data.tableData || []).forEach((r) => (segmentMap[r._id] = r));

  const growthPct = (mtd, lmtd) => {
    if (!lmtd || lmtd === 0) return 0;
    return ((mtd - lmtd) / lmtd) * 100;
  };

  const projectWMF = (mtd) => {
    const { elapsedDays, totalDays } = meta;
    if (!elapsedDays || elapsedDays <= 0) return 0;
    return (mtd / elapsedDays) * totalDays;
  };

  segmentOrder.forEach((seg) => {
    const r = segmentMap[seg] || {};

    const mtdVal = r.mtdVal || 0;
    const lmtdVal = r.lmtdVal || 0;

    valueTable.push({
      Seg: seg,
      [k1]: r.m3Val || 0,
      [k2]: r.m2Val || 0,
      [k3]: r.m1Val || 0,
      MTD: mtdVal,
      LMTD: lmtdVal,
      FTD: r.ftdVal || 0,
      "G/D%": growthPct(mtdVal, lmtdVal),
      "Exp.Ach": 0,
      WMF: projectWMF(mtdVal),
    });

    const mtdQty = r.mtdQty || 0;
    const lmtdQty = r.lmtdQty || 0;

    volumeTable.push({
      Seg: seg,
      [k1]: r.m3Qty || 0,
      [k2]: r.m2Qty || 0,
      [k3]: r.m1Qty || 0,
      MTD: mtdQty,
      LMTD: lmtdQty,
      FTD: r.ftdQty || 0,
      "G/D%": growthPct(mtdQty, lmtdQty),
      "Exp.Ach": 0,
      WMF: projectWMF(mtdQty),
    });
  });

  const sumCols = (rows, key) => rows.reduce((a, r) => a + (Number(r[key]) || 0), 0);

  valueTable.push({
    Seg: "Total",
    [k1]: sumCols(valueTable, k1),
    [k2]: sumCols(valueTable, k2),
    [k3]: sumCols(valueTable, k3),
    MTD: sumCols(valueTable, "MTD"),
    LMTD: sumCols(valueTable, "LMTD"),
    FTD: sumCols(valueTable, "FTD"),
    "G/D%": null,
    "Exp.Ach": sumCols(valueTable, "Exp.Ach"),
    WMF: sumCols(valueTable, "WMF"),
  });

  volumeTable.push({
    Seg: "Total",
    [k1]: sumCols(volumeTable, k1),
    [k2]: sumCols(volumeTable, k2),
    [k3]: sumCols(volumeTable, k3),
    MTD: sumCols(volumeTable, "MTD"),
    LMTD: sumCols(volumeTable, "LMTD"),
    FTD: sumCols(volumeTable, "FTD"),
    "G/D%": null,
    "Exp.Ach": sumCols(volumeTable, "Exp.Ach"),
    WMF: sumCols(volumeTable, "WMF"),
  });

  const raw = data.totalRaw?.[0] || {};
  const unmapped = data.unmappedProduct?.[0] || {};
  const excluded = data.hierarchyExcluded?.[0] || {};

  return {
    value: valueTable,
    volume: volumeTable,
    flagSummary: {
      totalRowsInDateRange: raw.totalRows || 0,
      totalValueInDateRange: raw.totalVal || 0,
      totalQtyInDateRange: raw.totalQty || 0,

      unmappedProductRows: unmapped.rows || 0,
      unmappedProductValue: unmapped.totalVal || 0,
      unmappedProductQty: unmapped.totalQty || 0,

      hierarchyExcludedRows: excluded.rows || 0,
      hierarchyExcludedValue: excluded.totalVal || 0,
      hierarchyExcludedQty: excluded.totalQty || 0,

      countedInOverall: isAdmin,
      hasHierarchyIssue: !isAdmin && (excluded.rows || 0) > 0,
      hasProductIssue: (unmapped.rows || 0) > 0,
    },
  };
}

// ---------- Generic builder ----------
async function buildPriceSegmentReport({
  Model,            // ActivationData
  dealerCodes,
  startDate,
  endDate,
  isAdmin,
  segmentOrder,     // e.g. PRICE_SEGMENTS or ["40K", ">40K"]
  needsLookup,      // true for sub_segment report
  groupByExpr,      // "$product.sub_segment" or "$band"
  extraAddFields,   // optional stage(s) like band calc
  includeUnmappedProduct, // true only if lookup is used
}) {
  const safeCodes = Array.isArray(dealerCodes) ? dealerCodes : [];

  // BUSINESS DATE = D-1 IST
  const endParts = toIstParts(endDate.toDate());
  const business = addDaysIst(endParts.y, endParts.m, endParts.d, -1);

  const curY = business.y;
  const curM = business.m;

  const curStart = monthStartIstUtc(curY, curM);
  const businessStart = istMidnightUtc(business.y, business.m, business.d);
  const businessEnd = istEndOfDayUtc(business.y, business.m, business.d);

  // LMTD window
  const prevMonthEnd = addDaysIst(curY, curM, 1, -1);
  const prevY = prevMonthEnd.y;
  const prevM = prevMonthEnd.m;
  const prevMonthDays = daysInMonth(prevY, prevM);
  const lmtdDay = Math.min(business.d, prevMonthDays);

  const lmtdStart = monthStartIstUtc(prevY, prevM);
  const lmtdEnd = istEndOfDayUtc(prevY, prevM, lmtdDay);

  // Prev 3 full months
  const monthMinus1 = { y: prevY, m: prevM };
  const monthMinus2End = addDaysIst(prevY, prevM, 1, -1);
  const monthMinus2 = { y: monthMinus2End.y, m: monthMinus2End.m };
  const monthMinus3End = addDaysIst(monthMinus2.y, monthMinus2.m, 1, -1);
  const monthMinus3 = { y: monthMinus3End.y, m: monthMinus3End.m };

  const m1Start = monthStartIstUtc(monthMinus1.y, monthMinus1.m);
  const m1End = monthEndIstUtc(monthMinus1.y, monthMinus1.m);
  const m2Start = monthStartIstUtc(monthMinus2.y, monthMinus2.m);
  const m2End = monthEndIstUtc(monthMinus2.y, monthMinus2.m);
  const m3Start = monthStartIstUtc(monthMinus3.y, monthMinus3.m);
  const m3End = monthEndIstUtc(monthMinus3.y, monthMinus3.m);

  const earliestStart = m3Start;

  const k1 = monthLabel(monthMinus3.y, monthMinus3.m);
  const k2 = monthLabel(monthMinus2.y, monthMinus2.m);
  const k3 = monthLabel(monthMinus1.y, monthMinus1.m);

  const pipeline = [
    // parse date + hierarchy
    {
      $addFields: {
        parsedDate: {
          $let: {
            vars: { parts: { $split: ["$activation_date_raw", "/"] } },
            in: {
              $dateFromParts: {
                year: { $add: [2000, { $toInt: { $arrayElemAt: ["$$parts", 2] } }] },
                month: { $toInt: { $arrayElemAt: ["$$parts", 0] } },
                day: { $toInt: { $arrayElemAt: ["$$parts", 1] } },
                timezone: "Asia/Kolkata",
              },
            },
          },
        },
        inHierarchy: { $in: ["$tertiary_buyer_code", safeCodes] },
      },
    },
    { $match: { parsedDate: { $gte: earliestStart, $lte: businessEnd } } },
  ];

  if (needsLookup) {
    pipeline.push({
      $lookup: {
        from: "productmasters",
        let: { pcode: "$product_code", sku: "$sku" },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  { $eq: ["$product_code", "$$pcode"] },
                  { $eq: ["$sku", "$$sku"] },
                  { $eq: ["$sku", "$$pcode"] },
                ],
              },
            },
          },
        ],
        as: "product",
      },
    });
  }

  if (extraAddFields) {
    // allow one stage or array of stages
    if (Array.isArray(extraAddFields)) pipeline.push(...extraAddFields);
    else pipeline.push(extraAddFields);
  }

  pipeline.push({
    $facet: {
      totalRaw: [
        { $match: { parsedDate: { $gte: curStart, $lte: businessEnd } } },
        { $group: { _id: null, totalRows: { $sum: 1 }, totalVal: { $sum: "$val" }, totalQty: { $sum: "$qty" } } },
      ],

      unmappedProduct: includeUnmappedProduct
        ? [
            { $match: { parsedDate: { $gte: curStart, $lte: businessEnd }, product: { $eq: [] } } },
            { $group: { _id: null, rows: { $sum: 1 }, totalVal: { $sum: "$val" }, totalQty: { $sum: "$qty" } } },
          ]
        : [{ $match: { _id: null } }], // empty

      hierarchyExcluded: [
        { $match: { parsedDate: { $gte: curStart, $lte: businessEnd }, inHierarchy: false } },
        { $group: { _id: null, rows: { $sum: 1 }, totalVal: { $sum: "$val" }, totalQty: { $sum: "$qty" } } },
      ],

      tableData: [
        ...(needsLookup ? [{ $unwind: "$product" }] : []),
        { $match: isAdmin ? {} : { inHierarchy: true } },
        {
          $group: {
            _id: groupByExpr,

            m3Val: { $sum: { $cond: [{ $and: [{ $gte: ["$parsedDate", m3Start] }, { $lte: ["$parsedDate", m3End] }] }, "$val", 0] } },
            m2Val: { $sum: { $cond: [{ $and: [{ $gte: ["$parsedDate", m2Start] }, { $lte: ["$parsedDate", m2End] }] }, "$val", 0] } },
            m1Val: { $sum: { $cond: [{ $and: [{ $gte: ["$parsedDate", m1Start] }, { $lte: ["$parsedDate", m1End] }] }, "$val", 0] } },

            m3Qty: { $sum: { $cond: [{ $and: [{ $gte: ["$parsedDate", m3Start] }, { $lte: ["$parsedDate", m3End] }] }, "$qty", 0] } },
            m2Qty: { $sum: { $cond: [{ $and: [{ $gte: ["$parsedDate", m2Start] }, { $lte: ["$parsedDate", m2End] }] }, "$qty", 0] } },
            m1Qty: { $sum: { $cond: [{ $and: [{ $gte: ["$parsedDate", m1Start] }, { $lte: ["$parsedDate", m1End] }] }, "$qty", 0] } },

            mtdVal: { $sum: { $cond: [{ $and: [{ $gte: ["$parsedDate", curStart] }, { $lte: ["$parsedDate", businessEnd] }] }, "$val", 0] } },
            mtdQty: { $sum: { $cond: [{ $and: [{ $gte: ["$parsedDate", curStart] }, { $lte: ["$parsedDate", businessEnd] }] }, "$qty", 0] } },

            lmtdVal: { $sum: { $cond: [{ $and: [{ $gte: ["$parsedDate", lmtdStart] }, { $lte: ["$parsedDate", lmtdEnd] }] }, "$val", 0] } },
            lmtdQty: { $sum: { $cond: [{ $and: [{ $gte: ["$parsedDate", lmtdStart] }, { $lte: ["$parsedDate", lmtdEnd] }] }, "$qty", 0] } },

            ftdVal: { $sum: { $cond: [{ $and: [{ $gte: ["$parsedDate", businessStart] }, { $lte: ["$parsedDate", businessEnd] }] }, "$val", 0] } },
            ftdQty: { $sum: { $cond: [{ $and: [{ $gte: ["$parsedDate", businessStart] }, { $lte: ["$parsedDate", businessEnd] }] }, "$qty", 0] } },
          },
        },
      ],
    },
  });

  const result = await Model.aggregate(pipeline);

  return formatSegmentTable(result[0], isAdmin, {
    monthKeys: { k1, k2, k3 },
    elapsedDays: business.d,
    totalDays: daysInMonth(curY, curM),
  }, segmentOrder);
}



exports.getPriceSegmentSummaryActivation = async (dealerCodes, startDate, endDate, isAdmin) => {
  return buildPriceSegmentReport({
    Model: ActivationData,
    dealerCodes,
    startDate,
    endDate,
    isAdmin,
    segmentOrder: PRICE_SEGMENTS,
    needsLookup: true,
    groupByExpr: "$product.sub_segment",
    extraAddFields: null,
    includeUnmappedProduct: true,
  });
};

exports.getPrice40kSplitSummaryActivation = async (dealerCodes, startDate, endDate, isAdmin) => {
  const THRESHOLD = 40000;

  return buildPriceSegmentReport({
    Model: ActivationData,
    dealerCodes,
    startDate,
    endDate,
    isAdmin,
    segmentOrder: ["40K", ">40K"],
    needsLookup: false,               // ✅ no productmaster needed
    groupByExpr: "$band",
    includeUnmappedProduct: false,    // ✅ no unmapped products in this report
    extraAddFields: {
      $addFields: {
        unitPrice: { $cond: [{ $gt: ["$qty", 0] }, { $divide: ["$val", "$qty"] }, 0] },
        band: { $cond: [{ $lte: ["$unitPrice", THRESHOLD] }, "40K", ">40K"] },
      },
    },
  });
};

