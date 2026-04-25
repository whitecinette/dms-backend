const ActivationData = require("../../model/ActivationData");
const ProductMaster = require("../../model/ProductMaster");
const Product = require("../../model/Product");
const moment = require("moment");

// segment order for output
const PRICE_SEGMENTS = [
  "0-6",
  "6-10",
  "10-20",
  "20-30",
  "30-40",
  "40-70",
  "70-100",
  "100-120",
  "120",
];

// -----------------------------
// Helpers
// -----------------------------
function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeCode(v) {
  return String(v || "").trim().toUpperCase();
}

function normalizeSegment(seg) {
  return String(seg || "").trim();
}

function parseActivationRawDate(raw) {
  if (!raw || typeof raw !== "string") return null;

  const parts = raw.split("/");
  if (parts.length !== 3) return null;

  let [month, day, year] = parts.map((x) => parseInt(x, 10));
  if (!month || !day || year === undefined || Number.isNaN(year)) return null;

  if (year < 100) year += 2000;

  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function bucketFromPrice(price) {
  price = safeNum(price);
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

function growthPct(mtd, lmtd) {
  if (!lmtd || lmtd === 0) return 0;
  return Number((((mtd - lmtd) / lmtd) * 100).toFixed(2));
}

function projectWMF(mtd, endDateMoment) {
  const elapsedDays = endDateMoment.date();
  const totalDays = endDateMoment.daysInMonth();
  if (!elapsedDays || elapsedDays <= 0) return 0;
  return Number(((mtd / elapsedDays) * totalDays).toFixed(2));
}

function initBucket() {
  return {
    m3Val: 0,
    m2Val: 0,
    m1Val: 0,
    m3Qty: 0,
    m2Qty: 0,
    m1Qty: 0,
    mtdVal: 0,
    mtdQty: 0,
    lmtdVal: 0,
    lmtdQty: 0,
    ftdVal: 0,
    ftdQty: 0,
  };
}

function ensureBucket(map, seg) {
  if (!map[seg]) map[seg] = initBucket();
  return map[seg];
}

function formatSegmentTable({
  segmentMap,
  totalRaw,
  unmappedProduct,
  hierarchyExcluded,
  isAdmin,
  monthKeys,
  endDate,
  segmentOrder,
}) {
  const { k1, k2, k3 } = monthKeys;

  const value = [];
  const volume = [];

  segmentOrder.forEach((seg) => {
    const r = segmentMap[seg] || initBucket();

    value.push({
      Seg: seg,
      [k1]: r.m3Val || 0,
      [k2]: r.m2Val || 0,
      [k3]: r.m1Val || 0,
      MTD: r.mtdVal || 0,
      LMTD: r.lmtdVal || 0,
      FTD: r.ftdVal || 0,
      "G/D%": growthPct(r.mtdVal || 0, r.lmtdVal || 0),
      "Exp.Ach": 0,
      WMF: projectWMF(r.mtdVal || 0, endDate),
    });

    volume.push({
      Seg: seg,
      [k1]: r.m3Qty || 0,
      [k2]: r.m2Qty || 0,
      [k3]: r.m1Qty || 0,
      MTD: r.mtdQty || 0,
      LMTD: r.lmtdQty || 0,
      FTD: r.ftdQty || 0,
      "G/D%": growthPct(r.mtdQty || 0, r.lmtdQty || 0),
      "Exp.Ach": 0,
      WMF: projectWMF(r.mtdQty || 0, endDate),
    });
  });

  const sumCols = (rows, key) =>
    rows.reduce((a, r) => a + (Number(r[key]) || 0), 0);

  value.push({
    Seg: "Total",
    [k1]: sumCols(value, k1),
    [k2]: sumCols(value, k2),
    [k3]: sumCols(value, k3),
    MTD: sumCols(value, "MTD"),
    LMTD: sumCols(value, "LMTD"),
    FTD: sumCols(value, "FTD"),
    "G/D%": null,
    "Exp.Ach": sumCols(value, "Exp.Ach"),
    WMF: sumCols(value, "WMF"),
  });

  volume.push({
    Seg: "Total",
    [k1]: sumCols(volume, k1),
    [k2]: sumCols(volume, k2),
    [k3]: sumCols(volume, k3),
    MTD: sumCols(volume, "MTD"),
    LMTD: sumCols(volume, "LMTD"),
    FTD: sumCols(volume, "FTD"),
    "G/D%": null,
    "Exp.Ach": sumCols(volume, "Exp.Ach"),
    WMF: sumCols(volume, "WMF"),
  });

  return {
    value,
    volume,
    flagSummary: {
      totalRowsInDateRange: totalRaw.totalRows || 0,
      totalValueInDateRange: totalRaw.totalVal || 0,
      totalQtyInDateRange: totalRaw.totalQty || 0,

      unmappedProductRows: unmappedProduct.rows || 0,
      unmappedProductValue: unmappedProduct.totalVal || 0,
      unmappedProductQty: unmappedProduct.totalQty || 0,

      hierarchyExcludedRows: hierarchyExcluded.rows || 0,
      hierarchyExcludedValue: hierarchyExcluded.totalVal || 0,
      hierarchyExcludedQty: hierarchyExcluded.totalQty || 0,

      countedInOverall: isAdmin,
      hasHierarchyIssue: !isAdmin && (hierarchyExcluded.rows || 0) > 0,
      hasProductIssue: (unmappedProduct.rows || 0) > 0,
    },
  };
}

// -----------------------------
// Main: Activation segment report
// -----------------------------
exports.getPriceSegmentSummaryActivation = async (
  dealerCodes,
  startDate,
  endDate,
  lmtdStart,
  lmtdEnd,
  ftdRawDate,
  lastThreeMonths,
  extraMatch,
  isAdmin
) => {
  const safeDealerCodes = (dealerCodes || []).map(normalizeCode);
  const dealerSet = new Set(safeDealerCodes);

  const k1 = lastThreeMonths[0];
  const k2 = lastThreeMonths[1];
  const k3 = lastThreeMonths[2];

  // fetch only relevant rows, exactly like extraction report strategy
  const activationMatch = {
    year_month: { $in: [...new Set([...lastThreeMonths, startDate.format("YYYY-MM"), lmtdStart.format("YYYY-MM")])] },
  };

  if (extraMatch && Object.keys(extraMatch).length > 0) {
    Object.assign(activationMatch, extraMatch);
  }

  if (!isAdmin && safeDealerCodes.length > 0) {
    activationMatch.tertiary_buyer_code = { $in: safeDealerCodes };
  }

  // if non-admin and no dealer codes, return empty
  if (!isAdmin && safeDealerCodes.length === 0) {
    return formatSegmentTable({
      segmentMap: {},
      totalRaw: {},
      unmappedProduct: {},
      hierarchyExcluded: {},
      isAdmin,
      monthKeys: { k1, k2, k3 },
      endDate,
      segmentOrder: PRICE_SEGMENTS,
    });
  }

  const rows = await ActivationData.find(activationMatch).lean();

  // exact date filter in JS
  const filteredRows = [];
  for (const row of rows) {
    const parsedDate = parseActivationRawDate(row.activation_date_raw);
    if (!parsedDate) continue;

    row.__parsedDate = parsedDate;
    filteredRows.push(row);
  }

  // product fetch once
  const productCodes = [
    ...new Set(filteredRows.map((r) => normalizeCode(r.product_code)).filter(Boolean)),
  ];

  const modelCodes = [
    ...new Set(filteredRows.map((r) => normalizeCode(r.model_no)).filter(Boolean)),
  ];

  const products = await Product.find({
    brand: { $regex: /^samsung$/i },
    $or: [
      { product_code: { $in: productCodes } },
      { model_code: { $in: modelCodes } },
    ],
  }).lean();

  const productByCode = new Map();
  const productByModel = new Map();

  for (const p of products) {
    const productCode = normalizeCode(p.product_code);
    const modelCode = normalizeCode(p.model_code);

    if (productCode && !productByCode.has(productCode)) {
      productByCode.set(productCode, p);
    }
    if (modelCode && !productByModel.has(modelCode)) {
      productByModel.set(modelCode, p);
    }
  }

  const segmentMap = {};
  const totalRaw = { totalRows: 0, totalVal: 0, totalQty: 0 };
  const unmappedProduct = { rows: 0, totalVal: 0, totalQty: 0 };
  const hierarchyExcluded = { rows: 0, totalVal: 0, totalQty: 0 };

  for (const row of filteredRows) {
    const parsedDate = row.__parsedDate;
    const qty = safeNum(row.qty);
    const val = safeNum(row.val);
    const buyerCode = normalizeCode(row.tertiary_buyer_code);
    const yearMonth = row.year_month;

    const inHierarchy = isAdmin ? true : dealerSet.has(buyerCode);

    const inMtd =
      parsedDate >= startDate.clone().startOf("day").toDate() &&
      parsedDate <= endDate.clone().endOf("day").toDate();

    const inLmtd =
      parsedDate >= lmtdStart.clone().startOf("day").toDate() &&
      parsedDate <= lmtdEnd.clone().endOf("day").toDate();

    const inFtd = row.activation_date_raw === ftdRawDate;

    const inLastThree = [k1, k2, k3].includes(yearMonth);

    // raw + flags based on selected date range only
    if (inMtd) {
      totalRaw.totalRows += 1;
      totalRaw.totalVal += val;
      totalRaw.totalQty += qty;

      if (!inHierarchy) {
        hierarchyExcluded.rows += 1;
        hierarchyExcluded.totalVal += val;
        hierarchyExcluded.totalQty += qty;
      }
    }

    const matchedProduct =
      productByCode.get(normalizeCode(row.product_code)) ||
      productByModel.get(normalizeCode(row.model_no));

    // ==============================
    // SNAPSHOT FIRST
    // ==============================
    let resolvedPrice = safeNum(row.unit_price_snapshot);
    let resolvedSegment = normalizeSegment(row.segment_snapshot);

    // ==============================
    // FALLBACK FOR OLD DATA
    // ==============================
    if (!resolvedPrice || resolvedPrice <= 0) {
      resolvedPrice = matchedProduct?.price
        ? safeNum(matchedProduct.price)
        : qty > 0
        ? val / qty
        : 0;
    }

    if (!resolvedSegment) {
      resolvedSegment = normalizeSegment(
        matchedProduct?.segment || bucketFromPrice(resolvedPrice)
      );
    }

    // ==============================
    // FINAL SAFETY
    // ==============================
    if (!resolvedSegment || !PRICE_SEGMENTS.includes(resolvedSegment)) {
      if (inMtd) {
        unmappedProduct.rows += 1;
        unmappedProduct.totalVal += val;
        unmappedProduct.totalQty += qty;
      }
      continue;
    }

    if (!resolvedSegment || !PRICE_SEGMENTS.includes(resolvedSegment)) {
      if (inMtd) {
        unmappedProduct.rows += 1;
        unmappedProduct.totalVal += val;
        unmappedProduct.totalQty += qty;
      }
      continue;
    }

    if (!inHierarchy && !isAdmin) {
      continue;
    }

    const bucket = ensureBucket(segmentMap, resolvedSegment);

    if (yearMonth === k1) {
      bucket.m3Val += val;
      bucket.m3Qty += qty;
    }
    if (yearMonth === k2) {
      bucket.m2Val += val;
      bucket.m2Qty += qty;
    }
    if (yearMonth === k3) {
      bucket.m1Val += val;
      bucket.m1Qty += qty;
    }

    if (inMtd) {
      bucket.mtdVal += val;
      bucket.mtdQty += qty;
    }

    if (inLmtd) {
      bucket.lmtdVal += val;
      bucket.lmtdQty += qty;
    }

    if (inFtd) {
      bucket.ftdVal += val;
      bucket.ftdQty += qty;
    }
  }

  return formatSegmentTable({
    segmentMap,
    totalRaw,
    unmappedProduct,
    hierarchyExcluded,
    isAdmin,
    monthKeys: { k1, k2, k3 },
    endDate,
    segmentOrder: PRICE_SEGMENTS,
  });
};

// -----------------------------
// 40K split
// -----------------------------
exports.getPrice40kSplitSummaryActivation = async (
  dealerCodes,
  startDate,
  endDate,
  lmtdStart,
  lmtdEnd,
  ftdRawDate,
  lastThreeMonths,
  extraMatch,
  isAdmin
) => {
  const safeDealerCodes = (dealerCodes || []).map(normalizeCode);
  const dealerSet = new Set(safeDealerCodes);

  const segmentOrder = ["40K", ">40K"];
  const k1 = lastThreeMonths[0];
  const k2 = lastThreeMonths[1];
  const k3 = lastThreeMonths[2];

  const activationMatch = {
    year_month: { $in: [...new Set([...lastThreeMonths, startDate.format("YYYY-MM"), lmtdStart.format("YYYY-MM")])] },
  };

  if (extraMatch && Object.keys(extraMatch).length > 0) {
    Object.assign(activationMatch, extraMatch);
  }

  if (!isAdmin && safeDealerCodes.length > 0) {
    activationMatch.tertiary_buyer_code = { $in: safeDealerCodes };
  }

  if (!isAdmin && safeDealerCodes.length === 0) {
    return formatSegmentTable({
      segmentMap: {},
      totalRaw: {},
      unmappedProduct: {},
      hierarchyExcluded: {},
      isAdmin,
      monthKeys: { k1, k2, k3 },
      endDate,
      segmentOrder,
    });
  }

  const rows = await ActivationData.find(activationMatch).lean();

  const segmentMap = {};
  const totalRaw = { totalRows: 0, totalVal: 0, totalQty: 0 };
  const hierarchyExcluded = { rows: 0, totalVal: 0, totalQty: 0 };

  for (const row of rows) {
    const parsedDate = parseActivationRawDate(row.activation_date_raw);
    if (!parsedDate) continue;

    const qty = safeNum(row.qty);
    const val = safeNum(row.val);
    const buyerCode = normalizeCode(row.tertiary_buyer_code);
    const yearMonth = row.year_month;

    const inHierarchy = isAdmin ? true : dealerSet.has(buyerCode);

    const inMtd =
      parsedDate >= startDate.clone().startOf("day").toDate() &&
      parsedDate <= endDate.clone().endOf("day").toDate();

    const inLmtd =
      parsedDate >= lmtdStart.clone().startOf("day").toDate() &&
      parsedDate <= lmtdEnd.clone().endOf("day").toDate();

    const inFtd = row.activation_date_raw === ftdRawDate;

    if (inMtd) {
      totalRaw.totalRows += 1;
      totalRaw.totalVal += val;
      totalRaw.totalQty += qty;

      if (!inHierarchy) {
        hierarchyExcluded.rows += 1;
        hierarchyExcluded.totalVal += val;
        hierarchyExcluded.totalQty += qty;
      }
    }

    if (!inHierarchy && !isAdmin) continue;

    const unitPrice = qty > 0 ? val / qty : 0;
    const resolvedSegment = unitPrice <= 40000 ? "40K" : ">40K";

    const bucket = ensureBucket(segmentMap, resolvedSegment);

    if (yearMonth === k1) {
      bucket.m3Val += val;
      bucket.m3Qty += qty;
    }
    if (yearMonth === k2) {
      bucket.m2Val += val;
      bucket.m2Qty += qty;
    }
    if (yearMonth === k3) {
      bucket.m1Val += val;
      bucket.m1Qty += qty;
    }

    if (inMtd) {
      bucket.mtdVal += val;
      bucket.mtdQty += qty;
    }

    if (inLmtd) {
      bucket.lmtdVal += val;
      bucket.lmtdQty += qty;
    }

    if (inFtd) {
      bucket.ftdVal += val;
      bucket.ftdQty += qty;
    }
  }

  return formatSegmentTable({
    segmentMap,
    totalRaw,
    unmappedProduct: {},
    hierarchyExcluded,
    isAdmin,
    monthKeys: { k1, k2, k3 },
    endDate,
    segmentOrder,
  });
};
