const ActivationData = require("../../model/ActivationData");
const SecondaryData = require("../../model/SecondaryData");
const TertiaryData = require("../../model/TertiaryData");
const DealerHierarchy = require("../../model/DealerHierarchy");
const moment = require("moment");
const momentTz = require("moment-timezone");
const { resolveScope, resolveDropdownOptions } = require("../../services/resolvers");
const {
  getPriceSegmentSummaryActivation,
  getPrice40kSplitSummaryActivation,
} = require("../../services/reports/segments.service");
const {
  getActivationPaceYtdReports,
  getTertiaryPaceYtdReports,
  getAllPaceYtdReports,
} = require("../../services/reports/ytd.service");

const {
  getActivationActualYtdReports,
  getTertiaryActualYtdReports,
  getAllActualYtdReports,
} = require("../../services/reports/ytdActual.service");
const {
  getAvailableTags,
  buildTagProductFilter,
  buildMatchClauseForDataType,
  getGroupedTagReport,
  getTagDrilldownReport,
} = require("../../services/reports/tagReports.service");

function normalizeFilterArray(values) {
  if (!Array.isArray(values)) return [];

  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateDashboardSummaryRequest({
  start_date,
  end_date,
  flow_name,
  filters,
  subordinate_filters,
  dealer_filters,
}) {
  const allowedReportTypes = new Set([
    "activation",
    "tertiary",
    "secondary",
    "wod",
    "price_segment",
    "price_segment_40k",
    "activation_value_ytd",
    "activation_vol_ytd",
    "tertiary_value_ytd",
    "tertiary_vol_ytd",
    "ytd_all",
    "activation_value_ytd_actual",
    "activation_vol_ytd_actual",
    "tertiary_value_ytd_actual",
    "tertiary_vol_ytd_actual",
    "ytd_actual_all",
  ]);

  if (start_date && !moment(start_date, "YYYY-MM-DD", true).isValid()) {
    return "start_date must be in YYYY-MM-DD format";
  }

  if (end_date && !moment(end_date, "YYYY-MM-DD", true).isValid()) {
    return "end_date must be in YYYY-MM-DD format";
  }

  if (start_date && end_date) {
    const startDate = moment(start_date, "YYYY-MM-DD", true);
    const endDate = moment(end_date, "YYYY-MM-DD", true);

    if (startDate.isAfter(endDate)) {
      return "start_date cannot be after end_date";
    }
  }

  if (flow_name !== undefined && typeof flow_name !== "string") {
    return "flow_name must be a string";
  }

  if (!isPlainObject(filters)) {
    return "filters must be an object";
  }

  if (!allowedReportTypes.has(filters.report_type)) {
    return "filters.report_type is invalid";
  }

  if (subordinate_filters !== undefined && !isPlainObject(subordinate_filters)) {
    return "subordinate_filters must be an object";
  }

  if (dealer_filters !== undefined && !isPlainObject(dealer_filters)) {
    return "dealer_filters must be an object";
  }

  return null;
}

function mergeLegacySubordinateFilters(filters = {}, subordinateFilters = {}) {
  const mergedFilters = { ...subordinateFilters };
  const subordinateKeys = ["sh", "zsm", "asm", "mdd", "tse", "dealer"];

  subordinateKeys.forEach((key) => {
    if (Array.isArray(mergedFilters[key]) && mergedFilters[key].length) return;

    const legacyValues = normalizeFilterArray(filters[key]);
    if (legacyValues.length) {
      mergedFilters[key] = legacyValues;
    }
  });

  return mergedFilters;
}

function normalizeGroupBy(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeTagsFilter(values) {
  return normalizeFilterArray(values);
}

function canGroupByTag(reportType) {
  return new Set([
    "activation",
    "tertiary",
    "secondary",
    "wod",
    "activation_vol_ytd",
    "activation_vol_ytd_actual",
    "tertiary_vol_ytd",
    "tertiary_vol_ytd_actual",
  ]).has(reportType);
}

async function getBaseScopeData(req) {
  const {
    flow_name = "default_sales_flow",
    subordinate_filters = {},
    dealer_filters = {},
    filters = {},
  } = req.body;

  const effectiveSubordinateFilters = mergeLegacySubordinateFilters(
    filters,
    subordinate_filters
  );

  const effectiveDealerFilters = dealer_filters || {};

  return resolveDashboardReportScope({
    user: req.user,
    flow_name,
    subordinate_filters: effectiveSubordinateFilters,
    dealer_filters: effectiveDealerFilters,
  });
}

async function resolveDashboardReportScope({
  user,
  flow_name = "default_sales_flow",
  subordinate_filters = {},
  dealer_filters = {},
}) {
  const scope = await resolveScope({
    user,
    flow_name,
    subordinate_filters,
    dealer_filters,
    exclude_positions: [],
  });

  const dealerCodes = Array.isArray(scope?.dealer) ? scope.dealer : [];

  const secondaryMappings = dealerCodes.length
    ? await DealerHierarchy.find({
        dealer_code: { $in: dealerCodes },
      })
        .select("beat_code")
        .lean()
    : [];

  const mddCodes = [
    ...new Set(
      secondaryMappings
        .map((entry) => String(entry?.beat_code || "").trim())
        .filter(Boolean)
    ),
  ];

  return {
    scope,
    dealerCodes,
    mddCodes,
  };
}


// --------new helpers---------------

async function prepareDashboardSummaryContext(req) {
  let {
    start_date,
    end_date,
    flow_name = "default_sales_flow",
    filters = {},
    subordinate_filters = {},
    dealer_filters = {},
  } = req.body;

  const user = req.user;
  const reportType = filters?.report_type;
  const selectedTags = [];
  const groupBy = normalizeGroupBy(filters?.group_by);

  if (!reportType) {
    throw new Error("filters.report_type is required");
  }

  const validationError = validateDashboardSummaryRequest({
    start_date,
    end_date,
    flow_name,
    filters,
    subordinate_filters,
    dealer_filters,
  });

  if (validationError) {
    throw new Error(validationError);
  }

  const indiaNow = momentTz().tz("Asia/Kolkata");

  if (!start_date || !end_date) {
    const yesterday = indiaNow.clone().subtract(1, "day");
    start_date = yesterday.clone().startOf("month").format("YYYY-MM-DD");
    end_date = yesterday.format("YYYY-MM-DD");
  }

  const effectiveSubordinateFilters = mergeLegacySubordinateFilters(
    filters,
    subordinate_filters
  );

  const effectiveDealerFilters =
    dealer_filters && typeof dealer_filters === "object" && !Array.isArray(dealer_filters)
      ? dealer_filters
      : {};

  const {
    dealerCodes = [],
    mddCodes = [],
  } = await resolveDashboardReportScope({
    user,
    flow_name,
    subordinate_filters: effectiveSubordinateFilters,
    dealer_filters: effectiveDealerFilters,
  });

  const startDate = moment(start_date, "YYYY-MM-DD").startOf("day");
  const endDate = moment(end_date, "YYYY-MM-DD").endOf("day");

  const isFullMonth =
    startDate.date() === 1 &&
    endDate.date() === endDate.daysInMonth();

  let lmtdStart = startDate.clone().subtract(1, "month");
  let lmtdEnd = endDate.clone().subtract(1, "month");

  if (isFullMonth) {
    lmtdStart = lmtdStart.startOf("month");
    lmtdEnd = lmtdStart.clone().endOf("month");
  }

  const ftdRawDate = endDate.format("M/D/YY");

  const baseMonth = moment(startDate);
  const lastThreeMonths = [
    baseMonth.clone().subtract(3, "months").format("YYYY-MM"),
    baseMonth.clone().subtract(2, "months").format("YYYY-MM"),
    baseMonth.clone().subtract(1, "months").format("YYYY-MM"),
  ];

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const hasScopeFilters =
    Object.keys(effectiveSubordinateFilters).length > 0 ||
    Object.keys(effectiveDealerFilters).length > 0;
  const allowAdminBypass = isAdmin && !hasScopeFilters;

  return {
    user,
    flow_name,
    filters,
    reportType,
    groupBy,
    selectedTags,
    effectiveSubordinateFilters,
    effectiveDealerFilters,
    dealerCodes,
    mddCodes,
    startDate,
    endDate,
    lmtdStart,
    lmtdEnd,
    ftdRawDate,
    lastThreeMonths,
    allowAdminBypass,
  };
}

async function buildDashboardSummaryPayload(req) {
  const ctx = await prepareDashboardSummaryContext(req);
  const { data, groupedTagData, availableTags, isTagMode } =
    await buildDashboardReportByType(ctx);

  const payload = {
    success: true,
    flow_name: ctx.flow_name,
    report_type: ctx.reportType,
    applied_filters: {
      subordinate_filters: ctx.effectiveSubordinateFilters,
      dealer_filters: ctx.effectiveDealerFilters,
      tags: ctx.selectedTags,
      ...(isTagMode ? { group_by: "tag" } : {}),
    },
    available_tags: availableTags,
    [ctx.reportType]: data,
    ...(groupedTagData
      ? {
          tag_grouped: {
            [ctx.reportType]: groupedTagData,
          },
        }
      : {}),
  };

  return { ctx, payload };
}
// -----------new helpers------------------


// ------------new packer---------------------

async function buildDashboardReportByType(ctx) {
  const {
    reportType,
    groupBy,
    selectedTags,
    dealerCodes,
    mddCodes,
    startDate,
    endDate,
    lmtdStart,
    lmtdEnd,
    ftdRawDate,
    lastThreeMonths,
    allowAdminBypass,
  } = ctx;

  const activationTagMatch = null;
  const sellThroughTagMatch = null;

  let data = null;
  let groupedTagData = null;

  if (groupBy === "tag") {
    if (!canGroupByTag(reportType)) {
      throw new Error(`Tag grouping is not supported for report type ${reportType}`);
    }

    data = await getGroupedTagReport({
      reportType,
      dealerCodes,
      mddCodes,
      scopeCodes: reportType === "secondary" ? mddCodes : dealerCodes,
      startDate,
      endDate,
      lmtdStart,
      lmtdEnd,
      ftdRawDate,
      lastThreeMonths,
      selectedTags,
      isAdmin: allowAdminBypass,
    });

    return {
      data,
      groupedTagData: null,
      availableTags: [],
      isTagMode: true,
    };
  }

  switch (reportType) {
    case "activation":
      data = await buildReport(
        ActivationData,
        "activation_date_raw",
        "tertiary_buyer_code",
        dealerCodes,
        "val",
        "qty",
        lastThreeMonths,
        startDate,
        endDate,
        lmtdStart,
        lmtdEnd,
        ftdRawDate,
        true,
        activationTagMatch,
        allowAdminBypass
      );
      break;

    case "tertiary":
      data = await buildReport(
        TertiaryData,
        "invoice_date_raw",
        "dealer_code",
        dealerCodes,
        "net_value",
        "qty",
        lastThreeMonths,
        startDate,
        endDate,
        lmtdStart,
        lmtdEnd,
        ftdRawDate,
        true,
        sellThroughTagMatch,
        allowAdminBypass
      );
      break;

    case "secondary":
      data = await buildReport(
        SecondaryData,
        "invoice_date_raw",
        "mdd_code",
        mddCodes,
        "net_value",
        "qty",
        lastThreeMonths,
        startDate,
        endDate,
        lmtdStart,
        lmtdEnd,
        ftdRawDate,
        false,
        sellThroughTagMatch,
        allowAdminBypass
      );
      break;

    case "wod":
      data = await getWODSummary(
        dealerCodes,
        startDate,
        endDate,
        lmtdStart,
        lmtdEnd,
        ftdRawDate,
        lastThreeMonths,
        activationTagMatch,
        allowAdminBypass
      );
      break;

    case "price_segment":
      data = await getPriceSegmentSummaryActivation(
        dealerCodes,
        startDate,
        endDate,
        lmtdStart,
        lmtdEnd,
        ftdRawDate,
        lastThreeMonths,
        activationTagMatch,
        allowAdminBypass
      );
      break;

    case "price_segment_40k":
      data = await getPrice40kSplitSummaryActivation(
        dealerCodes,
        startDate,
        endDate,
        lmtdStart,
        lmtdEnd,
        ftdRawDate,
        lastThreeMonths,
        activationTagMatch,
        allowAdminBypass
      );
      break;

    case "activation_value_ytd":
      data = (await getActivationPaceYtdReports({
        ActivationData,
        dealerCodes,
        extraMatch: activationTagMatch,
        isAdmin: allowAdminBypass,
      })).activationValueYtd;
      break;

    case "activation_vol_ytd":
      data = (await getActivationPaceYtdReports({
        ActivationData,
        dealerCodes,
        extraMatch: activationTagMatch,
        isAdmin: allowAdminBypass,
      })).activationVolYtd;
      break;

    case "tertiary_value_ytd":
      data = (await getTertiaryPaceYtdReports({
        TertiaryData,
        dealerCodes,
        extraMatch: sellThroughTagMatch,
        isAdmin: allowAdminBypass,
      })).tertiaryValueYtd;
      break;

    case "tertiary_vol_ytd":
      data = (await getTertiaryPaceYtdReports({
        TertiaryData,
        dealerCodes,
        extraMatch: sellThroughTagMatch,
        isAdmin: allowAdminBypass,
      })).tertiaryVolYtd;
      break;

    case "ytd_all":
      data = await getAllPaceYtdReports({
        ActivationData,
        TertiaryData,
        dealerCodes,
        activationExtraMatch: activationTagMatch,
        tertiaryExtraMatch: sellThroughTagMatch,
        isAdmin: allowAdminBypass,
      });
      break;

    case "activation_value_ytd_actual":
      data = (await getActivationActualYtdReports({
        ActivationData,
        dealerCodes,
        extraMatch: activationTagMatch,
        isAdmin: allowAdminBypass,
      })).activationValueYtdActual;
      break;

    case "activation_vol_ytd_actual":
      data = (await getActivationActualYtdReports({
        ActivationData,
        dealerCodes,
        extraMatch: activationTagMatch,
        isAdmin: allowAdminBypass,
      })).activationVolYtdActual;
      break;

    case "tertiary_value_ytd_actual":
      data = (await getTertiaryActualYtdReports({
        TertiaryData,
        dealerCodes,
        extraMatch: sellThroughTagMatch,
        isAdmin: allowAdminBypass,
      })).tertiaryValueYtdActual;
      break;

    case "tertiary_vol_ytd_actual":
      data = (await getTertiaryActualYtdReports({
        TertiaryData,
        dealerCodes,
        extraMatch: sellThroughTagMatch,
        isAdmin: allowAdminBypass,
      })).tertiaryVolYtdActual;
      break;

    case "ytd_actual_all":
      data = await getAllActualYtdReports({
        ActivationData,
        TertiaryData,
        dealerCodes,
        activationExtraMatch: activationTagMatch,
        tertiaryExtraMatch: sellThroughTagMatch,
        isAdmin: allowAdminBypass,
      });
      break;

    default:
      throw new Error(
        "Invalid filters.report_type. Use: activation | tertiary | secondary | wod | price_segment | price_segment_40k | activation_value_ytd | activation_vol_ytd | tertiary_value_ytd | tertiary_vol_ytd | ytd_all | activation_value_ytd_actual | activation_vol_ytd_actual | tertiary_value_ytd_actual | tertiary_vol_ytd_actual | ytd_actual_all"
      );
  }

  if (canGroupByTag(reportType)) {
    groupedTagData = await getGroupedTagReport({
      reportType,
      dealerCodes,
      mddCodes,
      scopeCodes: reportType === "secondary" ? mddCodes : dealerCodes,
      startDate,
      endDate,
      lmtdStart,
      lmtdEnd,
      ftdRawDate,
      lastThreeMonths,
      selectedTags,
      isAdmin: allowAdminBypass,
    });
  }

  return {
    data,
    groupedTagData,
    availableTags: [],
    isTagMode: false,
  };
}
// -------------new packer-------------------------

exports.getDashboardSummary = async (req, res) => {
  try {
    const { payload } = await buildDashboardSummaryPayload(req);
    return res.json(payload);
  } catch (error) {
    console.error(error);
    const statusCode =
      error.message &&
      (
        error.message.includes("required") ||
        error.message.includes("invalid") ||
        error.message.includes("must be") ||
        error.message.includes("cannot be after") ||
        error.message.includes("not supported")
      )
        ? 400
        : 500;

    return res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getDashboardSummaryDrilldown = async (req, res) => {
  try {
    let {
      start_date,
      end_date,
      flow_name = "default_sales_flow",
      filters = {},
      subordinate_filters = {},
      dealer_filters = {},
      drilldown = {},
    } = req.body;

    const reportType = filters?.report_type;
    const selectedTags = normalizeTagsFilter(filters?.tags);
    const groupBy = normalizeGroupBy(filters?.group_by);
    const groupValue = String(drilldown?.group_value || "").trim();
    const sourceKey = String(drilldown?.source_key || "").trim();

    console.log("subordinates in sales DASH: ", subordinate_filters)

    if (!reportType) {
      return res.status(400).json({ success: false, message: "filters.report_type is required" });
    }

    if (groupBy !== "tag") {
      return res.status(400).json({ success: false, message: "filters.group_by must be 'tag' for drilldown" });
    }

    if (!groupValue) {
      return res.status(400).json({ success: false, message: "drilldown.group_value is required" });
    }

    const validationError = validateDashboardSummaryRequest({
      start_date,
      end_date,
      flow_name,
      filters,
      subordinate_filters,
      dealer_filters,
    });

    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const indiaNow = momentTz().tz("Asia/Kolkata");
    if (!start_date || !end_date) {
      const yesterday = indiaNow.clone().subtract(1, "day");
      start_date = yesterday.clone().startOf("month").format("YYYY-MM-DD");
      end_date = yesterday.format("YYYY-MM-DD");
    }

    const effectiveSubordinateFilters = mergeLegacySubordinateFilters(
      filters,
      subordinate_filters
    );
    const effectiveDealerFilters =
      dealer_filters && typeof dealer_filters === "object" && !Array.isArray(dealer_filters)
        ? dealer_filters
        : {};

    const { dealerCodes = [], mddCodes = [] } = await resolveDashboardReportScope({
      user: req.user,
      flow_name,
      subordinate_filters: effectiveSubordinateFilters,
      dealer_filters: effectiveDealerFilters,
    });

    const startDate = moment(start_date, "YYYY-MM-DD").startOf("day");
    const endDate = moment(end_date, "YYYY-MM-DD").endOf("day");
    let lmtdStart = startDate.clone().subtract(1, "month");
    let lmtdEnd = endDate.clone().subtract(1, "month");

    const isFullMonth =
      startDate.date() === 1 &&
      endDate.date() === endDate.daysInMonth();

    if (isFullMonth) {
      lmtdStart = lmtdStart.startOf("month");
      lmtdEnd = lmtdStart.clone().endOf("month");
    }

    const ftdRawDate = endDate.format("M/D/YY");
    const baseMonth = moment(startDate);
    const lastThreeMonths = [
      baseMonth.clone().subtract(3, "months").format("YYYY-MM"),
      baseMonth.clone().subtract(2, "months").format("YYYY-MM"),
      baseMonth.clone().subtract(1, "months").format("YYYY-MM"),
    ];

    const isAdmin = req.user?.role === "admin" || req.user?.role === "super_admin";
    const hasScopeFilters =
      Object.keys(effectiveSubordinateFilters).length > 0 ||
      Object.keys(effectiveDealerFilters).length > 0;

    const data = await getTagDrilldownReport({
      reportType,
      dealerCodes,
      mddCodes,
      startDate,
      endDate,
      lmtdStart,
      lmtdEnd,
      ftdRawDate,
      lastThreeMonths,
      selectedTags,
      groupValue,
      sourceKey,
      isAdmin: isAdmin && !hasScopeFilters,
    });

    return res.json({
      success: true,
      flow_name,
      report_type: reportType,
      drilldown: {
        group_by: "tag",
        group_value: groupValue,
        source_key: sourceKey || null,
      },
      applied_filters: {
        subordinate_filters: effectiveSubordinateFilters,
        dealer_filters: effectiveDealerFilters,
        tags: selectedTags,
      },
      data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: error.message });
  }
};



// ============================================
// GENERIC REPORT BUILDER
// ============================================
async function buildReport(
  Model,
  dateField,
  dealerField,
  codes,
  valueField,
  qtyField,
  lastThreeMonths,
  startDate,
  endDate,
  lmtdStart,
  lmtdEnd,
  ftdRawDate,
  includeWod,
  extraMatch = null,
  isAdmin = false
) {

  const safeCodes = Array.isArray(codes) ? codes : [];

  const result = await Model.aggregate([
    ...(extraMatch && Object.keys(extraMatch).length > 0 ? [{ $match: extraMatch }] : []),
    {
      $addFields: {
        parsedDate: {
          $let: {
            vars: { parts: { $split: [`$${dateField}`, "/"] } },
            in: {
              $dateFromParts: {
                year: {
                  $add: [
                    2000,
                    { $toInt: { $arrayElemAt: ["$$parts", 2] } }
                  ]
                },
                month: { $toInt: { $arrayElemAt: ["$$parts", 0] } },
                day: { $toInt: { $arrayElemAt: ["$$parts", 1] } }
              }
            }
          }
        },

        inHierarchy: {
          $in: [`$${dealerField}`, safeCodes]
        }
      }
    },

    {
      $facet: {

        // ========================
        // LAST 3 MONTHS
        // ========================
        lastThree: [
          { $match: { year_month: { $in: lastThreeMonths } } },
          {
            $group: {
              _id: "$year_month",
              totalVal: {
                $sum: {
                  $cond: [
                    { $or: ["$inHierarchy", isAdmin] },
                    `$${valueField}`,
                    0
                  ]
                }
              },
              totalQty: {
                $sum: {
                  $cond: [
                    { $or: ["$inHierarchy", isAdmin] },
                    `$${qtyField}`,
                    0
                  ]
                }
              }
            }
          }
        ],

        // ========================
        // MTD
        // ========================
        mtd: includeWod
          ? [
              {
                $match: {
                  parsedDate: {
                    $gte: startDate.toDate(),
                    $lte: endDate.toDate()
                  }
                }
              },
              {
                $group: {
                  _id: null,
                  totalVal: {
                    $sum: {
                      $cond: [
                        { $or: ["$inHierarchy", isAdmin] },
                        `$${valueField}`,
                        0
                      ]
                    }
                  },
                  totalQty: {
                    $sum: {
                      $cond: [
                        { $or: ["$inHierarchy", isAdmin] },
                        `$${qtyField}`,
                        0
                      ]
                    }
                  },
                  excludedVal: {
                    $sum: { $cond: ["$inHierarchy", 0, `$${valueField}`] }
                  },
                  excludedQty: {
                    $sum: { $cond: ["$inHierarchy", 0, `$${qtyField}`] }
                  },
                  excludedCount: {
                    $sum: { $cond: ["$inHierarchy", 0, 1] }
                  }
                }
              }
            ]
          : [
              {
                $match: {
                  year_month: startDate.format("YYYY-MM")
                }
              },
              {
                $group: {
                  _id: null,
                  totalVal: {
                    $sum: {
                      $cond: [
                        { $or: ["$inHierarchy", isAdmin] },
                        `$${valueField}`,
                        0
                      ]
                    }
                  },
                  totalQty: {
                    $sum: {
                      $cond: [
                        { $or: ["$inHierarchy", isAdmin] },
                        `$${qtyField}`,
                        0
                      ]
                    }
                  },
                  excludedVal: {
                    $sum: { $cond: ["$inHierarchy", 0, `$${valueField}`] }
                  },
                  excludedQty: {
                    $sum: { $cond: ["$inHierarchy", 0, `$${qtyField}`] }
                  },
                  excludedCount: {
                    $sum: { $cond: ["$inHierarchy", 0, 1] }
                  }
                }
              }
            ],


        // ========================
        // LMTD
        // ========================
        lmtd: includeWod
          ? [
              {
                $match: {
                  parsedDate: {
                    $gte: lmtdStart.toDate(),
                    $lte: lmtdEnd.toDate()
                  }
                }
              },
              {
                $group: {
                  _id: null,
                  totalVal: {
                    $sum: {
                      $cond: [
                        { $or: ["$inHierarchy", isAdmin] },
                        `$${valueField}`,
                        0
                      ]
                    }
                  },
                  totalQty: {
                    $sum: {
                      $cond: [
                        { $or: ["$inHierarchy", isAdmin] },
                        `$${qtyField}`,
                        0
                      ]
                    }
                  }
                }
              }
            ]
          : [
              {
                $match: {
                  year_month: lmtdStart.format("YYYY-MM")
                }
              },
              {
                $group: {
                  _id: null,
                  totalVal: {
                    $sum: {
                      $cond: [
                        { $or: ["$inHierarchy", isAdmin] },
                        `$${valueField}`,
                        0
                      ]
                    }
                  },
                  totalQty: {
                    $sum: {
                      $cond: [
                        { $or: ["$inHierarchy", isAdmin] },
                        `$${qtyField}`,
                        0
                      ]
                    }
                  }
                }
              }
            ],


        // ========================
        // FTD
        // ========================
        ftd: [
          { $match: { [dateField]: ftdRawDate } },
          {
            $group: {
              _id: null,
              totalVal: {
                $sum: {
                  $cond: [
                    { $or: ["$inHierarchy", isAdmin] },
                    `$${valueField}`,
                    0
                  ]
                }
              },
              totalQty: {
                $sum: {
                  $cond: [
                    { $or: ["$inHierarchy", isAdmin] },
                    `$${qtyField}`,
                    0
                  ]
                }
              }
            }
          }
        ],

        // ========================
        // WOD
        // ========================
// ========================
// WOD
// ========================
wod: includeWod
  ? [
      {
        $match: {
          parsedDate: {
            $gte: startDate.toDate(),
            $lte: endDate.toDate()
          }
        }
      },
      {
        $group: {
          _id: `$${dealerField}`,
          totalQty: { $sum: `$${qtyField}` },
          inHierarchy: { $first: "$inHierarchy" }
        }
      },
      {
        $match: {
          totalQty: { $gt: 0 }   // ✅ Only keep dealers with net positive qty
        }
      },
      {
        $group: {
          _id: null,
          totalDealers: {
            $sum: {
              $cond: [
                { $or: ["$inHierarchy", isAdmin] },
                1,
                0
              ]
            }
          },
          excludedDealers: {
            $sum: {
              $cond: ["$inHierarchy", 0, 1]
            }
          }
        }
      }
    ]
  : []
      }
    }
  ]);

  return formatTable(
  result[0],
  lastThreeMonths,
  includeWod,
  isAdmin
);

}

// ============================================
// FORMAT EXACT TABLE STRUCTURE
// ============================================
function formatTable(data, lastThreeMonths, includeWod, isAdmin){

  const monthLabels = lastThreeMonths.map(m =>
    moment(m, "YYYY-MM").format("MMM")
  );

  const valueRow = {};
  const volumeRow = {};

  monthLabels.forEach(label => {
    valueRow[label] = 0;
    volumeRow[label] = 0;
  });

  (data.lastThree || []).forEach(m => {
    const label = moment(m._id, "YYYY-MM").format("MMM");
    valueRow[label] = m.totalVal;
    volumeRow[label] = m.totalQty;
  });

  const mtd = data.mtd?.[0] || {};
  const lmtd = data.lmtd?.[0] || {};
  const ftd = data.ftd?.[0] || {};

  const mtdVal = mtd.totalVal || 0;
  const lmtdVal = lmtd.totalVal || 0;

  const mtdQty = mtd.totalQty || 0;
  const lmtdQty = lmtd.totalQty || 0;

  // ✅ Value Growth
  const valueGrowth =
    lmtdVal === 0
      ? 0
      : ((mtdVal - lmtdVal) / lmtdVal) * 100;

  // ✅ Volume Growth
  const volumeGrowth =
    lmtdQty === 0
      ? 0
      : ((mtdQty - lmtdQty) / lmtdQty) * 100;

  valueRow["MTD"] = mtdVal;
  valueRow["LMTD"] = lmtdVal;
  valueRow["FTD"] = ftd.totalVal || 0;
  valueRow["G/D%"] = Number(valueGrowth.toFixed(2));
  valueRow["ExpAch"] = 0;
  valueRow["WFM"] = 0;

  volumeRow["MTD"] = mtd.totalQty || 0;
  volumeRow["LMTD"] = lmtd.totalQty || 0;
  volumeRow["FTD"] = ftd.totalQty || 0;
  volumeRow["G/D%"] = Number(volumeGrowth.toFixed(2));
  volumeRow["ExpAch"] = 0;
  volumeRow["WFM"] = 0;

  return {
    table: {
      value: valueRow,
      volume: volumeRow,
      ...(includeWod && {
        wod: data.wod?.[0]?.totalDealers || 0
      }),

      // 🔴 NEW FLAG SUMMARY (SAFE ADDITION)
    flagSummary: {
      excludedVal: mtd.excludedVal || 0,
      excludedQty: mtd.excludedQty || 0,
      excludedCount: mtd.excludedCount || 0,

      // ✅ Admin includes excluded in totals
      countedInOverall: isAdmin,

      // ✅ Useful UI flag trigger
      hasHierarchyIssue: (mtd.excludedCount || 0) > 0
    }


    }
  };
}

async function getWODSummary(
  dealerCodes,
  startDate,
  endDate,
  lmtdStart,
  lmtdEnd,
  ftdRawDate,
  lastThreeMonths,
  extraMatch,
  isAdmin
) {
  const sellIn = await buildWODPipeline(
    TertiaryData,
    "invoice_date_raw",
    "dealer_code",
    dealerCodes,
    startDate,
    endDate,
    lmtdStart,
    lmtdEnd,
    ftdRawDate,
    lastThreeMonths,
    extraMatch,
    isAdmin
  );

  const sellOut = await buildWODPipeline(
    ActivationData,
    "activation_date_raw",
    "tertiary_buyer_code",
    dealerCodes,
    startDate,
    endDate,
    lmtdStart,
    lmtdEnd,
    ftdRawDate,
    lastThreeMonths,
    extraMatch,
    isAdmin
  );

  return {
    sellInWOD: sellIn,
    sellOutWOD: sellOut,
  };
}

async function buildWODPipeline(
  Model,
  dateField,
  dealerField,
  dealerCodes,
  startDate,
  endDate,
  lmtdStart,
  lmtdEnd,
  ftdRawDate,
  lastThreeMonths,
  extraMatch,
  isAdmin
) {
  console.log("Start date end date WOD:", startDate, endDate);
  console.log("dealer field:", dealerField);
  console.log("dealerCodes length:", dealerCodes?.length || 0);
  console.log("ftdRawDate, Model", ftdRawDate, Model?.collection?.name, lastThreeMonths);

  const normalizedDealerCodes = (dealerCodes || [])
    .map((code) => String(code || "").trim().toUpperCase())
    .filter((code) => code && code !== "-");

  const result = await Model.aggregate([
    ...(extraMatch && Object.keys(extraMatch).length > 0 ? [{ $match: extraMatch }] : []),
    {
      $addFields: {
        parsedDate: {
          $let: {
            vars: { parts: { $split: [`$${dateField}`, "/"] } },
            in: {
              $dateFromParts: {
                year: {
                  $add: [2000, { $toInt: { $arrayElemAt: ["$$parts", 2] } }]
                },
                month: { $toInt: { $arrayElemAt: ["$$parts", 0] } },
                day: { $toInt: { $arrayElemAt: ["$$parts", 1] } }
              }
            }
          }
        },
        normalizedDealerCode: {
          $toUpper: {
            $trim: { input: `$${dealerField}` }
          }
        },
        qtyNum: {
          $convert: {
            input: "$qty",
            to: "double",
            onError: 0,
            onNull: 0
          }
        }
      }
    },

    {
      $match: {
        normalizedDealerCode: { $nin: ["", "-", null] },
        ...(isAdmin
          ? {}
          : normalizedDealerCodes.length
          ? { normalizedDealerCode: { $in: normalizedDealerCodes } }
          : { normalizedDealerCode: { $in: [] } })
      }
    },

    {
      $facet: {
        // =========================
        // LAST THREE MONTHS
        // =========================
        lastThree: [
          { $match: { year_month: { $in: lastThreeMonths } } },
          {
            $group: {
              _id: {
                month: "$year_month",
                dealer: "$normalizedDealerCode"
              },
              totalQty: { $sum: "$qtyNum" }
            }
          },
          { $match: { totalQty: { $gt: 0 } } },
          {
            $group: {
              _id: "$_id.month",
              dealers: { $sum: 1 }
            }
          }
        ],

        // =========================
        // MTD
        // =========================
        mtd: [
          {
            $match: {
              parsedDate: {
                $gte: startDate.toDate(),
                $lte: endDate.toDate()
              }
            }
          },
          {
            $group: {
              _id: "$normalizedDealerCode",
              totalQty: { $sum: "$qtyNum" }
            }
          },
          { $match: { totalQty: { $gt: 0 } } },
          { $group: { _id: null, count: { $sum: 1 } } }
        ],

        // =========================
        // LMTD
        // =========================
        lmtd: [
          {
            $match: {
              parsedDate: {
                $gte: lmtdStart.toDate(),
                $lte: lmtdEnd.toDate()
              }
            }
          },
          {
            $group: {
              _id: "$normalizedDealerCode",
              totalQty: { $sum: "$qtyNum" }
            }
          },
          { $match: { totalQty: { $gt: 0 } } },
          { $group: { _id: null, count: { $sum: 1 } } }
        ],

        // =========================
        // FTD
        // =========================
        ftd: [
          { $match: { [dateField]: ftdRawDate } },
          {
            $group: {
              _id: "$normalizedDealerCode",
              totalQty: { $sum: "$qtyNum" }
            }
          },
          { $match: { totalQty: { $gt: 0 } } },
          { $group: { _id: null, count: { $sum: 1 } } }
        ]
      }
    }
  ]);

  console.log("WOD DEBUG -> Model:", Model.collection.name);
  console.log("WOD DEBUG -> raw mtd facet:", result?.[0]?.mtd);

  return formatWODResult(result[0], lastThreeMonths);
}

function formatWODResult(data, lastThreeMonths) {
  const monthMap = {};

  lastThreeMonths.forEach((m) => {
    monthMap[m] = 0;
  });

  (data.lastThree || []).forEach((m) => {
    monthMap[m._id] = m.dealers || 0;
  });

  const mtd = data.mtd?.[0]?.count || 0;
  const lmtd = data.lmtd?.[0]?.count || 0;
  const ftd = data.ftd?.[0]?.count || 0;

  const growth = lmtd === 0 ? 0 : ((mtd - lmtd) / lmtd) * 100;

  return {
    [lastThreeMonths[0]]: monthMap[lastThreeMonths[0]],
    [lastThreeMonths[1]]: monthMap[lastThreeMonths[1]],
    [lastThreeMonths[2]]: monthMap[lastThreeMonths[2]],
    MTD: mtd,
    LMTD: lmtd,
    FTD: ftd,
    "G/D%": Number(growth.toFixed(2)),
    "Exp.Ach": 0
  };
}

/////////////////////////////////
///////////////////////////////////////
// NEW DROPDOWNSSSSS 
/////////////////////////////////
///////////////////////////////////////
exports.getDropdownOptions = async (req, res) => {
  console.log("NEW⚡️⚡️⚡️⚡️⚡️")
  try {
    const {
      flow_name = "default_sales_flow",
      target_type,
      target_key,
      subordinates = {},
      dealer = {},
      product_tags = {},
    } = req.body || {};

    const values = await resolveDropdownOptions({
      flow_name,
      user: req.user,
      target_type,
      target_key,
      subordinates,
      dealer,
      product_tags,
    });

    return res.status(200).json({
      success: true,
      flow_name,
      target_type,
      target_key,
      values,
    });
  } catch (error) {
    console.error("Error in getDropdownOptions:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch dropdown options",
    });
  }
};

/////////////////////////////////
///////////////////////////////////////
// NEW DROPDOWNSSSSS 
/////////////////////////////////
///////////////////////////////////////



/////////////////////////////////
///////////////////////////////////////
// OPTIMIZED REPORTS 
/////////////////////////////////
///////////////////////////////////////

exports.getDashboardSummaryBatch = async (req, res) => {
  try {
    const { report_types = [] } = req.body;

    if (!Array.isArray(report_types) || !report_types.length) {
      return res.status(400).json({
        success: false,
        message: "report_types required",
      });
    }

    // prepare shared context ONCE using first report type temporarily
    const baseReq = {
      ...req,
      body: {
        ...req.body,
        filters: {
          ...(req.body.filters || {}),
          report_type: report_types[0],
        },
      },
    };

    const sharedCtx = await prepareDashboardSummaryContext(baseReq);

    const result = {};
    const tagGrouped = {};

    const reportEntries = await Promise.all(
      report_types.map(async (type) => {
        const perReportCtx = {
          ...sharedCtx,
          reportType: type,
          filters: {
            ...(sharedCtx.filters || {}),
            report_type: type,
          },
          groupBy: normalizeGroupBy(sharedCtx.filters?.group_by),
        };

        const { data, groupedTagData } = await buildDashboardReportByType(perReportCtx);

        return {
          type,
          data: data || null,
          groupedTagData: groupedTagData || null,
        };
      })
    );

    for (const entry of reportEntries) {
      result[entry.type] = entry.data;
      if (entry.groupedTagData) {
        tagGrouped[entry.type] = entry.groupedTagData;
      }
    }

    return res.json({
      success: true,
      flow_name: sharedCtx.flow_name,
      applied_filters: {
        subordinate_filters: sharedCtx.effectiveSubordinateFilters,
        dealer_filters: sharedCtx.effectiveDealerFilters,
        tags: sharedCtx.selectedTags,
      },
      data: {
        ...result,
        tag_grouped: tagGrouped,
      },
    });
  } catch (error) {
    console.error("Batch report error:", error);
    const statusCode =
      error.message &&
      (
        error.message.includes("required") ||
        error.message.includes("invalid") ||
        error.message.includes("must be") ||
        error.message.includes("cannot be after") ||
        error.message.includes("not supported")
      )
        ? 400
        : 500;

    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to fetch reports",
    });
  }
};



/////////////////////////////////
///////////////////////////////////////
// OPTIMIZED REPORTS 
/////////////////////////////////
///////////////////////////////////////