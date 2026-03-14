const ActivationData = require("../../model/ActivationData");
const { PRICE_SEGMENTS } = require("../../config/price_segment_config");

// ---------- Shared formatter ----------
function formatSegmentTable(data, isAdmin, meta, segmentOrder) {
  const valueTable = [];
  const volumeTable = [];
  const { k1, k2, k3 } = meta.monthKeys;

  const segmentMap = {};
  (data.tableData || []).forEach((r) => {
    segmentMap[r._id] = r;
  });

  const growthPct = (mtd, lmtd) => {
    if (!lmtd || lmtd === 0) return 0;
    return ((mtd - lmtd) / lmtd) * 100;
  };

  const projectWMF = (mtd) => {
    const { elapsedDays, totalDays } = meta;
    if (!elapsedDays || elapsedDays <= 0) return 0;
    return (mtd / elapsedDays) * totalDays;
  };

  segmentOrder.forEach((seg) => {
    const r = segmentMap[seg] || {};

    const mtdVal = r.mtdVal || 0;
    const lmtdVal = r.lmtdVal || 0;

    valueTable.push({
      Seg: seg,
      [k1]: r.m3Val || 0,
      [k2]: r.m2Val || 0,
      [k3]: r.m1Val || 0,
      MTD: mtdVal,
      LMTD: lmtdVal,
      FTD: r.ftdVal || 0,
      "G/D%": growthPct(mtdVal, lmtdVal),
      "Exp.Ach": 0,
      WMF: projectWMF(mtdVal),
    });

    const mtdQty = r.mtdQty || 0;
    const lmtdQty = r.lmtdQty || 0;

    volumeTable.push({
      Seg: seg,
      [k1]: r.m3Qty || 0,
      [k2]: r.m2Qty || 0,
      [k3]: r.m1Qty || 0,
      MTD: mtdQty,
      LMTD: lmtdQty,
      FTD: r.ftdQty || 0,
      "G/D%": growthPct(mtdQty, lmtdQty),
      "Exp.Ach": 0,
      WMF: projectWMF(mtdQty),
    });
  });

  const sumCols = (rows, key) =>
    rows.reduce((a, r) => a + (Number(r[key]) || 0), 0);

  valueTable.push({
    Seg: "Total",
    [k1]: sumCols(valueTable, k1),
    [k2]: sumCols(valueTable, k2),
    [k3]: sumCols(valueTable, k3),
    MTD: sumCols(valueTable, "MTD"),
    LMTD: sumCols(valueTable, "LMTD"),
    FTD: sumCols(valueTable, "FTD"),
    "G/D%": null,
    "Exp.Ach": sumCols(valueTable, "Exp.Ach"),
    WMF: sumCols(valueTable, "WMF"),
  });

  volumeTable.push({
    Seg: "Total",
    [k1]: sumCols(volumeTable, k1),
    [k2]: sumCols(volumeTable, k2),
    [k3]: sumCols(volumeTable, k3),
    MTD: sumCols(volumeTable, "MTD"),
    LMTD: sumCols(volumeTable, "LMTD"),
    FTD: sumCols(volumeTable, "FTD"),
    "G/D%": null,
    "Exp.Ach": sumCols(volumeTable, "Exp.Ach"),
    WMF: sumCols(volumeTable, "WMF"),
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
      hasProductIssue: (unmapped.rows || 0) > 0,
    },
  };
}

// ---------- Generic builder ----------
async function buildPriceSegmentReport({
  Model,
  dealerCodes,
  startDate,
  endDate,
  lmtdStart,
  lmtdEnd,
  ftdRawDate,
  lastThreeMonths,
  isAdmin,
  segmentOrder,
  needsLookup,
  groupByExpr,
  extraAddFields,
  includeUnmappedProduct,
}) {
  const safeCodes = Array.isArray(dealerCodes) ? dealerCodes : [];

  const k1 = lastThreeMonths[0];
  const k2 = lastThreeMonths[1];
  const k3 = lastThreeMonths[2];

  const pipeline = [
    {
      $addFields: {
        parsedDate: {
          $let: {
            vars: { parts: { $split: ["$activation_date_raw", "/"] } },
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
        inHierarchy: { $in: ["$tertiary_buyer_code", safeCodes] }
      }
    }
  ];

  if (needsLookup) {
    pipeline.push({
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
                  { $eq: ["$sku", "$$pcode"] }
                ]
              }
            }
          }
        ],
        as: "product"
      }
    });
  }

  if (extraAddFields) {
    if (Array.isArray(extraAddFields)) pipeline.push(...extraAddFields);
    else pipeline.push(extraAddFields);
  }

  pipeline.push({
    $facet: {
      totalRaw: [
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
            totalRows: { $sum: 1 },
            totalVal: { $sum: "$val" },
            totalQty: { $sum: "$qty" }
          }
        }
      ],

      unmappedProduct: includeUnmappedProduct
        ? [
            {
              $match: {
                parsedDate: {
                  $gte: startDate.toDate(),
                  $lte: endDate.toDate()
                },
                product: { $eq: [] }
              }
            },
            {
              $group: {
                _id: null,
                rows: { $sum: 1 },
                totalVal: { $sum: "$val" },
                totalQty: { $sum: "$qty" }
              }
            }
          ]
        : [{ $match: { _id: null } }],

      hierarchyExcluded: [
        {
          $match: {
            parsedDate: {
              $gte: startDate.toDate(),
              $lte: endDate.toDate()
            },
            inHierarchy: false
          }
        },
        {
          $group: {
            _id: null,
            rows: { $sum: 1 },
            totalVal: { $sum: "$val" },
            totalQty: { $sum: "$qty" }
          }
        }
      ],

      tableData: [
        ...(needsLookup ? [{ $unwind: "$product" }] : []),
        {
          $group: {
            _id: groupByExpr,

            m3Val: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$year_month", k1] },
                      { $or: ["$inHierarchy", isAdmin] }
                    ]
                  },
                  "$val",
                  0
                ]
              }
            },
            m2Val: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$year_month", k2] },
                      { $or: ["$inHierarchy", isAdmin] }
                    ]
                  },
                  "$val",
                  0
                ]
              }
            },
            m1Val: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$year_month", k3] },
                      { $or: ["$inHierarchy", isAdmin] }
                    ]
                  },
                  "$val",
                  0
                ]
              }
            },

            m3Qty: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$year_month", k1] },
                      { $or: ["$inHierarchy", isAdmin] }
                    ]
                  },
                  "$qty",
                  0
                ]
              }
            },
            m2Qty: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$year_month", k2] },
                      { $or: ["$inHierarchy", isAdmin] }
                    ]
                  },
                  "$qty",
                  0
                ]
              }
            },
            m1Qty: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$year_month", k3] },
                      { $or: ["$inHierarchy", isAdmin] }
                    ]
                  },
                  "$qty",
                  0
                ]
              }
            },

            mtdVal: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gte: ["$parsedDate", startDate.toDate()] },
                      { $lte: ["$parsedDate", endDate.toDate()] },
                      { $or: ["$inHierarchy", isAdmin] }
                    ]
                  },
                  "$val",
                  0
                ]
              }
            },
            mtdQty: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gte: ["$parsedDate", startDate.toDate()] },
                      { $lte: ["$parsedDate", endDate.toDate()] },
                      { $or: ["$inHierarchy", isAdmin] }
                    ]
                  },
                  "$qty",
                  0
                ]
              }
            },

            lmtdVal: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gte: ["$parsedDate", lmtdStart.toDate()] },
                      { $lte: ["$parsedDate", lmtdEnd.toDate()] },
                      { $or: ["$inHierarchy", isAdmin] }
                    ]
                  },
                  "$val",
                  0
                ]
              }
            },
            lmtdQty: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gte: ["$parsedDate", lmtdStart.toDate()] },
                      { $lte: ["$parsedDate", lmtdEnd.toDate()] },
                      { $or: ["$inHierarchy", isAdmin] }
                    ]
                  },
                  "$qty",
                  0
                ]
              }
            },

            ftdVal: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$activation_date_raw", ftdRawDate] },
                      { $or: ["$inHierarchy", isAdmin] }
                    ]
                  },
                  "$val",
                  0
                ]
              }
            },
            ftdQty: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$activation_date_raw", ftdRawDate] },
                      { $or: ["$inHierarchy", isAdmin] }
                    ]
                  },
                  "$qty",
                  0
                ]
              }
            }
          }
        }
      ]
    }
  });

  const result = await Model.aggregate(pipeline);

  return formatSegmentTable(
    result[0],
    isAdmin,
    {
      monthKeys: { k1, k2, k3 },
      elapsedDays: endDate.date(),
      totalDays: endDate.daysInMonth(),
    },
    segmentOrder
  );
}

exports.getPriceSegmentSummaryActivation = async (
  dealerCodes,
  startDate,
  endDate,
  lmtdStart,
  lmtdEnd,
  ftdRawDate,
  lastThreeMonths,
  isAdmin
) => {
  return buildPriceSegmentReport({
    Model: ActivationData,
    dealerCodes,
    startDate,
    endDate,
    lmtdStart,
    lmtdEnd,
    ftdRawDate,
    lastThreeMonths,
    isAdmin,
    segmentOrder: PRICE_SEGMENTS,
    needsLookup: true,
    groupByExpr: "$product.sub_segment",
    extraAddFields: null,
    includeUnmappedProduct: true,
  });
};

exports.getPrice40kSplitSummaryActivation = async (
  dealerCodes,
  startDate,
  endDate,
  lmtdStart,
  lmtdEnd,
  ftdRawDate,
  lastThreeMonths,
  isAdmin
) => {
  const THRESHOLD = 40000;

  return buildPriceSegmentReport({
    Model: ActivationData,
    dealerCodes,
    startDate,
    endDate,
    lmtdStart,
    lmtdEnd,
    ftdRawDate,
    lastThreeMonths,
    isAdmin,
    segmentOrder: ["40K", ">40K"],
    needsLookup: false,
    groupByExpr: "$band",
    includeUnmappedProduct: false,
    extraAddFields: {
      $addFields: {
        unitPrice: {
          $cond: [{ $gt: ["$qty", 0] }, { $divide: ["$val", "$qty"] }, 0]
        },
        band: {
          $cond: [{ $lte: ["$unitPrice", THRESHOLD] }, "40K", ">40K"]
        }
      }
    },
  });
};