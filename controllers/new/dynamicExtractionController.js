
const ActivationData = require("../../model/ActivationData");
const ExtractionRecord = require("../../model/ExtractionRecord");
const Product = require("../../model/ProductMaster");
const User = require("../../model/User");
const HierarchyEntries = require("../../model/HierarchyEntries");
const ActorTypesHierarchy = require("../../model/ActorTypesHierarchy");
const { resolveScope, resolveFlowHierarchy } = require("../../services/resolvers");


/////////////////////////////
// master extraction
/////////////////////////////
// controllers/extraction/extractionGroupingController.js

exports.getExtractionGroupingOptions = async (req, res) => {
  try {
    const defaultHierarchy = await ActorTypesHierarchy.findOne({
      name: "default_sales_flow",
    }).lean();

    const actorPositions = Array.isArray(defaultHierarchy?.hierarchy)
      ? defaultHierarchy.hierarchy
      : ["smd", "zsm", "asm", "mdd", "tse", "dealer"];

    return res.status(200).json({
      success: true,
      groupByOptions: [
        { label: "Price Segment", value: "price_segment" },
        { label: "Actor", value: "actor" },
        { label: "Zone", value: "zone" },
        { label: "District", value: "district" },
        { label: "Town", value: "town" },
        { label: "Category", value: "category" },
        { label: "Top Outlet", value: "top_outlet" },
      ],
      actorPositions: actorPositions.map((p) => ({
        label: String(p).toUpperCase(),
        value: p,
      })),
      filterOptions: [
        { label: "Zone", value: "zone" },
        { label: "District", value: "district" },
        { label: "Town", value: "town" },
        { label: "Category", value: "category" },
        { label: "Top Outlet", value: "top_outlet" },
        { label: "Actor", value: "actor" },
      ],
    });
  } catch (error) {
    console.error("Error in getExtractionGroupingOptions:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch grouping options",
    });
  }
};

// controllers/extraction/extractionGroupingController.js

function cleanUnique(values = []) {
  return [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))].sort();
}

function parseJsonObject(value) {
  if (!value) return {};

  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string") return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

// exports.getExtractionFilterValues = async (req, res) => {
//   try {
//     const { type, position, flow_name = "default_sales_flow" } = req.query;
//     const subordinate_filters = parseJsonObject(req.query.subordinate_filters);
//     const dealer_filters = parseJsonObject(req.query.dealer_filters);
//     console.log("Extraction subprdinate filter: ", subordinate_filters)

//     if (!type) {
//       return res.status(400).json({
//         success: false,
//         message: "type is required",
//       });
//     }

//     // actor dropdown values
//     if (type === "actor") {
//       if (!position) {
//         return res.status(400).json({
//           success: false,
//           message: "position is required when type=actor",
//         });
//       }

//       const hierarchy = await resolveFlowHierarchy(flow_name);
//       const normalizedPosition = String(position).trim().toLowerCase();

//       if (!hierarchy.includes(normalizedPosition)) {
//         return res.status(400).json({
//           success: false,
//           message: `Invalid actor position: ${position}`,
//         });
//       }

//       const scopedCodes = await resolveScope({
//         user: req.user,
//         flow_name,
//         subordinate_filters,
//         dealer_filters,
//         exclude_positions: [],
//       });

//       const actorCodes = cleanUnique(scopedCodes?.[normalizedPosition] || []);

//       const actorUsers = await User.find({
//         code: { $in: actorCodes },
//         status: "active",
//       })
//         .select("name code position")
//         .lean();

//       const userMap = new Map(
//         actorUsers.map((user) => [String(user.code || "").trim(), user])
//       );

//       return res.status(200).json({
//         success: true,
//         type,
//         values: actorCodes.map((code) => {
//           const user = userMap.get(code);
//           const displayName = user?.name || code;

//           return {
//             label: `${displayName} (${code})`,
//             name: displayName,
//             code,
//             position: user?.position || normalizedPosition,
//             value: code,
//           };
//         }),
//       });
//     }

//     // dealer-based filter dropdowns
//     const dealerQuery = {
//       role: "dealer",
//       status: "active",
//     };

//     const scopedCodes = await resolveScope({
//       user: req.user,
//       flow_name,
//       subordinate_filters,
//       dealer_filters,
//       exclude_positions: [],
//     });

//     const dealerCodes = cleanUnique(scopedCodes?.dealer || []);
//     dealerQuery.code = { $in: dealerCodes };

//     let projection = "";
//     if (type === "zone") projection = "zone";
//     else if (type === "district") projection = "district";
//     else if (type === "town") projection = "town";
//     else if (type === "category") projection = "category";
//     else if (type === "top_outlet") projection = "top_outlet";
//     else {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid type",
//       });
//     }

//     const rows = await User.find(dealerQuery).select(projection).lean();

//     let values = [];

//     if (type === "top_outlet") {
//       values = [
//         { label: "Yes", value: true },
//         { label: "No", value: false },
//       ];
//     } else {
//       const fieldValues = cleanUnique(rows.map((r) => r[type]));
//       values = fieldValues.map((v) => ({
//         label: v,
//         value: v,
//       }));
//     }

//     console.log("Ext5action filter res: ", type, values)

//     return res.status(200).json({
//       success: true,
//       type,
//       values,
//     });
//   } catch (error) {
//     console.error("Error in getExtractionFilterValues:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to fetch filter values",
//     });
//   }
// };



// controllers/extraction/dynamicExtractionReportController.js

exports.getExtractionFilterValues = async (req, res) => {
  const requestStart = Date.now();

  const logStep = (label, extra = {}) => {
    console.log(`⏱ [getExtractionFilterValues] ${label}`, {
      elapsedMs: Date.now() - requestStart,
      type: req.query.type,
      position: req.query.position,
      ...extra,
    });
  };

  console.log("🔥 FILTER API HIT:", {
    time: new Date().toISOString(),
    type: req.query.type,
    position: req.query.position,
    flow_name: req.query.flow_name || "default_sales_flow",
  });

  try {
    logStep("START");

    const parseStart = Date.now();
    const { type, position, flow_name = "default_sales_flow" } = req.query;
    const subordinate_filters = parseJsonObject(req.query.subordinate_filters);
    const dealer_filters = parseJsonObject(req.query.dealer_filters);

    console.log("⏱ [getExtractionFilterValues] PARSE_DONE", {
      parseMs: Date.now() - parseStart,
      elapsedMs: Date.now() - requestStart,
      type,
      position,
      flow_name,
      subordinateFilterKeys: Object.keys(subordinate_filters || {}),
      dealerFilterKeys: Object.keys(dealer_filters || {}),
    });

    if (!type) {
      logStep("EARLY_RETURN_MISSING_TYPE");
      return res.status(400).json({
        success: false,
        message: "type is required",
      });
    }


    if (type === "top_outlet") {
      logStep("EARLY_RETURN_TOP_OUTLET_STATIC");
      return res.status(200).json({
        success: true,
        type,
        values: [
          { label: "Yes", value: true },
          { label: "No", value: false },
        ],
      });
    }

    

    const scopeStart = Date.now();
    const scopedCodes = await resolveScope({
      user: req.user,
      flow_name,
      subordinate_filters,
      dealer_filters,
      exclude_positions: [],
    });

    console.log("⏱ [getExtractionFilterValues] RESOLVE_SCOPE_DONE", {
      resolveScopeMs: Date.now() - scopeStart,
      elapsedMs: Date.now() - requestStart,
      scopedKeys: Object.keys(scopedCodes || {}),
      dealerCount: scopedCodes?.dealer?.length || 0,
    });



    const validTypeCheckStart = Date.now();
    const isValidDealerType = ["zone", "district", "town", "category", "top_outlet"].includes(type);

    console.log("⏱ [getExtractionFilterValues] DEALER_TYPE_CHECK_DONE", {
      validTypeCheckMs: Date.now() - validTypeCheckStart,
      elapsedMs: Date.now() - requestStart,
      isValidDealerType,
    });

    if (!isValidDealerType) {
      logStep("EARLY_RETURN_INVALID_TYPE");
      return res.status(400).json({
        success: false,
        message: "Invalid type",
      });
    }

    const dealerCodesStart = Date.now();
    const dealerCodes = cleanUnique(scopedCodes?.dealer || []);

    console.log("⏱ [getExtractionFilterValues] DEALER_CODES_READY", {
      dealerCodesMs: Date.now() - dealerCodesStart,
      elapsedMs: Date.now() - requestStart,
      dealerCount: dealerCodes.length,
    });

    if (!dealerCodes.length) {
      logStep("EARLY_RETURN_NO_DEALER_CODES");
      return res.status(200).json({
        success: true,
        type,
        values: [],
      });
    }

    const dealerQueryBuildStart = Date.now();
    const dealerQuery = {
      role: "dealer",
      status: "active",
      code: { $in: dealerCodes },
    };

    console.log("⏱ [getExtractionFilterValues] DEALER_QUERY_BUILT", {
      dealerQueryBuildMs: Date.now() - dealerQueryBuildStart,
      elapsedMs: Date.now() - requestStart,
      dealerCount: dealerCodes.length,
      distinctField: type,
    });

    const distinctStart = Date.now();
    const fieldValues = await User.distinct(type, dealerQuery);

    console.log("⏱ [getExtractionFilterValues] DEALER_DISTINCT_DONE", {
      distinctMs: Date.now() - distinctStart,
      elapsedMs: Date.now() - requestStart,
      rawFieldValuesCount: fieldValues.length,
      distinctField: type,
    });

    const mapValuesStart = Date.now();
    const values = fieldValues
      .filter(Boolean)
      .map((v) => ({
        label: v,
        value: v,
      }));

    console.log("⏱ [getExtractionFilterValues] DEALER_VALUES_BUILT", {
      buildValuesMs: Date.now() - mapValuesStart,
      elapsedMs: Date.now() - requestStart,
      valuesCount: values.length,
    });

    logStep("DEALER_RESPONSE_SENT", {
      totalMs: Date.now() - requestStart,
    });

    return res.status(200).json({
      success: true,
      type,
      values,
    });
  } catch (error) {
    console.error("❌ Error in getExtractionFilterValues:", {
      message: error.message,
      stack: error.stack,
      elapsedMs: Date.now() - requestStart,
      type: req.query.type,
      position: req.query.position,
    });

    return res.status(500).json({
      success: false,
      message: "Failed to fetch filter values",
    });
  }
};


const ACTOR_LEVELS = ["smd", "zsm", "asm", "mdd", "tse", "dealer"];
const DEALER_META_FIELDS = ["zone", "district", "town", "category", "top_outlet"];

const BRAND_COLUMNS = [
  "Samsung",
  "Vivo",
  "Oppo",
  "Xiaomi",
  "Apple",
  "OnePlus",
  "Realme",
  "Motorola",
];

const SEGMENT_ORDER_MAP = {
  "0-6": 0,
  "6-10": 1,
  "10-20": 2,
  "20-30": 3,
  "30-40": 4,
  "40-70": 5,
  "70-100": 6,
  "100-120": 7,
  "120": 8,
};

const PRICE_CLASS_MAP = {
  0: "0-6",
  1: "6-10",
  2: "10-20",
  3: "20-30",
  4: "30-40",
  5: "40-70",
  6: "70-100",
  7: "100-120",
  8: "120",
};

function parseISTDate(dateStr) {
  const [year, month, day] = dateStr.split("T")[0].split("-").map(Number);
  const istDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  return new Date(istDate.getTime() - IST_OFFSET_MS);
}

function parseActivationRawDate(raw) {
  if (!raw || typeof raw !== "string") return null;
  const parts = raw.split("/");
  if (parts.length !== 3) return null;

  let [month, day, year] = parts.map((x) => parseInt(x, 10));
  if (!month || !day || year === undefined || Number.isNaN(year)) return null;
  if (year < 100) year += 2000;

  const istDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  return new Date(istDate.getTime() - IST_OFFSET_MS);
}

function getYearMonthRange(start, end) {
  const months = [];
  const current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));

  while (current <= last) {
    const y = current.getUTCFullYear();
    const m = String(current.getUTCMonth() + 1).padStart(2, "0");
    months.push(`${y}-${m}`);
    current.setUTCMonth(current.getUTCMonth() + 1);
  }

  return months;
}

function bucketFromPrice(price) {
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

function normalizeSegment(seg) {
  if (!seg) return "";
  return String(seg).trim().replace(/\s+/g, "");
}

function normalizeBrand(brand) {
  const value = String(brand || "").trim().toLowerCase();
  const found = BRAND_COLUMNS.find((b) => b.toLowerCase() === value);
  return found || "Others";
}

function getRequestedValues(raw) {
  if (raw === undefined || raw === null || raw === "") return [];
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v).trim()).filter(Boolean);
  }
  return String(raw)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function toBool(val) {
  if (val === true || val === "true" || val === "1") return true;
  if (val === false || val === "false" || val === "0") return false;
  return null;
}

function buildEmptyRow(groupLabel) {
  const row = {
    Group: groupLabel,
    "Rank of Samsung": null,
  };

  BRAND_COLUMNS.concat("Others").forEach((b) => {
    row[b] = 0;
  });

  row.Total = 0;
  return row;
}

exports.getDynamicExtractionReportForAdmin = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      segment,
      brand,
      metric = "volume",
      view = "default",
      groupBy = "price_segment",
      groupPosition,
    } = req.query;

    const isAdmin = ["admin", "super_admin"].includes(req.user?.role);

    // -----------------------------
    // date range
    // -----------------------------
    let start, end;

    if (startDate) {
      start = parseISTDate(startDate);
    } else {
      const now = new Date();
      const y = now.getUTCFullYear();
      const m = now.getUTCMonth() + 1;
      start = parseISTDate(`${y}-${String(m).padStart(2, "0")}-01`);
    }

    if (endDate) {
      end = parseISTDate(endDate);
      end.setUTCHours(23, 59, 59, 999);
    } else {
      const now = new Date();
      const y = now.getUTCFullYear();
      const m = now.getUTCMonth() + 1;
      const lastDay = new Date(y, m, 0).getDate();
      end = parseISTDate(`${y}-${String(m).padStart(2, "0")}-${lastDay}`);
      end.setUTCHours(23, 59, 59, 999);
    }

    // -----------------------------
    // actor filters from hierarchy
    // -----------------------------
    const hierarchyFilters = {};
    for (const level of ACTOR_LEVELS) {
      const values = getRequestedValues(req.query[level]);
      if (values.length) hierarchyFilters[level] = { $in: values };
    }

    // -----------------------------
    // dealer meta filters from User
    // -----------------------------
    const dealerMetaFilters = {};
    const zones = getRequestedValues(req.query.zone);
    const districts = getRequestedValues(req.query.district);
    const towns = getRequestedValues(req.query.town);
    const categories = getRequestedValues(req.query.category);
    const topOutletRaw = req.query.top_outlet;

    if (zones.length) dealerMetaFilters.zone = { $in: zones };
    if (districts.length) dealerMetaFilters.district = { $in: districts };
    if (towns.length) dealerMetaFilters.town = { $in: towns };
    if (categories.length) dealerMetaFilters.category = { $in: categories };

    const topOutletBool = toBool(topOutletRaw);
    if (topOutletBool !== null) {
      dealerMetaFilters.top_outlet = topOutletBool;
    }

    // -----------------------------
    // find filtered dealer universe
    // -----------------------------
    let hierarchyDealerCodes = [];
    if (Object.keys(hierarchyFilters).length > 0) {
      const matchingHierarchyRows = await HierarchyEntries.find({
        hierarchy_name: "default_sales_flow",
        ...hierarchyFilters,
      })
        .select("dealer")
        .lean();

      hierarchyDealerCodes = [
        ...new Set(matchingHierarchyRows.map((r) => r.dealer).filter(Boolean)),
      ];
    }

    let metaDealerCodes = [];
    if (Object.keys(dealerMetaFilters).length > 0) {
      const matchingDealers = await User.find({
        role: "dealer",
        ...dealerMetaFilters,
      })
        .select("code")
        .lean();

      metaDealerCodes = [
        ...new Set(matchingDealers.map((r) => r.code).filter(Boolean)),
      ];
    }

    let dealerFilter = [];

    if (hierarchyDealerCodes.length && metaDealerCodes.length) {
      const hSet = new Set(hierarchyDealerCodes);
      dealerFilter = metaDealerCodes.filter((d) => hSet.has(d));
    } else if (hierarchyDealerCodes.length) {
      dealerFilter = hierarchyDealerCodes;
    } else if (metaDealerCodes.length) {
      dealerFilter = metaDealerCodes;
    } else {
      dealerFilter = [];
    }

    // if filters were explicitly applied but no dealer matched
    const explicitDealerScopedFilters =
      Object.keys(hierarchyFilters).length > 0 || Object.keys(dealerMetaFilters).length > 0;

    if (explicitDealerScopedFilters && dealerFilter.length === 0) {
      return res.status(200).json({
        success: true,
        metricUsed: metric,
        viewUsed: view,
        groupByUsed: groupBy,
        groupPositionUsed: groupPosition || null,
        data: [],
        dealerFilter: [],
        message: "No dealers found for applied filters",
      });
    }

    // -----------------------------
    // preload user maps
    // -----------------------------
    const allRelevantDealerCodes = new Set();
    dealerFilter.forEach((d) => allRelevantDealerCodes.add(d));

    // We also add all hierarchy dealers if admin and no explicit dealer filter,
    // but actual data-first admin behavior will still allow unmapped data later.
    const dealerUsers = await User.find({ role: "dealer" })
      .select("code name zone district town category top_outlet")
      .lean();

    const dealerUserMap = new Map();
    dealerUsers.forEach((u) => dealerUserMap.set(u.code, u));

    const hierarchyRows = await HierarchyEntries.find({
      hierarchy_name: "default_sales_flow",
    }).lean();

    const dealerToHierarchyMap = new Map();
    hierarchyRows.forEach((row) => {
      if (row.dealer) {
        dealerToHierarchyMap.set(row.dealer, row);
      }
    });

    // actor name lookup from User model
    const actorCodes = new Set();
    hierarchyRows.forEach((row) => {
      ACTOR_LEVELS.forEach((level) => {
        if (row[level]) actorCodes.add(row[level]);
      });
    });

    const actorUsers = await User.find({
      code: { $in: [...actorCodes] },
    })
      .select("code name position")
      .lean();

    const actorUserMap = new Map();
    actorUsers.forEach((u) => actorUserMap.set(u.code, u));

    // -----------------------------
    // group resolver
    // -----------------------------
    function resolveGroupLabel({ dealerCode, segmentValue }) {
      if (groupBy === "price_segment") {
        return segmentValue || "Unmapped";
      }

      const dealerMeta = dealerUserMap.get(dealerCode) || null;
      const hierarchy = dealerToHierarchyMap.get(dealerCode) || null;

      if (groupBy === "actor") {
        const position = String(groupPosition || "").trim().toLowerCase();
        if (!position || !ACTOR_LEVELS.includes(position)) return "Unmapped";
        const actorCode = hierarchy?.[position];
        if (!actorCode) return "Unmapped";

        const actorUser = actorUserMap.get(actorCode);
        if (actorUser?.name) return `${actorUser.name} (${actorCode})`;
        return actorCode;
      }

      if (groupBy === "zone") return dealerMeta?.zone || "Unmapped";
      if (groupBy === "district") return dealerMeta?.district || "Unmapped";
      if (groupBy === "town") return dealerMeta?.town || "Unmapped";
      if (groupBy === "category") return dealerMeta?.category || "Unmapped";
      if (groupBy === "top_outlet") {
        if (dealerMeta?.top_outlet === true) return "Top Outlet";
        if (dealerMeta?.top_outlet === false) return "Non Top Outlet";
        return "Unmapped";
      }

      return "Unmapped";
    }

    // -----------------------------
    // aggregation buckets
    // -----------------------------
    const groupedMap = new Map();

    function addToGroup(groupLabel, brandLabel, value) {
      if (!groupedMap.has(groupLabel)) {
        groupedMap.set(groupLabel, buildEmptyRow(groupLabel));
      }

      const row = groupedMap.get(groupLabel);
      const safeBrand = BRAND_COLUMNS.includes(brandLabel) ? brandLabel : "Others";
      row[safeBrand] += Number(value) || 0;
      row.Total += Number(value) || 0;
    }

    // ============================================================
    // STEP A: Samsung from ActivationData
    // ============================================================
    const yearMonths = getYearMonthRange(start, end);

    const samsungActivationMatch = {
      year_month: { $in: yearMonths },
    };

    if (dealerFilter.length > 0) {
      samsungActivationMatch.tertiary_buyer_code = { $in: dealerFilter };
    }

    let samsungRows = [];
    if (!brand || String(brand).toLowerCase() === "samsung") {
      samsungRows = await ActivationData.find(samsungActivationMatch).lean();
    }

    samsungRows = samsungRows.filter((row) => {
      const parsedDate = parseActivationRawDate(row.activation_date_raw);
      if (!parsedDate) return false;
      return parsedDate >= start && parsedDate <= end;
    });

    const samsungProductCodes = [
      ...new Set(samsungRows.map((r) => r.product_code).filter(Boolean)),
    ];
    const samsungModelCodes = [
      ...new Set(samsungRows.map((r) => r.model_no).filter(Boolean)),
    ];

    const samsungProducts = await Product.find({
      brand: { $regex: /^samsung$/i },
      $or: [
        { product_code: { $in: samsungProductCodes } },
        { model_code: { $in: samsungModelCodes } },
      ],
    }).lean();

    const productByCode = new Map();
    const productByModel = new Map();

    samsungProducts.forEach((p) => {
      if (p.product_code) productByCode.set(String(p.product_code).trim(), p);
      if (p.model_code) productByModel.set(String(p.model_code).trim(), p);
    });

    const requestedSegment = normalizeSegment(segment);

    for (const row of samsungRows) {
      const qty = Number(row.qty) || 0;
      const val = Number(row.val) || 0;
      if (metric === "volume" && qty <= 0) continue;

      const dealerCode = row.tertiary_buyer_code;
      const matchedProduct =
        productByCode.get(String(row.product_code || "").trim()) ||
        productByModel.get(String(row.model_no || "").trim());

      let resolvedSegment = "";
      if (matchedProduct?.segment) {
        resolvedSegment = normalizeSegment(matchedProduct.segment);
      }
      if (!resolvedSegment) {
        const derivedPrice = qty > 0 ? val / qty : 0;
        resolvedSegment = bucketFromPrice(derivedPrice);
      }

      if (requestedSegment && requestedSegment !== resolvedSegment) continue;

      const rowValue = metric === "value" ? val : qty;
      const groupLabel = resolveGroupLabel({
        dealerCode,
        segmentValue: resolvedSegment,
      });

      addToGroup(groupLabel, "Samsung", rowValue);
    }

    // ============================================================
    // STEP B: Other brands from ExtractionRecord
    // ============================================================
    const otherBrandsMatch = {
      createdAt: { $gte: start, $lte: end },
      brand: { $ne: "samsung" },
    };

    if (requestedSegment) {
      otherBrandsMatch.segment = requestedSegment;
    }

    if (brand && String(brand).toLowerCase() !== "samsung") {
      otherBrandsMatch.brand = { $regex: `^${brand}$`, $options: "i" };
    }

    if (dealerFilter.length > 0) {
      otherBrandsMatch.dealer = { $in: dealerFilter };
    }

    const otherBrandRows = await ExtractionRecord.find(otherBrandsMatch).lean();

    for (const row of otherBrandRows) {
      const dealerCode = row.dealer;
      const brandLabel = normalizeBrand(row.brand);
      const qty = Number(row.quantity) || 0;
      const amount =
        row.amount !== undefined && row.amount !== null
          ? Number(row.amount) || 0
          : (Number(row.price) || 0) * qty;

      const rowValue = metric === "value" ? amount : qty;

      const normalizedSeg = normalizeSegment(row.segment);
      const groupLabel = resolveGroupLabel({
        dealerCode,
        segmentValue: normalizedSeg,
      });

      addToGroup(groupLabel, brandLabel, rowValue);
    }

    // ============================================================
    // STEP C: Sort rows
    // ============================================================
    let response = [...groupedMap.values()];

    // special sorting for price segment
    if (groupBy === "price_segment") {
      response.sort((a, b) => {
        const aOrder = SEGMENT_ORDER_MAP[a.Group] ?? 999;
        const bOrder = SEGMENT_ORDER_MAP[b.Group] ?? 999;
        return aOrder - bOrder;
      });

      response = response.map((row) => ({
        ...row,
        "Price Class": row.Group,
      }));
    }

    // normal sort for non-price grouping
    if (groupBy !== "price_segment") {
      response.sort((a, b) => String(a.Group).localeCompare(String(b.Group)));
    }

    // ============================================================
    // STEP D: rank + share formatting
    // ============================================================
    response = response.map((row) => {
      const sortedBrands = Object.entries(row)
        .filter(([key]) => BRAND_COLUMNS.includes(key) || key === "Others")
        .sort(([, a], [, b]) => b - a);

      const samsungIndex = sortedBrands.findIndex(([b]) => b === "Samsung");
      row["Rank of Samsung"] = samsungIndex >= 0 ? samsungIndex + 1 : null;

      if (view === "share" && row.Total > 0) {
        BRAND_COLUMNS.concat("Others").forEach((b) => {
          row[b] = ((row[b] / row.Total) * 100).toFixed(2) + "%";
        });
        row.Total = "100.00";
      }

      return row;
    });

    // ============================================================
    // STEP E: Total row
    // ============================================================
    const totalRow = {
      ...(groupBy === "price_segment" ? { "Price Class": "Total" } : {}),
      Group: "Total",
      "Rank of Samsung": null,
    };

    BRAND_COLUMNS.concat("Others").forEach((b) => {
      totalRow[b] = response.reduce((sum, row) => sum + (parseFloat(row[b]) || 0), 0);
    });

    totalRow.Total = BRAND_COLUMNS.concat("Others").reduce(
      (sum, b) => sum + totalRow[b],
      0
    );

    const sortedTotalBrands = Object.entries(totalRow)
      .filter(([key]) => BRAND_COLUMNS.includes(key) || key === "Others")
      .sort(([, a], [, b]) => b - a);

    const samsungTotalIndex = sortedTotalBrands.findIndex(([b]) => b === "Samsung");
    totalRow["Rank of Samsung"] = samsungTotalIndex >= 0 ? samsungTotalIndex + 1 : null;

    if (view === "share" && totalRow.Total > 0) {
      BRAND_COLUMNS.concat("Others").forEach((b) => {
        totalRow[b] = ((totalRow[b] / totalRow.Total) * 100).toFixed(2) + "%";
      });
      totalRow.Total = "100.00";
    }

    response.push(totalRow);

    return res.status(200).json({
      success: true,
      metricUsed: metric,
      viewUsed: view,
      groupByUsed: groupBy,
      groupPositionUsed: groupPosition || null,
      data: response,
      dealerFilter,
    });
  } catch (error) {
    console.error("Error in getDynamicExtractionReportForAdmin:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};




/////////////////////////////
// master extraction
/////////////////////////////
