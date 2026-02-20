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

async function getPriceSegmentSummaryActivation(
  dealerCodes,
  startDate,
  endDate,
  isAdmin
) {

  const safeCodes = Array.isArray(dealerCodes) ? dealerCodes : [];

  const result = await ActivationData.aggregate([

    // -----------------------------
    // Parse Activation Date
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
                day: { $toInt: { $arrayElemAt: ["$$parts", 1] } }
              }
            }
          }
        },
        inHierarchy: {
          $in: ["$tertiary_buyer_code", safeCodes]
        }
      }
    },

    // -----------------------------
    // DATE RANGE FILTER
    // -----------------------------
    {
      $match: {
        parsedDate: {
          $gte: startDate.toDate(),
          $lte: endDate.toDate()
        }
      }
    },

    // -----------------------------
    // PRODUCT LOOKUP
    // -----------------------------
    {
      $lookup: {
        from: "productmasters",
        localField: "sku",
        foreignField: "sku",
        as: "product"
      }
    },

    {
      $facet: {

        // RAW TOTAL
        totalRaw: [
          {
            $group: {
              _id: null,
              totalRows: { $sum: 1 },
              totalVal: { $sum: "$val" },
              totalQty: { $sum: "$qty" }
            }
          }
        ],

        // UNMAPPED PRODUCT
        unmappedProduct: [
          { $match: { product: { $eq: [] } } },
          {
            $group: {
              _id: null,
              rows: { $sum: 1 },
              totalVal: { $sum: "$val" },
              totalQty: { $sum: "$qty" }
            }
          }
        ],

        // HIERARCHY EXCLUDED
        hierarchyExcluded: [
          { $match: { inHierarchy: false } },
          {
            $group: {
              _id: null,
              rows: { $sum: 1 },
              totalVal: { $sum: "$val" },
              totalQty: { $sum: "$qty" }
            }
          }
        ],

        // MAIN TABLE
        tableData: [
          { $unwind: "$product" },
          {
            $match: isAdmin
              ? {}                // admin → no hierarchy filter
              : { inHierarchy: true }  // non-admin → filter
          },
          {
            $group: {
              _id: "$product.sub_segment",
              totalVal: { $sum: "$val" },
              totalQty: { $sum: "$qty" }
            }
          }
        ]
      }
    }
  ]);

  return formatPriceSegmentTable(result[0], isAdmin);
}

function formatPriceSegmentTable(data, isAdmin) {

  const valueTable = [];
  const volumeTable = [];

  const segmentMap = {};
  (data.tableData || []).forEach(r => {
    segmentMap[r._id] = r;
  });

  PRICE_SEGMENTS.forEach(segment => {

    const record = segmentMap[segment] || {};

    valueTable.push({
      Seg: segment,
      MTD: record.totalVal || 0
    });

    volumeTable.push({
      Seg: segment,
      MTD: record.totalQty || 0
    });
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
      hasProductIssue: (unmapped.rows || 0) > 0
    }
  };
}