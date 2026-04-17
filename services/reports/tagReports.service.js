const moment = require("moment");
const Product = require("../../model/Product");
const ActivationData = require("../../model/ActivationData");
const SecondaryData = require("../../model/SecondaryData");
const TertiaryData = require("../../model/TertiaryData");
const DealerHierarchy = require("../../model/DealerHierarchy");

const MONTH_KEYS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const UNTAGGED_LABEL = "Untagged";

function safeNum(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeTagValue(value) {
  return String(value || "").trim();
}

function normalizeTagKey(value) {
  return normalizeTagValue(value).toLowerCase();
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function dedupeTagsCaseInsensitive(values = []) {
  const seen = new Set();
  const output = [];

  values.forEach((value) => {
    const cleaned = normalizeTagValue(value);
    const key = normalizeTagKey(cleaned);

    if (!cleaned || seen.has(key)) return;

    seen.add(key);
    output.push(cleaned);
  });

  return output;
}

function parseRawDate(raw) {
  if (!raw) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;

  const parts = String(raw).split("/");
  if (parts.length !== 3) return null;

  let [month, day, year] = parts.map((item) => parseInt(item, 10));
  if (!month || !day || Number.isNaN(year)) return null;
  if (year < 100) year += 2000;

  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function growthPct(current, previous) {
  const prev = safeNum(previous);
  if (!prev) return 0;
  return Number((((safeNum(current) - prev) / prev) * 100).toFixed(2));
}

function projectWMF(mtd, endDateMoment) {
  const elapsedDays = endDateMoment.date();
  const totalDays = endDateMoment.daysInMonth();
  if (!elapsedDays || elapsedDays <= 0) return 0;
  return Number(((safeNum(mtd) / elapsedDays) * totalDays).toFixed(2));
}

function initMonthlyBucket() {
  return {
    m3Qty: 0,
    m2Qty: 0,
    m1Qty: 0,
    mtdQty: 0,
    lmtdQty: 0,
    ftdQty: 0,
  };
}

function initYtdBucket() {
  const months = {};
  MONTH_KEYS.forEach((key) => {
    months[key] = 0;
  });

  return {
    months,
    ytd: 0,
  };
}

function getBucket(map, key, factory) {
  if (!map.has(key)) {
    map.set(key, factory());
  }

  return map.get(key);
}

function buildProductLabel(product) {
  const modelCode = String(product?.model_code || "").trim();
  const productName = String(product?.product_name || "").trim();

  if (modelCode && productName) return `${modelCode} - ${productName}`;
  return modelCode || productName || "Unknown Product";
}

async function getAvailableTags() {
  const products = await Product.find(
    { tags: { $exists: true, $ne: [] } },
    { tags: 1 }
  ).lean();

  const tags = [];
  products.forEach((product) => {
    if (Array.isArray(product?.tags)) {
      tags.push(...product.tags);
    }
  });

  return dedupeTagsCaseInsensitive(tags).sort((a, b) => a.localeCompare(b));
}

async function getProductCatalog() {
  const products = await Product.find(
    {},
    {
      product_code: 1,
      model_code: 1,
      product_name: 1,
      brand: 1,
      tags: 1,
      status: 1,
      sku: 1,
      model: 1,
    }
  ).lean();

  const byProductCode = new Map();
  const byModelCode = new Map();

  products.forEach((product) => {
    const normalizedProduct = {
      ...product,
      tags: dedupeTagsCaseInsensitive(Array.isArray(product?.tags) ? product.tags : []),
    };

    const codeKeys = [
      product?.product_code,
      product?.sku,
    ]
      .map(normalizeCode)
      .filter(Boolean);

    const modelKeys = [
      product?.model_code,
      product?.model,
    ]
      .map(normalizeCode)
      .filter(Boolean);

    codeKeys.forEach((key) => {
      if (!byProductCode.has(key)) {
        byProductCode.set(key, normalizedProduct);
      }
    });

    modelKeys.forEach((key) => {
      if (!byModelCode.has(key)) {
        byModelCode.set(key, normalizedProduct);
      }
    });
  });

  return { products, byProductCode, byModelCode };
}

function resolveProductForRow(row, dataType, catalog) {
  const { byProductCode, byModelCode } = catalog;

  if (dataType === "activation") {
    return (
      byProductCode.get(normalizeCode(row?.product_code)) ||
      byModelCode.get(normalizeCode(row?.model_no)) ||
      null
    );
  }

  return (
    byProductCode.get(normalizeCode(row?.sku)) ||
    byModelCode.get(normalizeCode(row?.model)) ||
    null
  );
}

function resolveMatchedTags(product, selectedTagKeys, selectedTagMap) {
  const productTags = dedupeTagsCaseInsensitive(Array.isArray(product?.tags) ? product.tags : []);

  if (!productTags.length) {
    return selectedTagKeys.size ? [] : [UNTAGGED_LABEL];
  }

  if (!selectedTagKeys.size) {
    return productTags;
  }

  return productTags
    .filter((tag) => selectedTagKeys.has(normalizeTagKey(tag)))
    .map((tag) => selectedTagMap.get(normalizeTagKey(tag)) || tag);
}

async function buildTagProductFilter(selectedTags = []) {
  const normalizedTags = dedupeTagsCaseInsensitive(selectedTags);
  if (!normalizedTags.length) {
    return {
      selectedTags: [],
      selectedTagKeys: new Set(),
      selectedTagMap: new Map(),
      matchClause: null,
    };
  }

  const selectedTagKeys = new Set(normalizedTags.map(normalizeTagKey));
  const selectedTagMap = new Map(
    normalizedTags.map((tag) => [normalizeTagKey(tag), tag])
  );

  const products = await Product.find(
    { tags: { $in: normalizedTags } },
    { product_code: 1, model_code: 1, sku: 1, model: 1 }
  ).lean();

  const productCodes = uniqueStrings(
    products.flatMap((product) => [product?.product_code, product?.sku].map(normalizeCode))
  );
  const modelCodes = uniqueStrings(
    products.flatMap((product) => [product?.model_code, product?.model].map(normalizeCode))
  );

  return {
    selectedTags: normalizedTags,
    selectedTagKeys,
    selectedTagMap,
    productCodes,
    modelCodes,
  };
}

function buildMatchClauseForDataType(dataType, tagFilter) {
  if (!tagFilter?.selectedTags?.length) return null;

  const clauses = [];

  if (dataType === "activation") {
    if (tagFilter.productCodes.length) {
      clauses.push({ product_code: { $in: tagFilter.productCodes } });
    }
    if (tagFilter.modelCodes.length) {
      clauses.push({ model_no: { $in: tagFilter.modelCodes } });
    }
  } else {
    if (tagFilter.productCodes.length) {
      clauses.push({ sku: { $in: tagFilter.productCodes } });
    }
    if (tagFilter.modelCodes.length) {
      clauses.push({ model: { $in: tagFilter.modelCodes } });
    }
  }

  if (!clauses.length) {
    return { _id: { $in: [] } };
  }

  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

async function getSecondaryMddCodes(dealerCodes = []) {
  const safeDealerCodes = dealerCodes.map(normalizeCode).filter(Boolean);
  if (!safeDealerCodes.length) return [];

  const mappings = await DealerHierarchy.find(
    { dealer_code: { $in: safeDealerCodes } },
    { beat_code: 1 }
  ).lean();

  return uniqueStrings(mappings.map((item) => normalizeCode(item?.beat_code)));
}

function getMonthlyConfig(reportType) {
  switch (reportType) {
    case "activation":
      return {
        model: ActivationData,
        dataType: "activation",
        dateField: "activation_date_raw",
        yearMonthField: "year_month",
        dealerField: "tertiary_buyer_code",
        qtyField: "qty",
        scopeType: "dealer",
        title: "Activation Volume By Tag",
      };
    case "tertiary":
      return {
        model: TertiaryData,
        dataType: "tertiary",
        dateField: "invoice_date_raw",
        yearMonthField: "year_month",
        dealerField: "dealer_code",
        qtyField: "qty",
        scopeType: "dealer",
        title: "Tertiary Volume By Tag",
      };
    case "secondary":
      return {
        model: SecondaryData,
        dataType: "secondary",
        dateField: "invoice_date_raw",
        yearMonthField: "year_month",
        dealerField: "mdd_code",
        qtyField: "qty",
        scopeType: "mdd",
        title: "Secondary Volume By Tag",
      };
    default:
      return null;
  }
}

async function fetchMonthlyRows({
  reportType,
  scopeCodes = [],
  startDate,
  lmtdStart,
  tagFilter,
  isAdmin = false,
}) {
  const config = getMonthlyConfig(reportType);
  if (!config) {
    throw new Error(`Unsupported monthly tag report type: ${reportType}`);
  }

  const safeScopeCodes = scopeCodes.map(normalizeCode).filter(Boolean);
  if (!isAdmin && !safeScopeCodes.length) return [];

  const match = {
    [config.yearMonthField]: {
      $in: [
        startDate.clone().subtract(3, "months").format("YYYY-MM"),
        startDate.clone().subtract(2, "months").format("YYYY-MM"),
        startDate.clone().subtract(1, "months").format("YYYY-MM"),
        startDate.format("YYYY-MM"),
        lmtdStart.format("YYYY-MM"),
      ],
    },
  };

  const scopeField = config.dealerField;
  if (!isAdmin && safeScopeCodes.length) {
    match[scopeField] = { $in: safeScopeCodes };
  }

  const tagMatch = buildMatchClauseForDataType(config.dataType, tagFilter);
  if (tagMatch) {
    Object.assign(match, tagMatch);
  }

  return config.model.find(match).lean();
}

function buildMonthlyRowsFromBuckets({
  bucketMap,
  rowLabel,
  monthKeys,
  endDate,
}) {
  const { k1, k2, k3, l1, l2, l3 } = monthKeys;

  const rows = Array.from(bucketMap.entries())
    .map(([groupKey, bucket]) => ({
      [rowLabel]: groupKey,
      [l1]: bucket.m3Qty || 0,
      [l2]: bucket.m2Qty || 0,
      [l3]: bucket.m1Qty || 0,
      MTD: bucket.mtdQty || 0,
      LMTD: bucket.lmtdQty || 0,
      FTD: bucket.ftdQty || 0,
      "G/D%": growthPct(bucket.mtdQty || 0, bucket.lmtdQty || 0),
      ExpAch: 0,
      WFM: projectWMF(bucket.mtdQty || 0, endDate),
    }))
    .sort((a, b) => String(a[rowLabel]).localeCompare(String(b[rowLabel])));

  const totalRow = {
    [rowLabel]: "Total",
    [l1]: 0,
    [l2]: 0,
    [l3]: 0,
    MTD: 0,
    LMTD: 0,
    FTD: 0,
    "G/D%": null,
    ExpAch: 0,
    WFM: 0,
  };

  rows.forEach((row) => {
    totalRow[l1] += safeNum(row[l1]);
    totalRow[l2] += safeNum(row[l2]);
    totalRow[l3] += safeNum(row[l3]);
    totalRow.MTD += safeNum(row.MTD);
    totalRow.LMTD += safeNum(row.LMTD);
    totalRow.FTD += safeNum(row.FTD);
    totalRow.ExpAch += safeNum(row.ExpAch);
    totalRow.WFM += safeNum(row.WFM);
  });

  if (rows.length) {
    rows.push(totalRow);
  }

  return rows;
}

async function buildGroupedMonthlyTagReport({
  reportType,
  scopeCodes = [],
  startDate,
  endDate,
  lmtdStart,
  lmtdEnd,
  ftdRawDate,
  lastThreeMonths,
  selectedTags = [],
  isAdmin = false,
  rowDimension = "tag",
  groupValue = null,
}) {
  const tagFilter = await buildTagProductFilter(selectedTags);
  const catalog = await getProductCatalog();
  const rows = await fetchMonthlyRows({
    reportType,
    scopeCodes,
    startDate,
    lmtdStart,
    tagFilter,
    isAdmin,
  });

  const rowLabel = rowDimension === "tag" ? "Tag" : "Product";
  const monthKeys = {
    k1: lastThreeMonths[0],
    k2: lastThreeMonths[1],
    k3: lastThreeMonths[2],
    l1: moment(lastThreeMonths[0], "YYYY-MM").format("MMM"),
    l2: moment(lastThreeMonths[1], "YYYY-MM").format("MMM"),
    l3: moment(lastThreeMonths[2], "YYYY-MM").format("MMM"),
  };
  const bucketMap = new Map();
  const drilldownTag = groupValue ? normalizeTagValue(groupValue) : null;

  const selectedTagKeys = tagFilter.selectedTagKeys || new Set();
  const selectedTagMap = tagFilter.selectedTagMap || new Map();

  rows.forEach((row) => {
    const config = getMonthlyConfig(reportType);
    const parsedDate = parseRawDate(row?.[config.dateField]);
    if (!parsedDate) return;

    const product = resolveProductForRow(row, config.dataType, catalog);
    const matchedTags = resolveMatchedTags(product, selectedTagKeys, selectedTagMap);
    if (!matchedTags.length) return;

    const groupKeys = rowDimension === "tag"
      ? matchedTags
      : drilldownTag && matchedTags.includes(drilldownTag)
        ? [buildProductLabel(product)]
        : [];

    if (!groupKeys.length) return;

    const qty = safeNum(row?.[config.qtyField]);
    const yearMonth = row?.[config.yearMonthField];

    const inMtd =
      parsedDate >= startDate.clone().startOf("day").toDate() &&
      parsedDate <= endDate.clone().endOf("day").toDate();

    const inLmtd =
      parsedDate >= lmtdStart.clone().startOf("day").toDate() &&
      parsedDate <= lmtdEnd.clone().endOf("day").toDate();

    const inFtd = String(row?.[config.dateField] || "") === ftdRawDate;

    groupKeys.forEach((groupKey) => {
      const bucket = getBucket(bucketMap, groupKey, initMonthlyBucket);

      if (yearMonth === monthKeys.k1) bucket.m3Qty += qty;
      if (yearMonth === monthKeys.k2) bucket.m2Qty += qty;
      if (yearMonth === monthKeys.k3) bucket.m1Qty += qty;
      if (inMtd) bucket.mtdQty += qty;
      if (inLmtd) bucket.lmtdQty += qty;
      if (inFtd) bucket.ftdQty += qty;
    });
  });

  const titlePrefix = groupValue ? `${groupValue} Products` : getMonthlyConfig(reportType).title;

  return {
    title: titlePrefix,
    metric: "volume",
    group_by: rowDimension,
    columns: [rowLabel, monthKeys.l1, monthKeys.l2, monthKeys.l3, "MTD", "LMTD", "FTD", "G/D%", "ExpAch", "WFM"],
    rows: buildMonthlyRowsFromBuckets({
      bucketMap,
      rowLabel,
      monthKeys,
      endDate,
    }),
    applied_tags: tagFilter.selectedTags,
  };
}

function getYtdConfig(reportType) {
  switch (reportType) {
    case "activation_vol_ytd":
    case "activation_vol_ytd_actual":
      return {
        model: ActivationData,
        dataType: "activation",
        dateField: "activation_date_raw",
        dealerField: "tertiary_buyer_code",
        qtyField: "qty",
        scopeType: "dealer",
        title:
          reportType === "activation_vol_ytd"
            ? "Activation Volume YTD By Tag"
            : "Activation Volume YTD Actual By Tag",
      };
    case "tertiary_vol_ytd":
    case "tertiary_vol_ytd_actual":
      return {
        model: TertiaryData,
        dataType: "tertiary",
        dateField: "invoice_date_raw",
        dealerField: "dealer_code",
        qtyField: "qty",
        scopeType: "dealer",
        title:
          reportType === "tertiary_vol_ytd"
            ? "Tertiary Volume YTD By Tag"
            : "Tertiary Volume YTD Actual By Tag",
      };
    default:
      return null;
  }
}

async function buildGroupedYtdTagReport({
  reportType,
  scopeCodes = [],
  selectedTags = [],
  isAdmin = false,
  rowDimension = "tag",
  groupValue = null,
}) {
  const config = getYtdConfig(reportType);
  if (!config) {
    throw new Error(`Unsupported YTD tag report type: ${reportType}`);
  }

  const tagFilter = await buildTagProductFilter(selectedTags);
  const catalog = await getProductCatalog();

  const indiaNow = moment.tz("Asia/Kolkata");
  const endDate = indiaNow.clone().subtract(1, "day").endOf("day");
  const startDate = endDate.clone().startOf("year");

  const query = {};
  if (!isAdmin) {
    if (!scopeCodes.length) {
      return {
        title: config.title,
        metric: "volume",
        group_by: rowDimension,
        columns: [rowDimension === "tag" ? "Tag" : "Product", ...MONTH_KEYS, "YTD"],
        rows: [],
        applied_tags: tagFilter.selectedTags,
      };
    }

    query[config.dealerField] = { $in: scopeCodes };
  }

  const tagMatch = buildMatchClauseForDataType(config.dataType, tagFilter);
  if (tagMatch) {
    Object.assign(query, tagMatch);
  }

  const rows = await config.model.find(query).lean();
  const selectedTagKeys = tagFilter.selectedTagKeys || new Set();
  const selectedTagMap = tagFilter.selectedTagMap || new Map();
  const bucketMap = new Map();
  const drilldownTag = groupValue ? normalizeTagValue(groupValue) : null;
  const rowLabel = rowDimension === "tag" ? "Tag" : "Product";

  rows.forEach((row) => {
    const parsedDate = parseRawDate(row?.[config.dateField]);
    if (!parsedDate || parsedDate < startDate.toDate() || parsedDate > endDate.toDate()) {
      return;
    }

    const product = resolveProductForRow(row, config.dataType, catalog);
    const matchedTags = resolveMatchedTags(product, selectedTagKeys, selectedTagMap);
    if (!matchedTags.length) return;

    const groupKeys = rowDimension === "tag"
      ? matchedTags
      : drilldownTag && matchedTags.includes(drilldownTag)
        ? [buildProductLabel(product)]
        : [];

    if (!groupKeys.length) return;

    const monthKey = MONTH_KEYS[parsedDate.getUTCMonth()];
    const qty = safeNum(row?.[config.qtyField]);

    groupKeys.forEach((groupKey) => {
      const bucket = getBucket(bucketMap, groupKey, initYtdBucket);
      bucket.months[monthKey] += qty;
      bucket.ytd += qty;
    });
  });

  const rowsOut = Array.from(bucketMap.entries())
    .map(([groupKey, bucket]) => {
      const row = { [rowLabel]: groupKey };
      MONTH_KEYS.forEach((monthKey) => {
        row[monthKey] = bucket.months[monthKey] || 0;
      });
      row.YTD = bucket.ytd || 0;
      return row;
    })
    .sort((a, b) => String(a[rowLabel]).localeCompare(String(b[rowLabel])));

  const totalRow = { [rowLabel]: "Total" };
  MONTH_KEYS.forEach((monthKey) => {
    totalRow[monthKey] = rowsOut.reduce((sum, row) => sum + safeNum(row[monthKey]), 0);
  });
  totalRow.YTD = rowsOut.reduce((sum, row) => sum + safeNum(row.YTD), 0);

  if (rowsOut.length) {
    rowsOut.push(totalRow);
  }

  return {
    title: groupValue ? `${groupValue} Products` : config.title,
    metric: "volume",
    group_by: rowDimension,
    columns: [rowLabel, ...MONTH_KEYS, "YTD"],
    rows: rowsOut,
    applied_tags: tagFilter.selectedTags,
  };
}

async function getGroupedTagReport(params) {
  const { reportType } = params;

  if (["activation", "tertiary", "secondary"].includes(reportType)) {
    return buildGroupedMonthlyTagReport(params);
  }

  if (
    [
      "activation_value_ytd",
      "activation_vol_ytd",
      "tertiary_value_ytd",
      "tertiary_vol_ytd",
      "activation_value_ytd_actual",
      "activation_vol_ytd_actual",
      "tertiary_value_ytd_actual",
      "tertiary_vol_ytd_actual",
    ].includes(reportType)
  ) {
    return buildGroupedYtdTagReport(params);
  }

  if (reportType === "wod") {
    const sellIn = await buildGroupedMonthlyTagReport({
      ...params,
      reportType: "tertiary",
    });

    const sellOut = await buildGroupedMonthlyTagReport({
      ...params,
      reportType: "activation",
    });

    return {
      sellInWOD: {
        ...sellIn,
        title: params.groupValue ? sellIn.title : "Sell In WOD Volume By Tag",
      },
      sellOutWOD: {
        ...sellOut,
        title: params.groupValue ? sellOut.title : "Sell Out WOD Volume By Tag",
      },
    };
  }

  throw new Error(`Tag grouping is not supported for report type: ${reportType}`);
}

async function getTagDrilldownReport({
  reportType,
  dealerCodes = [],
  mddCodes = [],
  startDate,
  endDate,
  lmtdStart,
  lmtdEnd,
  ftdRawDate,
  lastThreeMonths = [],
  selectedTags = [],
  groupValue,
  sourceKey,
  isAdmin = false,
}) {
  if (!groupValue) {
    throw new Error("groupValue is required for tag drilldown");
  }

  const scopeCodes = reportType === "secondary" ? mddCodes : dealerCodes;

  if (reportType === "wod") {
    const effectiveType = sourceKey === "sellInWOD" ? "tertiary" : "activation";
    return buildGroupedMonthlyTagReport({
      reportType: effectiveType,
      scopeCodes: effectiveType === "secondary" ? mddCodes : dealerCodes,
      startDate,
      endDate,
      lmtdStart,
      lmtdEnd,
      ftdRawDate,
      lastThreeMonths,
      selectedTags,
      isAdmin,
      rowDimension: "product",
      groupValue,
    });
  }

  if (["activation", "tertiary", "secondary"].includes(reportType)) {
    return buildGroupedMonthlyTagReport({
      reportType,
      scopeCodes,
      startDate,
      endDate,
      lmtdStart,
      lmtdEnd,
      ftdRawDate,
      lastThreeMonths,
      selectedTags,
      isAdmin,
      rowDimension: "product",
      groupValue,
    });
  }

  return buildGroupedYtdTagReport({
    reportType,
    scopeCodes,
    selectedTags,
    isAdmin,
    rowDimension: "product",
    groupValue,
  });
}

module.exports = {
  UNTAGGED_LABEL,
  normalizeCode,
  dedupeTagsCaseInsensitive,
  getAvailableTags,
  buildTagProductFilter,
  buildMatchClauseForDataType,
  getSecondaryMddCodes,
  getGroupedTagReport,
  getTagDrilldownReport,
};
