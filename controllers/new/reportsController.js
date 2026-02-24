const ActivationData = require("../../model/ActivationData");
const SecondaryData = require("../../model/SecondaryData");
const TertiaryData = require("../../model/TertiaryData");
const moment = require("moment");
const { getDealerCodesFromFilters } = require("../../services/dealerFilterService");
const momentTz = require("moment-timezone");
const ProductMaster = require("../../model/ProductMaster");
const { PRICE_SEGMENTS } = require("../../config/price_segment_config");


// ============================================
// MAIN DASHBOARD API (Exact Screenshot Table)
// ============================================
exports.getDashboardSummary = async (req, res) => {
  try {
    let { start_date, end_date, filters } = req.body;
    const user = req.user;
    console.log("User: ", user)
    const DEBUG_WOD = true;

    const indiaNow = momentTz().tz("Asia/Kolkata");

    // If no dates provided → default to real-time safe range
    if (!start_date || !end_date) {

      const yesterday = indiaNow.clone().subtract(1, "day");

      start_date = yesterday.clone().startOf("month").format("YYYY-MM-DD");
      end_date = yesterday.format("YYYY-MM-DD");
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
    lastThreeMonths,
    isAdmin
  );

  const priceSegmentTables = await getPriceSegmentSummaryActivation(
    dealerCodes,
    startDate,
    endDate,
    isAdmin
    );


    return res.json({
      success: true,
      activation,
      tertiary,
      secondary,
      wodTables,
      priceSegmentTables
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
  isAdmin
)
{
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
    lastThreeMonths
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
  isAdmin
) {
  console.log("Start date end date WOD: ", startDate, endDate)
  console.log("dealer field: ", dealerField);
  console.log("dealerCodes: ", dealerCodes.length)
  console.log("ftdRawDate, Model", ftdRawDate, Model, lastThreeMonths);
  const result = await Model.aggregate([
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
        }
      }
    },

    {
      $match: {
        ...(isAdmin
          ? {}
          : dealerCodes?.length
          ? { [dealerField]: { $in: dealerCodes } }
          : {})
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
                dealer: `$${dealerField}`
              },
              totalQty: { $sum: "$qty" }
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
              _id: `$${dealerField}`,
              totalQty: { $sum: "$qty" }
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
              _id: `$${dealerField}`,
              totalQty: { $sum: "$qty" }
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
              _id: `$${dealerField}`,
              totalQty: { $sum: "$qty" }
            }
          },
          { $match: { totalQty: { $gt: 0 } } },
          { $group: { _id: null, count: { $sum: 1 } } }
        ]
      }
    }
  ]);
  console.log("WOD DEBUG -> MTD dealers count:", result[0].mtd.length);
  console.log("WOD DEBUG -> first 20 MTD dealers:", result[0].mtd.slice(0, 20));
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

  // console.log("WOD DEBUG -> MTD:", mtd, "LMTD:", lmtd, "FTD:", ftd);
  // console.log("WOD DEBUG -> lastThree:", data.lastThree);

  const growth =
    lmtd === 0 ? 0 : ((mtd - lmtd) / lmtd) * 100;

  

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



// ============================================
// PRICE SEGMENT SUMMARY (ACTIVATION ONLY)
// ============================================

// Helpers: IST boundaries using fixed offset (IST = UTC+05:30, no DST)
const IST_OFFSET_MIN = 330;

function toIstParts(date) {
  // Convert a JS Date (UTC instant) to IST calendar parts
  const d = new Date(date.getTime() + IST_OFFSET_MIN * 60 * 1000);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1, // 1-12
    d: d.getUTCDate()
  };
}

function istMidnightUtc(y, m, d) {
  // IST midnight -> UTC instant
  const utcMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - IST_OFFSET_MIN * 60 * 1000;
  return new Date(utcMs);
}

function istEndOfDayUtc(y, m, d) {
  const utcMs =
    Date.UTC(y, m - 1, d, 23, 59, 59, 999) - IST_OFFSET_MIN * 60 * 1000;
  return new Date(utcMs);
}

function daysInMonth(y, m) {
  // m: 1-12
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function addDaysIst(y, m, d, deltaDays) {
  // do arithmetic in UTC on an IST-mapped date
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return {
    y: base.getUTCFullYear(),
    m: base.getUTCMonth() + 1,
    d: base.getUTCDate()
  };
}

function monthStartIstUtc(y, m) {
  return istMidnightUtc(y, m, 1);
}
function monthEndIstUtc(y, m) {
  return istEndOfDayUtc(y, m, daysInMonth(y, m));
}

function monthLabel(y, m) {
  // "Nov", "Dec", etc.
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC"
  });
}

async function getPriceSegmentSummaryActivation(dealerCodes, startDate, endDate, isAdmin) {
  const safeCodes = Array.isArray(dealerCodes) ? dealerCodes : [];

  // ---------- BUSINESS DATE (D-1) in IST ----------
  const endParts = toIstParts(endDate.toDate()); // endDate is moment/dayjs in your code
  const business = addDaysIst(endParts.y, endParts.m, endParts.d, -1); // D-1

  // Current month is business month
  const curY = business.y;
  const curM = business.m;

  // Ranges (all returned as UTC instants representing IST boundaries)
  const curStart = monthStartIstUtc(curY, curM);
  const businessStart = istMidnightUtc(business.y, business.m, business.d);
  const businessEnd = istEndOfDayUtc(business.y, business.m, business.d);

  // LMTD: last month 1st -> same day-of-month as business.d (clamped)
  const prevMonth = addDaysIst(curY, curM, 1, -1); // last day of previous month gives us y/m
  const prevY = prevMonth.y;
  const prevM = prevMonth.m;
  const prevMonthDays = daysInMonth(prevY, prevM);
  const lmtdDay = Math.min(business.d, prevMonthDays);

  const lmtdStart = monthStartIstUtc(prevY, prevM);
  const lmtdEnd = istEndOfDayUtc(prevY, prevM, lmtdDay);

  // Prev 3 full months (relative to current month)
  const m1 = addDaysIst(curY, curM, 1, -1); // last day of prev month => (prevY, prevM) is month-1
  const m2Tmp = addDaysIst(prevY, prevM, 1, -1); // month-2
  const m3Tmp = addDaysIst(m2Tmp.y, m2Tmp.m, 1, -1); // month-3

  const monthMinus1 = { y: prevY, m: prevM };
  const monthMinus2 = { y: m2Tmp.y, m: m2Tmp.m };
  const monthMinus3 = { y: m3Tmp.y, m: m3Tmp.m };

  const m1Start = monthStartIstUtc(monthMinus1.y, monthMinus1.m);
  const m1End = monthEndIstUtc(monthMinus1.y, monthMinus1.m);

  const m2Start = monthStartIstUtc(monthMinus2.y, monthMinus2.m);
  const m2End = monthEndIstUtc(monthMinus2.y, monthMinus2.m);

  const m3Start = monthStartIstUtc(monthMinus3.y, monthMinus3.m);
  const m3End = monthEndIstUtc(monthMinus3.y, monthMinus3.m);

  // Earliest needed data = month-3 start
  const earliestStart = m3Start;

  // Dynamic month header keys (e.g. "Nov", "Dec", "Jan")
  const k1 = monthLabel(monthMinus3.y, monthMinus3.m);
  const k2 = monthLabel(monthMinus2.y, monthMinus2.m);
  const k3 = monthLabel(monthMinus1.y, monthMinus1.m);

  const result = await ActivationData.aggregate([
    // -----------------------------
    // Parse Activation Date (IST)
    // -----------------------------
    {
      $addFields: {
        parsedDate: {
          $let: {
            vars: { parts: { $split: ["$activation_date_raw", "/"] } },
            in: {
              $dateFromParts: {
                year: {
                  $add: [2000, { $toInt: { $arrayElemAt: ["$$parts", 2] } }]
                },
                month: { $toInt: { $arrayElemAt: ["$$parts", 0] } },
                day: { $toInt: { $arrayElemAt: ["$$parts", 1] } },
                timezone: "Asia/Kolkata"
              }
            }
          }
        },
        inHierarchy: { $in: ["$tertiary_buyer_code", safeCodes] }
      }
    },

    // -----------------------------
    // Keep only relevant months window
    // -----------------------------
    {
      $match: {
        parsedDate: { $gte: earliestStart, $lte: businessEnd }
      }
    },

    // -----------------------------
    // PRODUCT LOOKUP (supports product_code or sku)
    // -----------------------------
    {
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
                  { $eq: ["$sku", "$$pcode"] } // in case product_code == sku in master
                ]
              }
            }
          }
        ],
        as: "product"
      }
    },

    {
      $facet: {
        // RAW TOTAL for current MTD window (curStart -> businessEnd)
        totalRaw: [
          { $match: { parsedDate: { $gte: curStart, $lte: businessEnd } } },
          {
            $group: {
              _id: null,
              totalRows: { $sum: 1 },
              totalVal: { $sum: "$val" },
              totalQty: { $sum: "$qty" }
            }
          }
        ],

        // UNMAPPED PRODUCT (within current MTD window)
        unmappedProduct: [
          { $match: { parsedDate: { $gte: curStart, $lte: businessEnd }, product: { $eq: [] } } },
          {
            $group: {
              _id: null,
              rows: { $sum: 1 },
              totalVal: { $sum: "$val" },
              totalQty: { $sum: "$qty" }
            }
          }
        ],

        // HIERARCHY EXCLUDED (within current MTD window)
        hierarchyExcluded: [
          { $match: { parsedDate: { $gte: curStart, $lte: businessEnd }, inHierarchy: false } },
          {
            $group: {
              _id: null,
              rows: { $sum: 1 },
              totalVal: { $sum: "$val" },
              totalQty: { $sum: "$qty" }
            }
          }
        ],

        // MAIN TABLE (all required columns)
        tableData: [
          { $unwind: "$product" },
          {
            $match: isAdmin ? {} : { inHierarchy: true }
          },
          {
            $group: {
              _id: "$product.sub_segment",

              // previous 3 full months (dynamic keys handled in formatter)
              m3Val: { $sum: { $cond: [{ $and: [{ $gte: ["$parsedDate", m3Start] }, { $lte: ["$parsedDate", m3End] }] }, "$val", 0] } },
              m2Val: { $sum: { $cond: [{ $and: [{ $gte: ["$parsedDate", m2Start] }, { $lte: ["$parsedDate", m2End] }] }, "$val", 0] } },
              m1Val: { $sum: { $cond: [{ $and: [{ $gte: ["$parsedDate", m1Start] }, { $lte: ["$parsedDate", m1End] }] }, "$val", 0] } },

              m3Qty: { $sum: { $cond: [{ $and: [{ $gte: ["$parsedDate", m3Start] }, { $lte: ["$parsedDate", m3End] }] }, "$qty", 0] } },
              m2Qty: { $sum: { $cond: [{ $and: [{ $gte: ["$parsedDate", m2Start] }, { $lte: ["$parsedDate", m2End] }] }, "$qty", 0] } },
              m1Qty: { $sum: { $cond: [{ $and: [{ $gte: ["$parsedDate", m1Start] }, { $lte: ["$parsedDate", m1End] }] }, "$qty", 0] } },

              // MTD: current month to business date (D-1)
              mtdVal: { $sum: { $cond: [{ $and: [{ $gte: ["$parsedDate", curStart] }, { $lte: ["$parsedDate", businessEnd] }] }, "$val", 0] } },
              mtdQty: { $sum: { $cond: [{ $and: [{ $gte: ["$parsedDate", curStart] }, { $lte: ["$parsedDate", businessEnd] }] }, "$qty", 0] } },

              // LMTD: last month to same day (D-1 day number)
              lmtdVal: { $sum: { $cond: [{ $and: [{ $gte: ["$parsedDate", lmtdStart] }, { $lte: ["$parsedDate", lmtdEnd] }] }, "$val", 0] } },
              lmtdQty: { $sum: { $cond: [{ $and: [{ $gte: ["$parsedDate", lmtdStart] }, { $lte: ["$parsedDate", lmtdEnd] }] }, "$qty", 0] } },

              // FTD: business date only (D-1)
              ftdVal: { $sum: { $cond: [{ $and: [{ $gte: ["$parsedDate", businessStart] }, { $lte: ["$parsedDate", businessEnd] }] }, "$val", 0] } },
              ftdQty: { $sum: { $cond: [{ $and: [{ $gte: ["$parsedDate", businessStart] }, { $lte: ["$parsedDate", businessEnd] }] }, "$qty", 0] } }
            }
          }
        ]
      }
    }
  ]);

  return formatPriceSegmentTable(result[0], isAdmin, {
    monthKeys: { k1, k2, k3 },
    // For WMF projection
    elapsedDays: business.d,                 // day-of-month of business date (D-1)
    totalDays: daysInMonth(curY, curM)
  });
}

function formatPriceSegmentTable(data, isAdmin, meta) {
  const valueTable = [];
  const volumeTable = [];

  const { k1, k2, k3 } = meta.monthKeys;

  const segmentMap = {};
  (data.tableData || []).forEach(r => {
    segmentMap[r._id] = r;
  });

  const safeDivPct = (num, den) => {
    if (!den || den === 0) return 0; // keep simple for now
    return (num - den) / den * 100;
  };

  const projectWMF = (mtd) => {
    const { elapsedDays, totalDays } = meta;
    if (!elapsedDays || elapsedDays <= 0) return 0;
    return (mtd / elapsedDays) * totalDays;
  };

  // build rows in same segment order
  PRICE_SEGMENTS.forEach(segment => {
    const r = segmentMap[segment] || {};

    // VALUE ROW
    const mtdVal = r.mtdVal || 0;
    const lmtdVal = r.lmtdVal || 0;

    valueTable.push({
      Seg: segment,
      [k1]: r.m3Val || 0,
      [k2]: r.m2Val || 0,
      [k3]: r.m1Val || 0,
      MTD: mtdVal,
      LMTD: lmtdVal,
      FTD: r.ftdVal || 0,
      "G/D%": safeDivPct(mtdVal, lmtdVal),
      "Exp.Ach": 0,
      WMF: projectWMF(mtdVal)
    });

    // VOLUME ROW
    const mtdQty = r.mtdQty || 0;
    const lmtdQty = r.lmtdQty || 0;

    volumeTable.push({
      Seg: segment,
      [k1]: r.m3Qty || 0,
      [k2]: r.m2Qty || 0,
      [k3]: r.m1Qty || 0,
      MTD: mtdQty,
      LMTD: lmtdQty,
      FTD: r.ftdQty || 0,
      "G/D%": safeDivPct(mtdQty, lmtdQty),
      "Exp.Ach": 0,
      WMF: projectWMF(mtdQty)
    });
  });

  // TOTAL ROW (matches screenshot style)
  const sumCols = (rows, key) => rows.reduce((a, r) => a + (Number(r[key]) || 0), 0);

  const totalValue = {
    Seg: "Total",
    [k1]: sumCols(valueTable, k1),
    [k2]: sumCols(valueTable, k2),
    [k3]: sumCols(valueTable, k3),
    MTD: sumCols(valueTable, "MTD"),
    LMTD: sumCols(valueTable, "LMTD"),
    FTD: sumCols(valueTable, "FTD"),
    "G/D%": null,
    "Exp.Ach": sumCols(valueTable, "Exp.Ach"),
    WMF: sumCols(valueTable, "WMF")
  };

  const totalVolume = {
    Seg: "Total",
    [k1]: sumCols(volumeTable, k1),
    [k2]: sumCols(volumeTable, k2),
    [k3]: sumCols(volumeTable, k3),
    MTD: sumCols(volumeTable, "MTD"),
    LMTD: sumCols(volumeTable, "LMTD"),
    FTD: sumCols(volumeTable, "FTD"),
    "G/D%": null,
    "Exp.Ach": sumCols(volumeTable, "Exp.Ach"),
    WMF: sumCols(volumeTable, "WMF")
  };

  valueTable.push(totalValue);
  volumeTable.push(totalVolume);

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
      hasProductIssue: (unmapped.rows || 0) > 0
    }
  };
}