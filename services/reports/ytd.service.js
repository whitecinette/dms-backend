// ytd.service.js
// Purpose: Build "pace" YTD/LYTD tables where each month = 1st .. cutoffDay (yesterday's day)
// Example (today=15 Mar, cutoffDay=14):
// Jan = Jan1..Jan14, Feb = Feb1..Feb14, Mar = Mar1..Mar14
// For LY future months too: Apr = Apr1..Apr14, May = May1..May14, etc.

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
 *  cutoffTY: yesterday endOfDay in India
 *  cutoffLY: same date last year endOfDay
 *  cutoffDay: yesterday's day-of-month
 *  cutoffMonth: current cutoff month (1..12)
 *  tyYear, lyYear
 *  startTY, startLY
 *  endLYFull: Dec 31 LY endOfDay
 */
function getIndiaCutoffs() {
  const indiaNow = moment.tz("Asia/Kolkata");
  const cutoffTY = indiaNow.clone().subtract(1, "day").endOf("day");

  const cutoffDay = cutoffTY.date();
  const cutoffMonth = cutoffTY.month() + 1;
  const tyYear = cutoffTY.year();
  const lyYear = tyYear - 1;

  const startTY = moment.tz({ year: tyYear, month: 0, day: 1 }, "Asia/Kolkata").startOf("day");
  const startLY = moment.tz({ year: lyYear, month: 0, day: 1 }, "Asia/Kolkata").startOf("day");
  const cutoffLY = cutoffTY.clone().subtract(1, "year").endOf("day");
  const endLYFull = moment.tz({ year: lyYear, month: 11, day: 31 }, "Asia/Kolkata").endOf("day");

  return {
    cutoffTY,
    cutoffLY,
    cutoffDay,
    cutoffMonth,
    tyYear,
    lyYear,
    startTY,
    startLY,
    endLYFull,
  };
}

/**
 * Base aggregation:
 * - TY: Jan 1 .. cutoffTY
 * - LY: Jan 1 .. Dec 31 LY (full LY fetch)
 * - For every month, keeps only dayOfMonth <= cutoffDay (pace logic)
 * - Admin bypass supported
 * - Uses $facet to compute TY and LY in one DB call
 */
async function fetchPaceBase({
  Model,
  dateField,
  codeField,
  codes = [],
  valueField,
  qtyField,
  cutoffDay,
  startTY,
  cutoffTY,
  startLY,
  endLYFull,
  isAdmin = false,
}) {
  const buildCodeMatch = () => {
    // ✅ Admin / Super Admin bypass: no code restriction
    if (isAdmin) {
      return {};
    }

    // ✅ Normal users: restrict to hierarchy codes
    if (Array.isArray(codes) && codes.length > 0) {
      return { [codeField]: { $in: codes } };
    }

    // ✅ No codes for non-admin => match nothing
    return { [codeField]: { $in: ["__NO_CODES__"] } };
  };

  // ✅ Parses raw date safely (Date or String "M/D/YY")
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
                      { $arrayElemAt: ["$$parts", 0] }, // M
                      "/",
                      { $arrayElemAt: ["$$parts", 1] }, // D
                      "/",
                      "20",
                      { $arrayElemAt: ["$$parts", 2] }, // YY -> 20YY
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

    pipeline.push(
      buildAddParsedDate(),

      // ✅ Date range
      { $match: { __dt: { $gte: start.toDate(), $lte: end.toDate() } } },

      // ✅ Month/day from parsed date
      {
        $addFields: {
          __m: { $month: "$__dt" },
          __d: { $dayOfMonth: "$__dt" },
        },
      },

      // ✅ Pace logic for every month
      { $match: { __d: { $lte: cutoffDay } } },

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
        // TY only till current cutoff date
        ty: buildPipeline(startTY, cutoffTY),

        // LY full year, but each month still limited to 1..cutoffDay
        ly: buildPipeline(startLY, endLYFull),
      },
    },
  ]).allowDiskUse(true);

  return {
    ty: Array.isArray(doc?.ty) ? doc.ty : [],
    ly: Array.isArray(doc?.ly) ? doc.ly : [],
  };
}

/**
 * Builds a single table (value or qty) from base aggregation.
 *
 * Behavior:
 * - LY row: shows all 12 month values
 * - TY row: shows values only up to cutoffMonth, future months blank
 * - G/D row: calculates only up to cutoffMonth, future months blank
 * - YTD: compares Jan..cutoffMonth only
 */
function buildPaceTable({ title, tyYear, lyYear, cutoffMonth, base, metric }) {
  const tyByMonth = {};
  const lyByMonth = {};

  for (const r of base.ty) tyByMonth[r.month] = safeNumber(r[metric]);
  for (const r of base.ly) lyByMonth[r.month] = safeNumber(r[metric]);

  // ✅ LY row: show all 12 months
  const lyRow = { Year: String(lyYear) };
  let lyYtd = 0;

  for (let m = 1; m <= 12; m++) {
    const key = MONTH_KEYS[m - 1];
    const v = safeNumber(lyByMonth[m]);
    lyRow[key] = v;

    if (m <= cutoffMonth) {
      lyYtd += v;
    }
  }
  lyRow.YTD = lyYtd;

  // ✅ TY row: show only till cutoffMonth, rest blank
  const tyRow = { Year: String(tyYear) };
  let tyYtd = 0;

  for (let m = 1; m <= 12; m++) {
    const key = MONTH_KEYS[m - 1];

    if (m <= cutoffMonth) {
      const v = safeNumber(tyByMonth[m]);
      tyRow[key] = v;
      tyYtd += v;
    } else {
      tyRow[key] = null;
    }
  }
  tyRow.YTD = tyYtd;

  // ✅ Growth row: only till cutoffMonth
  const gdRow = { Year: `G/D ${lyYear} Vs ${tyYear} %` };

  for (let m = 1; m <= 12; m++) {
    const key = MONTH_KEYS[m - 1];

    if (m <= cutoffMonth) {
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

async function getActivationPaceYtdReports({
  ActivationData,
  dealerCodes,
  isAdmin = false,
}) {
  const {
    cutoffTY,
    cutoffDay,
    cutoffMonth,
    tyYear,
    lyYear,
    startTY,
    startLY,
    endLYFull,
  } = getIndiaCutoffs();

  const base = await fetchPaceBase({
    Model: ActivationData,
    dateField: "activation_date_raw",
    codeField: "tertiary_buyer_code",
    codes: dealerCodes,
    valueField: "val",
    qtyField: "qty",
    cutoffDay,
    startTY,
    cutoffTY,
    startLY,
    endLYFull,
    isAdmin,
  });

  return {
    activationValueYtd: buildPaceTable({
      title: "Activation Value YTD G/D",
      tyYear,
      lyYear,
      cutoffMonth,
      base,
      metric: "value",
    }),
    activationVolYtd: buildPaceTable({
      title: "Activation Vol YTD G/D",
      tyYear,
      lyYear,
      cutoffMonth,
      base,
      metric: "qty",
    }),
  };
}

async function getTertiaryPaceYtdReports({
  TertiaryData,
  dealerCodes,
  isAdmin = false,
}) {
  const {
    cutoffTY,
    cutoffDay,
    cutoffMonth,
    tyYear,
    lyYear,
    startTY,
    startLY,
    endLYFull,
  } = getIndiaCutoffs();

  const base = await fetchPaceBase({
    Model: TertiaryData,
    dateField: "invoice_date_raw",
    codeField: "dealer_code",
    codes: dealerCodes,
    valueField: "net_value",
    qtyField: "qty",
    cutoffDay,
    startTY,
    cutoffTY,
    startLY,
    endLYFull,
    isAdmin,
  });

  return {
    tertiaryValueYtd: buildPaceTable({
      title: "Tertiary Value YTD G/D",
      tyYear,
      lyYear,
      cutoffMonth,
      base,
      metric: "value",
    }),
    tertiaryVolYtd: buildPaceTable({
      title: "Tertiary Vol YTD G/D",
      tyYear,
      lyYear,
      cutoffMonth,
      base,
      metric: "qty",
    }),
  };
}

/**
 * Convenience: get all 4 at once
 */
async function getAllPaceYtdReports({
  ActivationData,
  TertiaryData,
  dealerCodes,
  isAdmin = false,
}) {
  const [a, t] = await Promise.all([
    getActivationPaceYtdReports({ ActivationData, dealerCodes, isAdmin }),
    getTertiaryPaceYtdReports({ TertiaryData, dealerCodes, isAdmin }),
  ]);

  return { ...a, ...t };
}

module.exports = {
  getIndiaCutoffs,
  getActivationPaceYtdReports,
  getTertiaryPaceYtdReports,
  getAllPaceYtdReports,
};