// ytdActual.service.js
// Purpose: Build "actual" YTD/LYTD tables where each month = full month totals
// Example:
// LY row  = Jan25, Feb25, ... Dec25 (full month actuals)
// TY row  = Jan26, Feb26, Mar26 (available actuals), Apr26..Dec26 = 0
// Growth  = calculated only till current month, future months blank

const moment = require("moment-timezone");

const MONTH_KEYS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function safeNumber(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function pctChange(curr, prev) {
  const c = safeNumber(curr);
  const p = safeNumber(prev);
  if (!p) return 0;
  return ((c - p) / p) * 100;
}

/**
 * Returns:
 *  tyYear, lyYear
 *  currentMonth (1..12)
 *  startTY = Jan 1 TY
 *  endTY = now/yesterday endOfDay in India (available data naturally comes till this point)
 *  startLY = Jan 1 LY
 *  endLY = Dec 31 LY endOfDay
 */
function getIndiaActualCutoffs() {
  const indiaNow = moment.tz("Asia/Kolkata");
  const endTY = indiaNow.clone().subtract(1, "day").endOf("day"); // same safe behavior
  const tyYear = endTY.year();
  const lyYear = tyYear - 1;
  const currentMonth = endTY.month() + 1;

  const startTY = moment.tz({ year: tyYear, month: 0, day: 1 }, "Asia/Kolkata").startOf("day");
  const startLY = moment.tz({ year: lyYear, month: 0, day: 1 }, "Asia/Kolkata").startOf("day");
  const endLY = moment.tz({ year: lyYear, month: 11, day: 31 }, "Asia/Kolkata").endOf("day");

  return {
    tyYear,
    lyYear,
    currentMonth,
    startTY,
    endTY,
    startLY,
    endLY,
  };
}

/**
 * Base aggregation:
 * - TY: Jan 1 .. endTY
 * - LY: Jan 1 .. Dec 31 LY
 * - Whole-month totals (no cutoffDay logic)
 * - Admin bypass supported
 * - Uses $facet to compute TY and LY in one DB call
 */
async function fetchActualBase({
  Model,
  dateField,
  codeField,
  codes = [],
  valueField,
  qtyField,
  startTY,
  endTY,
  startLY,
  endLY,
  extraMatch = null,
  isAdmin = false,
}) {
  const buildCodeMatch = () => {
    if (isAdmin) {
      return {};
    }

    if (Array.isArray(codes) && codes.length > 0) {
      return { [codeField]: { $in: codes } };
    }

    return { [codeField]: { $in: ["__NO_CODES__"] } };
  };

  // Parses raw date safely (Date or String "M/D/YY")
  const buildAddParsedDate = () => ({
    $addFields: {
      __dt: {
        $cond: [
          { $eq: [{ $type: `$${dateField}` }, "date"] },
          `$${dateField}`,
          {
            $let: {
              vars: { parts: { $split: [`$${dateField}`, "/"] } },
              in: {
                $dateFromString: {
                  dateString: {
                    $concat: [
                      { $arrayElemAt: ["$$parts", 0] },
                      "/",
                      { $arrayElemAt: ["$$parts", 1] },
                      "/",
                      "20",
                      { $arrayElemAt: ["$$parts", 2] },
                    ],
                  },
                  format: "%m/%d/%Y",
                  onError: null,
                  onNull: null,
                },
              },
            },
          },
        ],
      },
    },
  });

  const buildPipeline = (start, end) => {
    const codeMatch = buildCodeMatch();
    const pipeline = [];

    if (Object.keys(codeMatch).length > 0) {
      pipeline.push({ $match: codeMatch });
    }

    if (extraMatch && Object.keys(extraMatch).length > 0) {
      pipeline.push({ $match: extraMatch });
    }

    pipeline.push(
      buildAddParsedDate(),

      { $match: { __dt: { $gte: start.toDate(), $lte: end.toDate() } } },

      {
        $addFields: {
          __m: { $month: "$__dt" },
        },
      },

      {
        $group: {
          _id: "$__m",
          value: { $sum: { $ifNull: [`$${valueField}`, 0] } },
          qty: { $sum: { $ifNull: [`$${qtyField}`, 0] } },
        },
      },
      { $project: { _id: 0, month: "$_id", value: 1, qty: 1 } },
      { $sort: { month: 1 } }
    );

    return pipeline;
  };

  const [doc] = await Model.aggregate([
    {
      $facet: {
        ty: buildPipeline(startTY, endTY),
        ly: buildPipeline(startLY, endLY),
      },
    },
  ]).allowDiskUse(true);

  return {
    ty: Array.isArray(doc?.ty) ? doc.ty : [],
    ly: Array.isArray(doc?.ly) ? doc.ly : [],
  };
}

/**
 * Builds actual-month table.
 *
 * Behavior:
 * - LY row: shows all 12 month values
 * - TY row: shows values till currentMonth, future months = 0
 * - G/D row: calculates only till currentMonth, future months = null
 * - YTD: compares Jan..currentMonth only
 */
function buildActualTable({ title, tyYear, lyYear, currentMonth, base, metric }) {
  const tyByMonth = {};
  const lyByMonth = {};

  for (const r of base.ty) tyByMonth[r.month] = safeNumber(r[metric]);
  for (const r of base.ly) lyByMonth[r.month] = safeNumber(r[metric]);

  const lyRow = { Year: String(lyYear) };
  let lyYtd = 0;

  for (let m = 1; m <= 12; m++) {
    const key = MONTH_KEYS[m - 1];
    const v = safeNumber(lyByMonth[m]);
    lyRow[key] = v;

    if (m <= currentMonth) {
      lyYtd += v;
    }
  }
  lyRow.YTD = lyYtd;

  const tyRow = { Year: String(tyYear) };
  let tyYtd = 0;

  for (let m = 1; m <= 12; m++) {
    const key = MONTH_KEYS[m - 1];

    if (m <= currentMonth) {
      const v = safeNumber(tyByMonth[m]);
      tyRow[key] = v;
      tyYtd += v;
    } else {
      tyRow[key] = 0;
    }
  }
  tyRow.YTD = tyYtd;

  const gdRow = { Year: `G/D ${lyYear} Vs ${tyYear} %` };

  for (let m = 1; m <= 12; m++) {
    const key = MONTH_KEYS[m - 1];

    if (m <= currentMonth) {
      gdRow[key] = pctChange(tyRow[key], lyRow[key]);
    } else {
      gdRow[key] = null;
    }
  }

  gdRow.YTD = pctChange(tyRow.YTD, lyRow.YTD);

  return {
    title,
    columns: ["Year", ...MONTH_KEYS, "YTD"],
    rows: [lyRow, tyRow, gdRow],
  };
}

/**
 * PUBLIC FUNCTIONS
 */

async function getActivationActualYtdReports({
  ActivationData,
  dealerCodes,
  extraMatch = null,
  isAdmin = false,
}) {
  const {
    tyYear,
    lyYear,
    currentMonth,
    startTY,
    endTY,
    startLY,
    endLY,
  } = getIndiaActualCutoffs();

  const base = await fetchActualBase({
    Model: ActivationData,
    dateField: "activation_date_raw",
    codeField: "tertiary_buyer_code",
    codes: dealerCodes,
    valueField: "val",
    qtyField: "qty",
    startTY,
    endTY,
    startLY,
    endLY,
    extraMatch,
    isAdmin,
  });

  return {
    activationValueYtdActual: buildActualTable({
      title: "Activation Value YTD Actual",
      tyYear,
      lyYear,
      currentMonth,
      base,
      metric: "value",
    }),
    activationVolYtdActual: buildActualTable({
      title: "Activation Vol YTD Actual",
      tyYear,
      lyYear,
      currentMonth,
      base,
      metric: "qty",
    }),
  };
}

async function getTertiaryActualYtdReports({
  TertiaryData,
  dealerCodes,
  extraMatch = null,
  isAdmin = false,
}) {
  const {
    tyYear,
    lyYear,
    currentMonth,
    startTY,
    endTY,
    startLY,
    endLY,
  } = getIndiaActualCutoffs();

  const base = await fetchActualBase({
    Model: TertiaryData,
    dateField: "invoice_date_raw",
    codeField: "dealer_code",
    codes: dealerCodes,
    valueField: "net_value",
    qtyField: "qty",
    startTY,
    endTY,
    startLY,
    endLY,
    extraMatch,
    isAdmin,
  });

  return {
    tertiaryValueYtdActual: buildActualTable({
      title: "Tertiary Value YTD Actual",
      tyYear,
      lyYear,
      currentMonth,
      base,
      metric: "value",
    }),
    tertiaryVolYtdActual: buildActualTable({
      title: "Tertiary Vol YTD Actual",
      tyYear,
      lyYear,
      currentMonth,
      base,
      metric: "qty",
    }),
  };
}

async function getAllActualYtdReports({
  ActivationData,
  TertiaryData,
  dealerCodes,
  activationExtraMatch = null,
  tertiaryExtraMatch = null,
  isAdmin = false,
}) {
  const [a, t] = await Promise.all([
    getActivationActualYtdReports({ ActivationData, dealerCodes, extraMatch: activationExtraMatch, isAdmin }),
    getTertiaryActualYtdReports({ TertiaryData, dealerCodes, extraMatch: tertiaryExtraMatch, isAdmin }),
  ]);

  return { ...a, ...t };
}

module.exports = {
  getIndiaActualCutoffs,
  getActivationActualYtdReports,
  getTertiaryActualYtdReports,
  getAllActualYtdReports,
};
