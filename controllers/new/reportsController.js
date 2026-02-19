const ActivationData = require("../../model/ActivationData");
const SecondaryData = require("../../model/SecondaryData");
const TertiaryData = require("../../model/TertiaryData");
const moment = require("moment");
const { getDealerCodesFromFilters } = require("../../services/dealerFilterService");


// ============================================
// MAIN DASHBOARD API (Exact Screenshot Table)
// ============================================
exports.getDashboardSummary = async (req, res) => {
  try {
    const { start_date, end_date, filters } = req.body;
    const user = req.user;

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: "start_date and end_date required",
      });
    }

    const { dealerCodes = [], mddCodes = [] } =
      await getDealerCodesFromFilters(filters, user);

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

    const isAdmin =
      user?.role === "admin" ||
      user?.role === "super_admin";

    const [activation, tertiary, secondary] = await Promise.all([

      buildReport(
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
        isAdmin
      ),

      buildReport(
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
        isAdmin
      ),

      buildReport(
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
        isAdmin
      ),
    ]);


    const wodTables = await getWODSummary(
      dealerCodes,
      startDate,
      endDate,
      lmtdStart,
      lmtdEnd,
      ftdRawDate,
      lastThreeMonths
    );

    return res.json({
      success: true,
      activation,
      tertiary,
      secondary,
      wodTables,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
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
  isAdmin = false
) {

  const safeCodes = Array.isArray(codes) ? codes : [];

  const result = await Model.aggregate([
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

              // 🔴 always calculate excluded separately
              excludedVal: {
                $sum: {
                  $cond: ["$inHierarchy", 0, `$${valueField}`]
                }
              },
              excludedQty: {
                $sum: {
                  $cond: ["$inHierarchy", 0, `$${qtyField}`]
                }
              },
              excludedCount: {
                $sum: {
                  $cond: ["$inHierarchy", 0, 1]
                }
              }
            }
          }
        ],

        // ========================
        // LMTD
        // ========================
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
        wod: includeWod
          ? [
              {
                $match: {
                  parsedDate: {
                    $gte: startDate.toDate(),
                    $lte: endDate.toDate()
                  },
                  [qtyField]: { $gt: 0 },
                  ...(isAdmin ? {} : { inHierarchy: true })
                }
              },
              {
                $group: { _id: `$${dealerField}` }
              },
              { $count: "totalDealers" }
            ]
          : []
      }
    }
  ]);

  return formatTable(result[0], lastThreeMonths, includeWod);
}




// ============================================
// FORMAT EXACT TABLE STRUCTURE
// ============================================
function formatTable(data, lastThreeMonths, includeWod) {
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

  const growth =
    lmtdVal === 0
      ? 0
      : ((mtdVal - lmtdVal) / lmtdVal) * 100;

  valueRow["MTD"] = mtdVal;
  valueRow["LMTD"] = lmtdVal;
  valueRow["FTD"] = ftd.totalVal || 0;
  valueRow["G/D%"] = Number(growth.toFixed(2));
  valueRow["ExpAch"] = 0;
  valueRow["WFM"] = 0;

  volumeRow["MTD"] = mtd.totalQty || 0;
  volumeRow["LMTD"] = lmtd.totalQty || 0;
  volumeRow["FTD"] = ftd.totalQty || 0;
  volumeRow["G/D%"] = Number(growth.toFixed(2));
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
        countedInOverall: false
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
  lastThreeMonths
) {
  const sellIn = await buildWODPipeline(
    TertiaryData,
    "dealer_code",
    dealerCodes,
    startDate,
    endDate,
    lmtdStart,
    lmtdEnd,
    ftdRawDate,
    lastThreeMonths
  );

  const sellOut = await buildWODPipeline(
    ActivationData,
    "tertiary_buyer_code",
    dealerCodes,
    startDate,
    endDate,
    lmtdStart,
    lmtdEnd,
    ftdRawDate,
    lastThreeMonths
  );

  return {
    sellInWOD: sellIn,
    sellOutWOD: sellOut,
  };
}

async function buildWODPipeline(
  Model,
  dealerField,
  dealerCodes,
  startDate,
  endDate,
  lmtdStart,
  lmtdEnd,
  ftdRawDate,
  lastThreeMonths
) {
  const result = await Model.aggregate([
    {
      $addFields: {
        parsedDate: {
          $let: {
            vars: { parts: { $split: ["$invoice_date_raw", "/"] } },
            in: {
              $dateFromParts: {
                year: {
                  $add: [2000, { $toInt: { $arrayElemAt: ["$$parts", 2] } }],
                },
                month: { $toInt: { $arrayElemAt: ["$$parts", 0] } },
                day: { $toInt: { $arrayElemAt: ["$$parts", 1] } },
              },
            },
          },
        },
      },
    },
    {
      $match: {
        ...(dealerCodes?.length
          ? { [dealerField]: { $in: dealerCodes } }
          : {}),
        qty: { $gt: 0 },
      },
    },
    {
      $facet: {
        lastThree: [
          { $match: { year_month: { $in: lastThreeMonths } } },
          { $group: { _id: "$year_month", dealers: { $addToSet: `$${dealerField}` } } },
          { $project: { count: { $size: "$dealers" } } },
        ],
        mtd: [
          { $match: { parsedDate: { $gte: startDate.toDate(), $lte: endDate.toDate() } } },
          { $group: { _id: null, dealers: { $addToSet: `$${dealerField}` } } },
          { $project: { count: { $size: "$dealers" } } },
        ],
        lmtd: [
          { $match: { parsedDate: { $gte: lmtdStart.toDate(), $lte: lmtdEnd.toDate() } } },
          { $group: { _id: null, dealers: { $addToSet: `$${dealerField}` } } },
          { $project: { count: { $size: "$dealers" } } },
        ],
        ftd: [
          { $match: { activation_date_raw: ftdRawDate } },
          { $group: { _id: null, dealers: { $addToSet: `$${dealerField}` } } },
          { $project: { count: { $size: "$dealers" } } },
        ],
      },
    },
  ]);

  return formatWODResult(result[0], lastThreeMonths);
}


function formatWODResult(data, lastThreeMonths) {
  const monthMap = {};

  lastThreeMonths.forEach((m) => {
    monthMap[m] = 0;
  });

  (data.lastThree || []).forEach((m, index) => {
    monthMap[lastThreeMonths[index]] = m.count || 0;
  });

  const mtd = data.mtd?.[0]?.count || 0;
  const lmtd = data.lmtd?.[0]?.count || 0;
  const ftd = data.ftd?.[0]?.count || 0;

  const growth =
    lmtd === 0 ? 0 : ((mtd - lmtd) / lmtd) * 100;

  return {
    Nov: monthMap[lastThreeMonths[0]],
    Dec: monthMap[lastThreeMonths[1]],
    Jan: monthMap[lastThreeMonths[2]],
    MTD: mtd,
    LMTD: lmtd,
    FTD: ftd,
    "G/D%": Number(growth.toFixed(2)),
    "Exp.Ach": 0, // placeholder
  };
}

