// ytd.service.js
// Purpose: Build "pace" YTD/LYTD tables where each month = 1st .. cutoffDay (yesterday's day)
// Example (today=15 Mar, cutoffDay=14): Jan = Jan1..Jan14, Feb = Feb1..Feb14, Mar = Mar1..Mar14

const moment = require("moment-timezone");

// If you already use momentTz() wrapper elsewhere, you can swap moment.tz(...) calls accordingly.

const MONTH_KEYS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function safeNumber(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function pctChange(curr, prev) {
  const c = safeNumber(curr);
  const p = safeNumber(prev);
  if (!p) return 0; // avoid divide-by-zero; change to null if you prefer
  return ((c - p) / p) * 100;
}

/**
 * Returns:
 *  cutoffTY: moment (yesterday endOfDay in India)
 *  cutoffLY: moment (same date last year endOfDay)
 *  cutoffDay: number (1..31)
 *  cutoffMonth: number (1..12)
 *  tyYear, lyYear
 *  startTY, startLY (Jan 1)
 */
function getIndiaCutoffs() {
  const indiaNow = moment.tz("Asia/Kolkata");
  const cutoffTY = indiaNow.clone().subtract(1, "day").endOf("day");

  const cutoffDay = cutoffTY.date();          // e.g. 14
  const cutoffMonth = cutoffTY.month() + 1;   // 1..12
  const tyYear = cutoffTY.year();
  const lyYear = tyYear - 1;

  const startTY = moment.tz({ year: tyYear, month: 0, day: 1 }, "Asia/Kolkata").startOf("day");
  const cutoffLY = cutoffTY.clone().subtract(1, "year").endOf("day");
  const startLY = moment.tz({ year: lyYear, month: 0, day: 1 }, "Asia/Kolkata").startOf("day");

  return { cutoffTY, cutoffLY, cutoffDay, cutoffMonth, tyYear, lyYear, startTY, startLY };
}

/**
 * Base aggregation:
 * - Matches Jan 1 .. cutoffDate (TY or LY)
 * - Filters codes (dealerCodes etc.)
 * - Keeps only dayOfMonth <= cutoffDay (pace logic)
 * - Groups by month and sums value + qty
 *
 * Uses $facet to compute TY and LY in one DB call.
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
  cutoffLY,
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

    // ✅ Only add code match stage if needed
    if (Object.keys(codeMatch).length > 0) {
      pipeline.push({ $match: codeMatch });
    }

    pipeline.push(
      buildAddParsedDate(),

      // ✅ match on parsed date
      { $match: { __dt: { $gte: start.toDate(), $lte: end.toDate() } } },

      // ✅ month/day from parsed date
      {
        $addFields: {
          __m: { $month: "$__dt" },
          __d: { $dayOfMonth: "$__dt" },
        },
      },

      // ✅ pace logic: only 1st..cutoffDay for every month
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
        ty: buildPipeline(startTY, cutoffTY),
        ly: buildPipeline(startLY, cutoffLY),
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
 * Month columns:
 *  - For months <= cutoffMonth: number (0 if missing)
 *  - For months > cutoffMonth: null (so UI can show blank)
 * YTD:
 *  - pace YTD = sum(month columns Jan..cutoffMonth)
 */
function buildPaceTable({ title, tyYear, lyYear, cutoffMonth, base, metric }) {
  // metric = "value" or "qty"
  const tyByMonth = {};
  const lyByMonth = {};

  for (const r of base.ty) tyByMonth[r.month] = safeNumber(r[metric]);
  for (const r of base.ly) lyByMonth[r.month] = safeNumber(r[metric]);

  const makeRow = (yearLabel, byMonth) => {
    const row = { Year: yearLabel };
    let ytd = 0;

    for (let m = 1; m <= 12; m++) {
      const key = MONTH_KEYS[m - 1];

      if (m <= cutoffMonth) {
        const v = safeNumber(byMonth[m]);
        row[key] = v;
        ytd += v;
      } else {
        row[key] = null; // future months blank
      }
    }

    row.YTD = ytd;
    return row;
  };

  const lyRow = makeRow(String(lyYear), lyByMonth);
  const tyRow = makeRow(String(tyYear), tyByMonth);

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
 * PUBLIC FUNCTIONS (4 reports)
 * You will call these from controller after you compute dealerCodes etc.
 */

async function getActivationPaceYtdReports({
  ActivationData,
  dealerCodes,
  isAdmin = false,
}) {
  const { cutoffTY, cutoffLY, cutoffDay, cutoffMonth, tyYear, lyYear, startTY, startLY } =
    getIndiaCutoffs();

  const base = await fetchPaceBase({
    Model: ActivationData,
    dateField: "activation_date_raw",
    codeField: "tertiary_buyer_code",
    codes: dealerCodes,
    valueField: "val",
    qtyField: "qty",
    cutoffDay,
    cutoffMonth,
    startTY,
    cutoffTY,
    startLY,
    cutoffLY,
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
  const { cutoffTY, cutoffLY, cutoffDay, cutoffMonth, tyYear, lyYear, startTY, startLY } =
    getIndiaCutoffs();

  const base = await fetchPaceBase({
    Model: TertiaryData,
    dateField: "invoice_date_raw",
    codeField: "dealer_code",
    codes: dealerCodes,
    valueField: "net_value",
    qtyField: "qty",
    cutoffDay,
    cutoffMonth,
    startTY,
    cutoffTY,
    startLY,
    cutoffLY,
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
 * Convenience: get all 4 at once (2 DB aggregations total)
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