const ActorCode = require("../../model/ActorCode");
const ActorTypesHierarchy = require("../../model/ActorTypesHierarchy");
const Firm = require("../../model/Firm");
const HierarchyEntries = require("../../model/HierarchyEntries");
const Product = require("../../model/Product");
const SalesData = require("../../model/SalesData");
const User = require("../../model/User");

exports.getSubordinatesByCode = async (req, res) => {
  try {
    console.log("Reaacchhhh");
    const { code, filter_type = "value", start_date, end_date } = req.body;

    if (!code || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: "Code, start_date, and end_date are required.",
      });
    }

    // Fetch actor details
    const actor = await ActorCode.findOne({ code });
    if (!actor) {
      return res
        .status(404)
        .json({ success: false, message: "Actor not found." });
    }

    const { position } = actor;
    if (!position) {
      return res
        .status(400)
        .json({ success: false, message: "Position not found for this user." });
    }

    // Fetch hierarchy from actorTypesHierarchy
    const actorHierarchy = await ActorTypesHierarchy.findOne({
      name: "default_sales_flow",
    });
    if (!actorHierarchy) {
      return res
        .status(500)
        .json({ success: false, message: "Hierarchy data not found." });
    }

    // Extract allPositions dynamically
    const allPositions = actorHierarchy.hierarchy || [];
    const default_sales_flow = actorHierarchy.default_sales_flow;

    const userPositionIndex = allPositions.indexOf(position);
    if (
      userPositionIndex === -1 ||
      userPositionIndex === allPositions.length - 1
    ) {
      return res
        .status(200)
        .json({ success: true, position: null, subordinates: {} });
    }

    // Get the immediate next subordinate position
    const nextSubordinatePosition = allPositions[userPositionIndex + 1];

    // Fetch hierarchy entries
    const hierarchyEntries = await HierarchyEntries.find({ [position]: code });
    if (!hierarchyEntries.length) {
      return res
        .status(200)
        .json({ success: true, position: null, subordinates: {} });
    }

    // Collect subordinate codes
    let subordinateCodes = hierarchyEntries
      .map((entry) => entry[nextSubordinatePosition])
      .filter(Boolean);
    if (!subordinateCodes.length) {
      return res.status(200).json({
        success: true,
        position: nextSubordinatePosition,
        subordinates: {},
      });
    }

    // Fetch names for subordinate codes
    let subordinates = await ActorCode.find(
      { code: { $in: subordinateCodes } },
      { code: 1, name: 1, _id: 0 }
    );

    // Convert dates to IST
    const convertToIST = (date) => {
      let d = new Date(date);
      return new Date(d.getTime() + 5.5 * 60 * 60 * 1000); // Convert UTC to IST
    };

    const startDate = convertToIST(new Date(start_date));
    const endDate = convertToIST(new Date(end_date));

    // Get last month’s start & end date
    let lmtdStartDate = new Date(startDate);
    lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
    let lmtdEndDate = new Date(endDate);
    lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

    // Fetch sales data for each subordinate
    let salesData = {};
    salesData[nextSubordinatePosition] = await Promise.all(
      subordinates.map(async (sub) => {
        let baseQuery = { buyer_code: sub.code };

        // Fetch MTD Sell Out
        let mtdSellOut = await SalesData.aggregate([
          {
            $match: {
              ...baseQuery,
              sales_type: "Sell Out",
              date: { $gte: startDate, $lte: endDate },
            },
          },
          {
            $group: {
              _id: null,
              total: {
                $sum: {
                  $toDouble: `$${
                    filter_type === "value" ? "total_amount" : "quantity"
                  }`,
                },
              },
            },
          },
        ]);

        // Fetch LMTD Sell Out
        let lmtdSellOut = await SalesData.aggregate([
          {
            $match: {
              ...baseQuery,
              sales_type: "Sell Out",
              date: { $gte: lmtdStartDate, $lte: lmtdEndDate },
            },
          },
          {
            $group: {
              _id: null,
              total: {
                $sum: {
                  $toDouble: `$${
                    filter_type === "value" ? "total_amount" : "quantity"
                  }`,
                },
              },
            },
          },
        ]);

        // Calculate Growth %
        const calculateGrowth = (current, last) =>
          last !== 0 ? ((current - last) / last) * 100 : 0;

        return {
          code: sub.code,
          name: sub.name,
          mtd_sell_out: mtdSellOut.length > 0 ? mtdSellOut[0].total : 0,
          lmtd_sell_out: lmtdSellOut.length > 0 ? lmtdSellOut[0].total : 0,
          sell_out_growth: calculateGrowth(
            mtdSellOut.length > 0 ? mtdSellOut[0].total : 0,
            lmtdSellOut.length > 0 ? lmtdSellOut[0].total : 0
          ).toFixed(2),
        };
      })
    );

    res.status(200).json({
      success: true,
      position: nextSubordinatePosition,
      subordinates: salesData,
      default_sales_flow,
    });
  } catch (error) {
    console.error("Error in getSubordinatesByCode:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.getSubordinatesForUser = async (req, res) => {
  try {
    console.log("Subods reaching");
    const { code } = req.user;
    const {
      filter_type = "value",
      start_date,
      end_date,
      subordinate_codes = [],
      product_categories = [], // ✅ category filtering included
    } = req.body;

    console.log("Subordinate:", subordinate_codes, "Categories:", product_categories);

    if (!code || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: "Code, start_date, and end_date are required.",
      });
    }

    const actor = await ActorCode.findOne({ code });
    if (!actor)
      return res.status(404).json({ success: false, message: "Actor not found." });

    const { position, role } = actor;
    if (!position)
      return res.status(400).json({ success: false, message: "Position not found for this user." });

    const actorHierarchy = await ActorTypesHierarchy.findOne({
      name: "default_sales_flow",
    });
    if (!actorHierarchy || !actorHierarchy.hierarchy) {
      return res.status(500).json({ success: false, message: "Hierarchy data not found." });
    }

    const allPositions = actorHierarchy.hierarchy;
    let subordinatePositions = [];
    let hierarchyEntries = [];
    const subordinates = [];
    const allDealerCodesSet = new Set();
    const addedSubordinateCodes = new Set();

    // === Hierarchy logic ===
    if (["admin", "super_admin"].includes(role)) {
      subordinatePositions = allPositions;

      hierarchyEntries = await HierarchyEntries.find({
        hierarchy_name: "default_sales_flow",
      });

      for (const subPosition of subordinatePositions) {
        const filteredEntries = hierarchyEntries.filter((entry) => entry[subPosition]);
        const subCodes = [
          ...new Set(
            filteredEntries
              .map((entry) => entry[subPosition])
              .filter((code) => code && !addedSubordinateCodes.has(code))
          ),
        ];

        const subs = await ActorCode.find(
          { code: { $in: subCodes } },
          { code: 1, name: 1, _id: 0 }
        );

        for (const sub of subs) {
          addedSubordinateCodes.add(sub.code);

          const subHierarchyDealers = filteredEntries
            .filter((entry) => entry[subPosition] === sub.code && entry.dealer)
            .map((entry) => entry.dealer);

          subHierarchyDealers.forEach((code) => allDealerCodesSet.add(code));
          if (subPosition === "dealer") allDealerCodesSet.add(sub.code);

          subordinates.push({
            code: sub.code,
            name: sub.name,
            position: subPosition,
          });
        }
      }

      console.log("Admin bypass active — fetching all dealer codes from SalesData");
      const allSalesDealers = await SalesData.distinct("buyer_code");
      allSalesDealers.forEach((code) => allDealerCodesSet.add(code));
    } else {
      // === Non-admin logic ===
      const userPositionIndex = allPositions.indexOf(position);
      if (userPositionIndex === -1 || userPositionIndex >= allPositions.length - 1) {
        return res.status(200).json({ success: true, positions: [], subordinates: [] });
      }

      subordinatePositions = allPositions.slice(userPositionIndex + 1);

      if (subordinate_codes.length > 0) {
        hierarchyEntries = await HierarchyEntries.find({
          hierarchy_name: "default_sales_flow",
          $and: subordinate_codes.map((code) => ({
            $or: allPositions.map((pos) => ({ [pos]: code })),
          })),
        });
      } else {
        hierarchyEntries = await HierarchyEntries.find({ [position]: code });
      }

      for (const subPosition of subordinatePositions) {
        const filteredEntries = hierarchyEntries.filter((entry) => entry[subPosition]);
        const subCodes = [
          ...new Set(
            filteredEntries
              .map((entry) => entry[subPosition])
              .filter((code) => code && !addedSubordinateCodes.has(code))
          ),
        ];
        const subs = await ActorCode.find(
          { code: { $in: subCodes } },
          { code: 1, name: 1, _id: 0 }
        );

        for (const sub of subs) {
          addedSubordinateCodes.add(sub.code);

          const subHierarchyDealers = filteredEntries
            .filter((entry) => entry[subPosition] === sub.code && entry.dealer)
            .map((entry) => entry.dealer);

          subHierarchyDealers.forEach((code) => allDealerCodesSet.add(code));
          if (subPosition === "dealer") allDealerCodesSet.add(sub.code);

          subordinates.push({
            code: sub.code,
            name: sub.name,
            position: subPosition,
          });
        }
      }
    }

    // === Date setup ===
    const startDate = new Date(start_date);
    startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(end_date);
    endDate.setUTCHours(0, 0, 0, 0);

    const lmtdStartDate = new Date(startDate);
    lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
    const lmtdEndDate = new Date(endDate);
    lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);
    if (lmtdEndDate.getMonth() === endDate.getMonth()) lmtdEndDate.setDate(0);
    lmtdEndDate.setUTCHours(23, 59, 59, 999);

    // ✅ Dealer & category adjustment logic (NEW, matching dashboard api)
    let dealerCodes = [];
    const hasProductCategories = Array.isArray(product_categories) && product_categories.length > 0;

    // 🩵 SPD/DMDD special logic
    if (
      Array.isArray(subordinate_codes) &&
      subordinate_codes.length === 1 &&
      (subordinate_codes[0] === "SPD" || subordinate_codes[0] === "DMDD")
    ) {
      const actorHierarchySPD = await ActorTypesHierarchy.findOne({ name: "default_sales_flow" });
      if (!actorHierarchySPD || !actorHierarchySPD.hierarchy) {
        return res.status(500).json({
          success: false,
          message: "Hierarchy data not found.",
        });
      }

      const hierarchyEntriesSPD = await HierarchyEntries.find({
        hierarchy_name: "default_sales_flow",
      });

      let filteredEntries = [];
      if (subordinate_codes.includes("SPD")) {
        filteredEntries = hierarchyEntriesSPD.filter((e) => e.mdd && e.mdd !== "4782323");
      } else if (subordinate_codes.includes("DMDD")) {
        filteredEntries = hierarchyEntriesSPD.filter((e) => e.mdd === "4782323");
      }

      dealerCodes = [...new Set(filteredEntries.map((e) => e.dealer).filter(Boolean))];
      console.log(`SPD/DMDD mode active (${subordinate_codes}): ${dealerCodes.length} dealers found.`);
    } else {
      // 🧭 Use last subordinate code to fetch respective dealers
      const dealerFilters = subordinate_codes || [];
      if (dealerFilters.length > 0) {
        const hierarchyConfig = await ActorTypesHierarchy.findOne({
          name: "default_sales_flow",
        });
        if (!hierarchyConfig || !Array.isArray(hierarchyConfig.hierarchy)) {
          return res.status(500).json({
            success: false,
            message: "Hierarchy config not found or invalid.",
          });
        }

        const activeCode = dealerFilters[dealerFilters.length - 1];
        let activeField = null;

        const sampleEntry = await HierarchyEntries.findOne({
          hierarchy_name: "default_sales_flow",
          $or: [
            { smd: activeCode },
            { asm: activeCode },
            { mdd: activeCode },
            { tse: activeCode },
            { dealer: activeCode },
          ],
        });

        if (sampleEntry) {
          for (const level of hierarchyConfig.hierarchy) {
            if (sampleEntry[level] === activeCode) {
              activeField = level;
              break;
            }
          }
        }

        activeField =
          activeField ||
          hierarchyConfig.hierarchy[Math.min(
            dealerFilters.length - 1,
            hierarchyConfig.hierarchy.length - 1
          )];

        const hierarchyEntriesFiltered = await HierarchyEntries.find({
          hierarchy_name: "default_sales_flow",
          [activeField]: activeCode,
        });

        dealerCodes = [
          ...new Set(hierarchyEntriesFiltered.map((entry) => entry.dealer).filter(Boolean)),
        ];
      } else {
        dealerCodes = [...allDealerCodesSet];
      }
    }

    // === Category-wise Sell Out aggregation using dealerCodes (like dashboard)
    const normalize = (str = "") => str.toLowerCase().replace(/[_\s]+/g, "");
    const normalizedSelected = product_categories.map(normalize);

    const buildCategoryQuery = (dateRange) => ({
      sales_type: "Sell Out",
      date: { $gte: dateRange.start, $lte: dateRange.end },
      ...(dealerCodes.length > 0 ? { buyer_code: { $in: dealerCodes } } : {}),
      ...(hasProductCategories
        ? {
            $expr: {
              $in: [
                {
                  $toLower: {
                    $replaceAll: {
                      input: { $ifNull: ["$product_category", ""] },
                      find: " ",
                      replacement: "",
                    },
                  },
                },
                normalizedSelected,
              ],
            },
          }
        : {}),
    });

    const mtdSalesRaw = await SalesData.find(buildCategoryQuery({ start: startDate, end: endDate }), {
      product_category: 1,
      total_amount: 1,
      quantity: 1,
    });
    const lmtdSalesRaw = await SalesData.find(
      buildCategoryQuery({ start: lmtdStartDate, end: lmtdEndDate }),
      { product_category: 1, total_amount: 1, quantity: 1 }
    );

    const enrich = (sales) =>
      sales.map((s) => ({
        ...s._doc,
        category: s.product_category || "Uncategorized",
      }));

    const enrichedMTDSales = enrich(mtdSalesRaw);
    const enrichedLMTDSales = enrich(lmtdSalesRaw);

    const sumByCategory = (sales) =>
      sales.reduce((map, s) => {
        const val =
          filter_type === "value" ? parseFloat(s.total_amount) : parseFloat(s.quantity);
        map[s.category] = (map[s.category] || 0) + (isNaN(val) ? 0 : val);
        return map;
      }, {});

    const mtdCategoryMap = sumByCategory(enrichedMTDSales);
    const lmtdCategoryMap = sumByCategory(enrichedLMTDSales);
    const allCategories = new Set([
      ...Object.keys(mtdCategoryMap),
      ...Object.keys(lmtdCategoryMap),
    ]);

    if (allCategories.size > 0) {
      const categoryWiseSales = [...allCategories].map((cat) => {
        const mtd = mtdCategoryMap[cat] || 0;
        const lmtd = lmtdCategoryMap[cat] || 0;
        const growth = lmtd !== 0 ? ((mtd - lmtd) / lmtd) * 100 : 0;
        return {
          code: cat,
          name: cat,
          position: "product_category",
          scope: "within_subordinates",
          mtd_sell_out: mtd,
          lmtd_sell_out: lmtd,
          sell_out_growth: growth.toFixed(2),
        };
      });
      subordinates.push(...categoryWiseSales);
    }

    res.status(200).json({
      success: true,
      positions: [
        ...new Set([
          ...subordinatePositions,
          "product_category",
          "taluka",
          "district",
          "town",
          "dealer_category",
        ]),
      ],
      subordinates,
    });
  } catch (error) {
    console.error("Error in getSubordinatesForUser:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};




exports.getHierarchyDataStats = async (req, res) => {
  try {
    console.log("Lazy hierarchy API reached");

    const { code } = req.user;
    const {
      filter_type = "value",
      start_date,
      end_date,
      position, // e.g. "division", "asm", "mdd", "tse", "dealer", "district", ...
      parent_code,
      page = 1,
      limit = 50,
      product_categories = [], // ✅ added
    } = req.body;

    console.log("Parent code: ", parent_code)

    if (!code || !start_date || !end_date || !position) {
      return res.status(400).json({
        success: false,
        message: "Code, start_date, end_date, and position are required.",
      });
    }

    // === STEP 1: Resolve user + hierarchy
    const actor = await ActorCode.findOne({ code });
    if (!actor)
      return res
        .status(404)
        .json({ success: false, message: "Actor not found." });

    const { role } = actor;

    const actorHierarchy = await ActorTypesHierarchy.findOne({
      name: "default_sales_flow",
    });
    if (!actorHierarchy || !actorHierarchy.hierarchy) {
      return res
        .status(500)
        .json({ success: false, message: "Hierarchy data not found." });
    }

    const allPositions = actorHierarchy.hierarchy;

    // === STEP 2: Collect hierarchy entries
    let hierarchyEntries = [];
    if (parent_code === "SPD") {
      hierarchyEntries = await HierarchyEntries.find({
        hierarchy_name: "default_sales_flow",
        mdd: { $ne: "4782323" },
      });
    } else if (parent_code === "DMDD") {
      hierarchyEntries = await HierarchyEntries.find({
        hierarchy_name: "default_sales_flow",
        mdd: "4782323",
      });
    } else if (parent_code) {
      hierarchyEntries = await HierarchyEntries.find({
        hierarchy_name: "default_sales_flow",
        $or: allPositions.map((pos) => ({ [pos]: parent_code })),
      });
    } else if (["admin", "super_admin"].includes(role)) {
      hierarchyEntries = await HierarchyEntries.find({
        hierarchy_name: "default_sales_flow",
      });
    } else {
      hierarchyEntries = await HierarchyEntries.find({
        [actor.position]: code,
      });
    }

    // ✅ Category handling setup
    const hasProductCategories =
      Array.isArray(product_categories) && product_categories.length > 0;
    const normalize = (str = "") => str.toLowerCase().replace(/[_\s]+/g, "");
    const normalizedSelected = product_categories.map(normalize);

    // === Special case for "division"
    if (position === "division") {
      const spdEntries = hierarchyEntries.filter(
        (e) => e.mdd && e.mdd !== "4782323"
      );
      const dmddEntries = hierarchyEntries.filter(
        (e) => e.mdd === "4782323"
      );

      const spdDealers = [
        ...new Set(spdEntries.map((e) => e.dealer).filter(Boolean)),
      ];
      const dmddDealers = [
        ...new Set(dmddEntries.map((e) => e.dealer).filter(Boolean)),
      ];

      const startDate = new Date(start_date);
      startDate.setUTCHours(0, 0, 0, 0);
      const endDate = new Date(end_date);
      endDate.setUTCHours(0, 0, 0, 0);

      const lmtdStartDate = new Date(startDate);
      lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
      const lmtdEndDate = new Date(endDate);
      lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

      const aggSales = async (dealers, from, to) => {
        if (dealers.length === 0) return 0;
        const matchQuery = {
          buyer_code: { $in: dealers },
          sales_type: "Sell Out",
          date: { $gte: from, $lte: to },
        };
        if (hasProductCategories) {
          matchQuery.$expr = {
            $in: [
              {
                $toLower: {
                  $replaceAll: {
                    input: { $ifNull: ["$product_category", ""] },
                    find: " ",
                    replacement: "",
                  },
                },
              },
              normalizedSelected,
            ],
          };
        }

        const result = await SalesData.aggregate([
          { $match: matchQuery },
          {
            $group: {
              _id: null,
              total: {
                $sum: {
                  $toDouble:
                    `$${filter_type === "value" ? "total_amount" : "quantity"}`,
                },
              },
            },
          },
        ]);
        return result.length > 0 ? result[0].total : 0;
      };

      const spd_mtd = await aggSales(spdDealers, startDate, endDate);
      const spd_lmtd = await aggSales(spdDealers, lmtdStartDate, lmtdEndDate);
      const dmdd_mtd = await aggSales(dmddDealers, startDate, endDate);
      const dmdd_lmtd = await aggSales(dmddDealers, lmtdStartDate, lmtdEndDate);

      const calcGrowth = (a, b) => (b !== 0 ? ((a - b) / b) * 100 : 0);

      return res.status(200).json({
        success: true,
        position: "division",
        subordinates: [
          {
            code: "SPD",
            name: "SPD",
            position: "division",
            mtd_sell_out: spd_mtd,
            lmtd_sell_out: spd_lmtd,
            sell_out_growth: calcGrowth(spd_mtd, spd_lmtd).toFixed(2),
            "M-1": 0,
            "M-2": 0,
            "M-3": 0,
            ADS: 0,
            FTD: 0,
            TGT: 0,
            "Req. ADS": 0,
            "Contribution%": 0,
          },
          {
            code: "DMDD",
            name: "DMDD",
            position: "division",
            mtd_sell_out: dmdd_mtd,
            lmtd_sell_out: dmdd_lmtd,
            sell_out_growth: calcGrowth(dmdd_mtd, dmdd_lmtd).toFixed(2),
            "M-1": 0,
            "M-2": 0,
            "M-3": 0,
            ADS: 0,
            FTD: 0,
            TGT: 0,
            "Req. ADS": 0,
            "Contribution%": 0,
          },
        ],
      });
    }


    // === STEP 4: For other positions
    const filteredEntries = hierarchyEntries.filter((entry) => entry[position]);
    let subCodes = [
      ...new Set(filteredEntries.map((entry) => entry[position])),
    ];

    let paginated = false;
    if (position === "dealer") {
      paginated = true;
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + parseInt(limit);
      subCodes = subCodes.slice(startIndex, endIndex);
    }

    const subs = await ActorCode.find(
      { code: { $in: subCodes } },
      { code: 1, name: 1, _id: 0 }
    );

    // Collect dealer codes under these subs
    const dealerCodesSet = new Set();
    for (const sub of subs) {
      const subHierarchyDealers = filteredEntries
        .filter((entry) => entry[position] === sub.code && entry.dealer)
        .map((entry) => entry.dealer);
      subHierarchyDealers.forEach((d) => dealerCodesSet.add(d));
      if (position === "dealer") dealerCodesSet.add(sub.code);
    }
    const dealerCodes = [...dealerCodesSet];

    // === Dates
    const startDate = new Date(start_date);
    startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(end_date);
    endDate.setUTCHours(0, 0, 0, 0);
    const lmtdStartDate = new Date(startDate);
    lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
    const lmtdEndDate = new Date(endDate);
    lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

    // === MTD + LMTD Aggregates (now category-aware)
    const makeMatch = (from, to) => {
      const match = {
        buyer_code: { $in: dealerCodes },
        sales_type: "Sell Out",
        date: { $gte: from, $lte: to },
      };
if (hasProductCategories) {
  match.$expr = {
    $in: [
      {
        $toLower: {
          $replaceAll: {
            input: { $ifNull: ["$product_category", ""] },
            find: " ",
            replacement: "",
          },
        },
      },
      normalizedSelected,
    ],
  };
}


      return match;
    };

    const mtdSales = await SalesData.aggregate([
      { $match: makeMatch(startDate, endDate) },
      {
        $group: {
          _id: "$buyer_code",
          total: {
            $sum: {
              $toDouble:
                `$${filter_type === "value" ? "total_amount" : "quantity"}`,
            },
          },
        },
      },
    ]);

    const lmtdSales = await SalesData.aggregate([
      { $match: makeMatch(lmtdStartDate, lmtdEndDate) },
      {
        $group: {
          _id: "$buyer_code",
          total: {
            $sum: {
              $toDouble:
                `$${filter_type === "value" ? "total_amount" : "quantity"}`,
            },
          },
        },
      },
    ]);

    const mtdMap = Object.fromEntries(mtdSales.map((e) => [e._id, e.total]));
    const lmtdMap = Object.fromEntries(lmtdSales.map((e) => [e._id, e.total]));

    const calcGrowth = (a, b) => (b !== 0 ? ((a - b) / b) * 100 : 0);

    // === Extra monthly windows (M-1, M-2, M-3)
    const startOfMonth = new Date(startDate);
    startOfMonth.setDate(1);
    const monthWindows = [1, 2, 3].map((offset) => {
      const mStart = new Date(startOfMonth);
      mStart.setMonth(mStart.getMonth() - offset);
      const mEnd = new Date(mStart.getFullYear(), mStart.getMonth() + 1, 0);
      mStart.setUTCHours(0, 0, 0, 0);
      mEnd.setUTCHours(0, 0, 0, 0);
      return { label: `M-${offset}`, start: mStart, end: mEnd };
    });

    const monthlyMaps = {};
    for (const { label, start, end } of monthWindows) {
      const monthSales = await SalesData.aggregate([
        { $match: makeMatch(start, end) },
        {
          $group: {
            _id: "$buyer_code",
            total: {
              $sum: {
                $toDouble:
                  `$${filter_type === "value" ? "total_amount" : "quantity"}`,
              },
            },
          },
        },
      ]);
      monthlyMaps[label] = Object.fromEntries(
        monthSales.map((e) => [e._id, e.total])
      );
    }

    // === FTD (first day of month)
    const ftdSales = await SalesData.aggregate([
      { $match: makeMatch(startDate, startDate) },
      {
        $group: {
          _id: "$buyer_code",
          total: {
            $sum: {
              $toDouble:
                `$${filter_type === "value" ? "total_amount" : "quantity"}`,
            },
          },
        },
      },
    ]);
    const ftdMap = Object.fromEntries(ftdSales.map((e) => [e._id, e.total]));

    // === Group totals for contribution
    let totalMtd = 0;
    subs.forEach((sub) => {
      const dealerCodesForSub = filteredEntries
        .filter((entry) => entry[position] === sub.code && entry.dealer)
        .map((entry) => entry.dealer);
      if (position === "dealer") dealerCodesForSub.push(sub.code);
      [...new Set(dealerCodesForSub)].forEach((c) => {
        totalMtd += mtdMap[c] || 0;
      });
    });

    const enrichedSubs = subs.map((sub) => {
      const dealerCodesForSub = filteredEntries
        .filter((entry) => entry[position] === sub.code && entry.dealer)
        .map((entry) => entry.dealer);
      if (position === "dealer") dealerCodesForSub.push(sub.code);
      const uniqueDealers = [...new Set(dealerCodesForSub)];

      let mtd = 0,
        lmtd = 0,
        ftd = 0;
      const monthValues = { "M-1": 0, "M-2": 0, "M-3": 0 };
      uniqueDealers.forEach((c) => {
        mtd += mtdMap[c] || 0;
        lmtd += lmtdMap[c] || 0;
        ftd += ftdMap[c] || 0;
        for (const key of ["M-1", "M-2", "M-3"]) {
          monthValues[key] += monthlyMaps[key]?.[c] || 0;
        }
      });

      const todayDate = endDate.getDate();
      const ads = todayDate > 0 ? mtd / todayDate : 0;
      const reqAds = 0;
      const contribution = totalMtd > 0 ? (mtd / totalMtd) * 100 : 0;

      return {
        code: sub.code,
        name: sub.name,
        position,
        mtd_sell_out: mtd,
        lmtd_sell_out: lmtd,
        sell_out_growth: calcGrowth(mtd, lmtd).toFixed(2),
        "M-1": monthValues["M-1"],
        "M-2": monthValues["M-2"],
        "M-3": monthValues["M-3"],
        ADS: ads.toFixed(2),
        FTD: ftd,
        TGT: 0,
        "Req. ADS": reqAds.toFixed(2),
        "Contribution%": contribution.toFixed(2),
      };
    });
    console.log("Response data:", {
      position,
      paginated,
      page,
      limit,
      count: enrichedSubs.length,
      subordinates: enrichedSubs,
    });


    res.status(200).json({
      success: true,
      position,
      paginated,
      page,
      limit,
      count: enrichedSubs.length,
      subordinates: enrichedSubs,
    });
  } catch (error) {
    console.error("Error in getHierarchyData:", error);
    res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// exports.getSubordinatesForUser = async (req, res) => {
//   try {
//     console.log("Subods reaching");
//     const { code } = req.user;
//     const {
//       filter_type = "value",
//       start_date,
//       end_date,
//       subordinate_codes = [],
//       product_categories = [], // ✅ category filtering included
//     } = req.body;

//     console.log("Subordinate:", subordinate_codes, "Categories:", product_categories);

//     if (!code || !start_date || !end_date) {
//       return res.status(400).json({
//         success: false,
//         message: "Code, start_date, and end_date are required.",
//       });
//     }

//     const actor = await ActorCode.findOne({ code });
//     if (!actor)
//       return res.status(404).json({ success: false, message: "Actor not found." });

//     const { position, role } = actor;
//     if (!position)
//       return res.status(400).json({ success: false, message: "Position not found for this user." });

//     const actorHierarchy = await ActorTypesHierarchy.findOne({
//       name: "default_sales_flow",
//     });
//     if (!actorHierarchy || !actorHierarchy.hierarchy) {
//       return res.status(500).json({ success: false, message: "Hierarchy data not found." });
//     }

//     const allPositions = actorHierarchy.hierarchy;
//     let subordinatePositions = [];
//     let hierarchyEntries = [];
//     const subordinates = [];
//     const allDealerCodesSet = new Set();
//     const addedSubordinateCodes = new Set();

//     // === Hierarchy logic ===
//     if (["admin", "super_admin"].includes(role)) {
//       subordinatePositions = allPositions;

//       hierarchyEntries = await HierarchyEntries.find({
//         hierarchy_name: "default_sales_flow",
//       });

//       for (const subPosition of subordinatePositions) {
//         const filteredEntries = hierarchyEntries.filter((entry) => entry[subPosition]);
//         const subCodes = [
//           ...new Set(
//             filteredEntries
//               .map((entry) => entry[subPosition])
//               .filter((code) => code && !addedSubordinateCodes.has(code))
//           ),
//         ];

//         const subs = await ActorCode.find(
//           { code: { $in: subCodes } },
//           { code: 1, name: 1, _id: 0 }
//         );

//         for (const sub of subs) {
//           addedSubordinateCodes.add(sub.code);

//           const subHierarchyDealers = filteredEntries
//             .filter((entry) => entry[subPosition] === sub.code && entry.dealer)
//             .map((entry) => entry.dealer);

//           subHierarchyDealers.forEach((code) => allDealerCodesSet.add(code));
//           if (subPosition === "dealer") allDealerCodesSet.add(sub.code);

//           subordinates.push({
//             code: sub.code,
//             name: sub.name,
//             position: subPosition,
//           });
//         }
//       }

//       console.log("Admin bypass active — fetching all dealer codes from SalesData");
//       const allSalesDealers = await SalesData.distinct("buyer_code");
//       allSalesDealers.forEach((code) => allDealerCodesSet.add(code));
//     } else {
//       // === Non-admin logic ===
//       const userPositionIndex = allPositions.indexOf(position);
//       if (userPositionIndex === -1 || userPositionIndex >= allPositions.length - 1) {
//         return res.status(200).json({ success: true, positions: [], subordinates: [] });
//       }

//       subordinatePositions = allPositions.slice(userPositionIndex + 1);

//       if (subordinate_codes.length > 0) {
//         hierarchyEntries = await HierarchyEntries.find({
//           hierarchy_name: "default_sales_flow",
//           $and: subordinate_codes.map((code) => ({
//             $or: allPositions.map((pos) => ({ [pos]: code })),
//           })),
//         });
//       } else {
//         hierarchyEntries = await HierarchyEntries.find({ [position]: code });
//       }

//       for (const subPosition of subordinatePositions) {
//         const filteredEntries = hierarchyEntries.filter((entry) => entry[subPosition]);
//         const subCodes = [
//           ...new Set(
//             filteredEntries
//               .map((entry) => entry[subPosition])
//               .filter((code) => code && !addedSubordinateCodes.has(code))
//           ),
//         ];
//         const subs = await ActorCode.find(
//           { code: { $in: subCodes } },
//           { code: 1, name: 1, _id: 0 }
//         );

//         for (const sub of subs) {
//           addedSubordinateCodes.add(sub.code);

//           const subHierarchyDealers = filteredEntries
//             .filter((entry) => entry[subPosition] === sub.code && entry.dealer)
//             .map((entry) => entry.dealer);

//           subHierarchyDealers.forEach((code) => allDealerCodesSet.add(code));
//           if (subPosition === "dealer") allDealerCodesSet.add(sub.code);

//           subordinates.push({
//             code: sub.code,
//             name: sub.name,
//             position: subPosition,
//           });
//         }
//       }
//     }

//     // === Date setup ===
//     const startDate = new Date(start_date);
//     startDate.setUTCHours(0, 0, 0, 0);
//     const endDate = new Date(end_date);
//     endDate.setUTCHours(0, 0, 0, 0);

//     const lmtdStartDate = new Date(startDate);
//     lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
//     const lmtdEndDate = new Date(endDate);
//     lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);
//     if (lmtdEndDate.getMonth() === endDate.getMonth()) lmtdEndDate.setDate(0);
//     lmtdEndDate.setUTCHours(23, 59, 59, 999);

//     const allDealerCodes = [...allDealerCodesSet];
//     const hasProductCategories =
//       Array.isArray(product_categories) && product_categories.length > 0;

//     // === Raw sales ===
//     const mtdSalesRaw = await SalesData.find(
//       {
//         sales_type: "Sell Out",
//         date: { $gte: startDate, $lte: endDate },
//         ...(allDealerCodes.length > 0 ? { buyer_code: { $in: allDealerCodes } } : {}),
//       },
//       { buyer_code: 1, product_category: 1, total_amount: 1, quantity: 1 }
//     );

//     const lmtdSalesRaw = await SalesData.find(
//       {
//         sales_type: "Sell Out",
//         date: { $gte: lmtdStartDate, $lte: lmtdEndDate },
//         ...(allDealerCodes.length > 0 ? { buyer_code: { $in: allDealerCodes } } : {}),
//       },
//       { buyer_code: 1, product_category: 1, total_amount: 1, quantity: 1 }
//     );

//     // ✅ Normalize function for flexible category matching
//     const normalize = (str = "") => str.toLowerCase().replace(/[_\s]+/g, "");
//     const normalizedSelected = product_categories.map(normalize);

//     // ✅ Category enrichment (no Product lookup)
//     const enrich = (sales) =>
//       sales
//         .map((s) => ({
//           ...s._doc,
//           category: s.product_category || "Uncategorized",
//         }))
//         .filter(
//           (s) =>
//             !hasProductCategories ||
//             normalizedSelected.includes(normalize(s.category))
//         );

//     const enrichedMTDSales = enrich(mtdSalesRaw);
//     const enrichedLMTDSales = enrich(lmtdSalesRaw);

//     // === Category-wise aggregation ===
//     const sumByCategory = (sales) =>
//       sales.reduce((map, s) => {
//         const val =
//           filter_type === "value" ? parseFloat(s.total_amount) : parseFloat(s.quantity);
//         map[s.category] = (map[s.category] || 0) + (isNaN(val) ? 0 : val);
//         return map;
//       }, {});

//     const mtdCategoryMap = sumByCategory(enrichedMTDSales);
//     const lmtdCategoryMap = sumByCategory(enrichedLMTDSales);
//     const allCategories = new Set([...Object.keys(mtdCategoryMap), ...Object.keys(lmtdCategoryMap)]);

//     // ✅ Modified: categories now coexist with subordinates
//     if (hasProductCategories || allCategories.size > 0) {
//       const categoryScope = allDealerCodes.length > 0 ? "within_subordinates" : "global";
//       const categoryWiseSales = [...allCategories].map((cat) => {
//         const mtd = mtdCategoryMap[cat] || 0;
//         const lmtd = lmtdCategoryMap[cat] || 0;
//         const growth = lmtd !== 0 ? ((mtd - lmtd) / lmtd) * 100 : 0;
//         return {
//           code: cat,
//           name: cat,
//           position: "product_category",
//           scope: categoryScope,
//           mtd_sell_out: mtd,
//           lmtd_sell_out: lmtd,
//           sell_out_growth: growth.toFixed(2),
//         };
//       });
//       subordinates.push(...categoryWiseSales);
//     }

//     // === Standard sales grouping ===
//     const mtdSales = await SalesData.aggregate([
//       {
//         $match: {
//           buyer_code: { $in: allDealerCodes },
//           sales_type: "Sell Out",
//           date: { $gte: startDate, $lte: endDate },
//         },
//       },
//       {
//         $group: {
//           _id: "$buyer_code",
//           total: {
//             $sum: {
//               $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}`,
//             },
//           },
//         },
//       },
//     ]);
//     const lmtdSales = await SalesData.aggregate([
//       {
//         $match: {
//           buyer_code: { $in: allDealerCodes },
//           sales_type: "Sell Out",
//           date: { $gte: lmtdStartDate, $lte: lmtdEndDate },
//         },
//       },
//       {
//         $group: {
//           _id: "$buyer_code",
//           total: {
//             $sum: {
//               $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}`,
//             },
//           },
//         },
//       },
//     ]);

//     const mtdMap = Object.fromEntries(mtdSales.map((e) => [e._id, e.total]));
//     const lmtdMap = Object.fromEntries(lmtdSales.map((e) => [e._id, e.total]));
//     const calculateGrowth = (current, last) => (last !== 0 ? ((current - last) / last) * 100 : 0);

//     subordinates.forEach((sub) => {
//       if (sub.position === "product_category") return;
//       const dealerCodes = hierarchyEntries
//         .filter((entry) => entry[sub.position] === sub.code && entry.dealer)
//         .map((entry) => entry.dealer);
//       if (sub.position === "dealer") dealerCodes.push(sub.code);
//       let mtd = 0,
//         lmtd = 0;
//       [...new Set(dealerCodes)].forEach((code) => {
//         mtd += mtdMap[code] || 0;
//         lmtd += lmtdMap[code] || 0;
//       });
//       sub.mtd_sell_out = mtd;
//       sub.lmtd_sell_out = lmtd;
//       sub.sell_out_growth = calculateGrowth(mtd, lmtd).toFixed(2);
//     });

//     // === FTD, M-1, M-2, M-3, Contribution ===
//     const startOfMonth = new Date(startDate);
//     startOfMonth.setDate(1);
//     startOfMonth.setUTCHours(0, 0, 0, 0);

//     const monthWindows = [1, 2, 3].map((offset) => {
//       const mStart = new Date(startOfMonth);
//       mStart.setMonth(mStart.getMonth() - offset);
//       const mEnd = new Date(mStart.getFullYear(), mStart.getMonth() + 1, 0);
//       mStart.setUTCHours(0, 0, 0, 0);
//       mEnd.setUTCHours(0, 0, 0, 0);
//       return { label: `M-${offset}`, start: mStart, end: mEnd };
//     });

//     const ftdSales = await SalesData.aggregate([
//       {
//         $match: {
//           buyer_code: { $in: allDealerCodes },
//           sales_type: "Sell Out",
//           date: { $eq: startDate },
//         },
//       },
//       {
//         $group: {
//           _id: "$buyer_code",
//           total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } },
//         },
//       },
//     ]);
//     const ftdMap = Object.fromEntries(ftdSales.map((e) => [e._id, e.total]));

//     const monthlyMaps = {};
//     for (const { label, start, end } of monthWindows) {
//       const monthSales = await SalesData.aggregate([
//         {
//           $match: {
//             buyer_code: { $in: allDealerCodes },
//             sales_type: "Sell Out",
//             date: { $gte: start, $lte: end },
//           },
//         },
//         {
//           $group: {
//             _id: "$buyer_code",
//             total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } },
//           },
//         },
//       ]);
//       monthlyMaps[label] = Object.fromEntries(monthSales.map((e) => [e._id, e.total]));
//     }

//     const groupTotals = {};
//     subordinates.forEach((sub) => {
//       groupTotals[sub.position] = (groupTotals[sub.position] || 0) + (sub.mtd_sell_out || 0);
//     });

//     subordinates.forEach((sub) => {
//       if (!sub.code || !sub.position) return;
//       const dealerCodes =
//         sub.position === "dealer"
//           ? [sub.code]
//           : hierarchyEntries
//               .filter((entry) => entry[sub.position] === sub.code && entry.dealer)
//               .map((entry) => entry.dealer);

//       if (sub.position === "dealer") dealerCodes.push(sub.code);
//       const uniqueDealers = [...new Set(dealerCodes)];

//       const monthValues = { "M-1": 0, "M-2": 0, "M-3": 0 };
//       for (const dealer of uniqueDealers) {
//         for (const key of ["M-1", "M-2", "M-3"]) {
//           monthValues[key] += monthlyMaps[key]?.[dealer] || 0;
//         }
//       }

//       const ftd = uniqueDealers.reduce((sum, d) => sum + (ftdMap[d] || 0), 0);
//       const mtd = sub.mtd_sell_out || 0;
//       const todayDate = endDate.getDate();
//       const ads = mtd / todayDate;
//       const reqAds = (0 - mtd) > 0 ? (0 - mtd) / Math.max(30 - todayDate, 1) : 0;
//       const contribution =
//         groupTotals[sub.position] > 0 ? (mtd / groupTotals[sub.position]) * 100 : 0;

//       Object.assign(sub, {
//         "M-1": monthValues["M-1"],
//         "M-2": monthValues["M-2"],
//         "M-3": monthValues["M-3"],
//         ADS: ads.toFixed(2),
//         TGT: 0,
//         FTD: ftd,
//         "Req. ADS": reqAds.toFixed(2),
//         "Contribution%": contribution.toFixed(2),
//       });
//     });

//     res.status(200).json({
//       success: true,
//       positions: [
//         ...new Set([
//           ...subordinatePositions,
//           "product_category",
//           "taluka",
//           "district",
//           "town",
//           "dealer_category",
//         ]),
//       ],
//       subordinates,
//     });
//   } catch (error) {
//     console.error("Error in getSubordinatesForUser:", error);
//     res.status(500).json({ success: false, message: "Internal server error" });
//   }
// };


// exports.getSubordinatesForUser = async (req, res) => {
//   try {
//     console.log("Subods reaching");
//     const { code } = req.user;
//     const {
//       filter_type = "value",
//       start_date,
//       end_date,
//       subordinate_codes = [],
//       product_categories = [], // ✅ category filtering included
//     } = req.body;

//     console.log("Subordinate:", subordinate_codes, "Categories:", product_categories);

//     if (!code || !start_date || !end_date) {
//       return res.status(400).json({
//         success: false,
//         message: "Code, start_date, and end_date are required.",
//       });
//     }

//     const actor = await ActorCode.findOne({ code });
//     if (!actor)
//       return res.status(404).json({ success: false, message: "Actor not found." });

//     const { position, role } = actor;
//     if (!position)
//       return res.status(400).json({ success: false, message: "Position not found for this user." });

//     const actorHierarchy = await ActorTypesHierarchy.findOne({
//       name: "default_sales_flow",
//     });
//     if (!actorHierarchy || !actorHierarchy.hierarchy) {
//       return res.status(500).json({ success: false, message: "Hierarchy data not found." });
//     }

//     const allPositions = actorHierarchy.hierarchy;
//     let subordinatePositions = [];
//     let hierarchyEntries = [];
//     const subordinates = [];
//     const allDealerCodesSet = new Set();
//     const addedSubordinateCodes = new Set();

//     // === Hierarchy logic ===
//     if (["admin", "super_admin"].includes(role)) {
//       subordinatePositions = allPositions;

//       hierarchyEntries = await HierarchyEntries.find({
//         hierarchy_name: "default_sales_flow",
//       });

//       for (const subPosition of subordinatePositions) {
//         const filteredEntries = hierarchyEntries.filter((entry) => entry[subPosition]);
//         const subCodes = [
//           ...new Set(
//             filteredEntries
//               .map((entry) => entry[subPosition])
//               .filter((code) => code && !addedSubordinateCodes.has(code))
//           ),
//         ];

//         const subs = await ActorCode.find(
//           { code: { $in: subCodes } },
//           { code: 1, name: 1, _id: 0 }
//         );

//         for (const sub of subs) {
//           addedSubordinateCodes.add(sub.code);

//           const subHierarchyDealers = filteredEntries
//             .filter((entry) => entry[subPosition] === sub.code && entry.dealer)
//             .map((entry) => entry.dealer);

//           subHierarchyDealers.forEach((code) => allDealerCodesSet.add(code));
//           if (subPosition === "dealer") allDealerCodesSet.add(sub.code);

//           subordinates.push({
//             code: sub.code,
//             name: sub.name,
//             position: subPosition,
//           });
//         }
//       }

//       console.log("Admin bypass active — fetching all dealer codes from SalesData");
//       const allSalesDealers = await SalesData.distinct("buyer_code");
//       allSalesDealers.forEach((code) => allDealerCodesSet.add(code));
//     } else {
//       // === Non-admin logic ===
//       const userPositionIndex = allPositions.indexOf(position);
//       if (userPositionIndex === -1 || userPositionIndex >= allPositions.length - 1) {
//         return res.status(200).json({ success: true, positions: [], subordinates: [] });
//       }

//       subordinatePositions = allPositions.slice(userPositionIndex + 1);

//       if (subordinate_codes.length > 0) {
//         hierarchyEntries = await HierarchyEntries.find({
//           hierarchy_name: "default_sales_flow",
//           $and: subordinate_codes.map((code) => ({
//             $or: allPositions.map((pos) => ({ [pos]: code })),
//           })),
//         });
//       } else {
//         hierarchyEntries = await HierarchyEntries.find({ [position]: code });
//       }

//       for (const subPosition of subordinatePositions) {
//         const filteredEntries = hierarchyEntries.filter((entry) => entry[subPosition]);
//         const subCodes = [
//           ...new Set(
//             filteredEntries
//               .map((entry) => entry[subPosition])
//               .filter((code) => code && !addedSubordinateCodes.has(code))
//           ),
//         ];
//         const subs = await ActorCode.find(
//           { code: { $in: subCodes } },
//           { code: 1, name: 1, _id: 0 }
//         );

//         for (const sub of subs) {
//           addedSubordinateCodes.add(sub.code);

//           const subHierarchyDealers = filteredEntries
//             .filter((entry) => entry[subPosition] === sub.code && entry.dealer)
//             .map((entry) => entry.dealer);

//           subHierarchyDealers.forEach((code) => allDealerCodesSet.add(code));
//           if (subPosition === "dealer") allDealerCodesSet.add(sub.code);

//           subordinates.push({
//             code: sub.code,
//             name: sub.name,
//             position: subPosition,
//           });
//         }
//       }
//     }

//     // === Date setup ===
//     const startDate = new Date(start_date);
//     startDate.setUTCHours(0, 0, 0, 0);
//     const endDate = new Date(end_date);
//     endDate.setUTCHours(0, 0, 0, 0);

//     const lmtdStartDate = new Date(startDate);
//     lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
//     const lmtdEndDate = new Date(endDate);
//     lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);
//     if (lmtdEndDate.getMonth() === endDate.getMonth()) lmtdEndDate.setDate(0);
//     lmtdEndDate.setUTCHours(23, 59, 59, 999);

//     const allDealerCodes = [...allDealerCodesSet];
//     const hasProductCategories =
//       Array.isArray(product_categories) && product_categories.length > 0;

//     // === Raw sales ===
//     const mtdSalesRaw = await SalesData.find(
//       {
//         sales_type: "Sell Out",
//         date: { $gte: startDate, $lte: endDate },
//         ...(allDealerCodes.length > 0 ? { buyer_code: { $in: allDealerCodes } } : {}),
//       },
//       { buyer_code: 1, product_code: 1, total_amount: 1, quantity: 1 }
//     );

//     const lmtdSalesRaw = await SalesData.find(
//       {
//         sales_type: "Sell Out",
//         date: { $gte: lmtdStartDate, $lte: lmtdEndDate },
//         ...(allDealerCodes.length > 0 ? { buyer_code: { $in: allDealerCodes } } : {}),
//       },
//       { buyer_code: 1, product_code: 1, total_amount: 1, quantity: 1 }
//     );

//     // === Product map ===
//     const allProductCodes = [
//       ...new Set([...mtdSalesRaw.map((s) => s.product_code), ...lmtdSalesRaw.map((s) => s.product_code)]),
//     ];
//     const productDocs = await Product.find(
//       { product_code: { $in: allProductCodes } },
//       { product_code: 1, product_category: 1, _id: 0 }
//     );
//     const productMap = Object.fromEntries(
//       productDocs.map((p) => [p.product_code, p.product_category || "Uncategorized"])
//     );

//     const enrich = (sales) =>
//       sales
//         .map((s) => ({
//           ...s._doc,
//           category: productMap[s.product_code] || "Uncategorized",
//         }))
//         .filter((s) => !hasProductCategories || product_categories.includes(s.category));

//     const enrichedMTDSales = enrich(mtdSalesRaw);
//     const enrichedLMTDSales = enrich(lmtdSalesRaw);

//     // === Category-wise aggregation ===
//     const sumByCategory = (sales) =>
//       sales.reduce((map, s) => {
//         const val =
//           filter_type === "value" ? parseFloat(s.total_amount) : parseFloat(s.quantity);
//         map[s.category] = (map[s.category] || 0) + (isNaN(val) ? 0 : val);
//         return map;
//       }, {});

//     const mtdCategoryMap = sumByCategory(enrichedMTDSales);
//     const lmtdCategoryMap = sumByCategory(enrichedLMTDSales);
//     const allCategories = new Set([...Object.keys(mtdCategoryMap), ...Object.keys(lmtdCategoryMap)]);

//     // ✅ Modified: categories now coexist with subordinates
//     if (hasProductCategories || allCategories.size > 0) {
//       const categoryScope = allDealerCodes.length > 0 ? "within_subordinates" : "global";
//       const categoryWiseSales = [...allCategories].map((cat) => {
//         const mtd = mtdCategoryMap[cat] || 0;
//         const lmtd = lmtdCategoryMap[cat] || 0;
//         const growth = lmtd !== 0 ? ((mtd - lmtd) / lmtd) * 100 : 0;
//         return {
//           code: cat,
//           name: cat,
//           position: "product_category",
//           scope: categoryScope,
//           mtd_sell_out: mtd,
//           lmtd_sell_out: lmtd,
//           sell_out_growth: growth.toFixed(2),
//         };
//       });
//       subordinates.push(...categoryWiseSales);
//     }

//     // === Standard sales grouping ===
//     const mtdSales = await SalesData.aggregate([
//       {
//         $match: {
//           buyer_code: { $in: allDealerCodes },
//           sales_type: "Sell Out",
//           date: { $gte: startDate, $lte: endDate },
//         },
//       },
//       {
//         $group: {
//           _id: "$buyer_code",
//           total: {
//             $sum: {
//               $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}`,
//             },
//           },
//         },
//       },
//     ]);
//     const lmtdSales = await SalesData.aggregate([
//       {
//         $match: {
//           buyer_code: { $in: allDealerCodes },
//           sales_type: "Sell Out",
//           date: { $gte: lmtdStartDate, $lte: lmtdEndDate },
//         },
//       },
//       {
//         $group: {
//           _id: "$buyer_code",
//           total: {
//             $sum: {
//               $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}`,
//             },
//           },
//         },
//       },
//     ]);

//     const mtdMap = Object.fromEntries(mtdSales.map((e) => [e._id, e.total]));
//     const lmtdMap = Object.fromEntries(lmtdSales.map((e) => [e._id, e.total]));
//     const calculateGrowth = (current, last) => (last !== 0 ? ((current - last) / last) * 100 : 0);

//     subordinates.forEach((sub) => {
//       if (sub.position === "product_category") return;
//       const dealerCodes = hierarchyEntries
//         .filter((entry) => entry[sub.position] === sub.code && entry.dealer)
//         .map((entry) => entry.dealer);
//       if (sub.position === "dealer") dealerCodes.push(sub.code);
//       let mtd = 0,
//         lmtd = 0;
//       [...new Set(dealerCodes)].forEach((code) => {
//         mtd += mtdMap[code] || 0;
//         lmtd += lmtdMap[code] || 0;
//       });
//       sub.mtd_sell_out = mtd;
//       sub.lmtd_sell_out = lmtd;
//       sub.sell_out_growth = calculateGrowth(mtd, lmtd).toFixed(2);
//     });

//     // === FTD, M-1, M-2, M-3, Contribution ===
//     const startOfMonth = new Date(startDate);
//     startOfMonth.setDate(1);
//     startOfMonth.setUTCHours(0, 0, 0, 0);

//     const monthWindows = [1, 2, 3].map((offset) => {
//       const mStart = new Date(startOfMonth);
//       mStart.setMonth(mStart.getMonth() - offset);
//       const mEnd = new Date(mStart.getFullYear(), mStart.getMonth() + 1, 0);
//       mStart.setUTCHours(0, 0, 0, 0);
//       mEnd.setUTCHours(0, 0, 0, 0);
//       return { label: `M-${offset}`, start: mStart, end: mEnd };
//     });

//     const ftdSales = await SalesData.aggregate([
//       {
//         $match: {
//           buyer_code: { $in: allDealerCodes },
//           sales_type: "Sell Out",
//           date: { $eq: startDate },
//         },
//       },
//       {
//         $group: {
//           _id: "$buyer_code",
//           total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } },
//         },
//       },
//     ]);
//     const ftdMap = Object.fromEntries(ftdSales.map((e) => [e._id, e.total]));

//     const monthlyMaps = {};
//     for (const { label, start, end } of monthWindows) {
//       const monthSales = await SalesData.aggregate([
//         {
//           $match: {
//             buyer_code: { $in: allDealerCodes },
//             sales_type: "Sell Out",
//             date: { $gte: start, $lte: end },
//           },
//         },
//         {
//           $group: {
//             _id: "$buyer_code",
//             total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } },
//           },
//         },
//       ]);
//       monthlyMaps[label] = Object.fromEntries(monthSales.map((e) => [e._id, e.total]));
//     }

//     const groupTotals = {};
//     subordinates.forEach((sub) => {
//       groupTotals[sub.position] = (groupTotals[sub.position] || 0) + (sub.mtd_sell_out || 0);
//     });

//     subordinates.forEach((sub) => {
//       if (!sub.code || !sub.position) return;
//       const dealerCodes =
//         sub.position === "dealer"
//           ? [sub.code]
//           : hierarchyEntries
//               .filter((entry) => entry[sub.position] === sub.code && entry.dealer)
//               .map((entry) => entry.dealer);

//       if (sub.position === "dealer") dealerCodes.push(sub.code);
//       const uniqueDealers = [...new Set(dealerCodes)];

//       const monthValues = { "M-1": 0, "M-2": 0, "M-3": 0 };
//       for (const dealer of uniqueDealers) {
//         for (const key of ["M-1", "M-2", "M-3"]) {
//           monthValues[key] += monthlyMaps[key]?.[dealer] || 0;
//         }
//       }

//       const ftd = uniqueDealers.reduce((sum, d) => sum + (ftdMap[d] || 0), 0);
//       const mtd = sub.mtd_sell_out || 0;
//       const todayDate = endDate.getDate();
//       const ads = mtd / todayDate;
//       const reqAds = (0 - mtd) > 0 ? (0 - mtd) / Math.max(30 - todayDate, 1) : 0;
//       const contribution =
//         groupTotals[sub.position] > 0 ? (mtd / groupTotals[sub.position]) * 100 : 0;

//       Object.assign(sub, {
//         "M-1": monthValues["M-1"],
//         "M-2": monthValues["M-2"],
//         "M-3": monthValues["M-3"],
//         ADS: ads.toFixed(2),
//         TGT: 0,
//         FTD: ftd,
//         "Req. ADS": reqAds.toFixed(2),
//         "Contribution%": contribution.toFixed(2),
//       });
//     });

//     res.status(200).json({
//       success: true,
//       positions: [
//         ...new Set([
//           ...subordinatePositions,
//           "product_category",
//           "taluka",
//           "district",
//           "town",
//           "dealer_category",
//         ]),
//       ],
//       subordinates,
//     });
//   } catch (error) {
//     console.error("Error in getSubordinatesForUser:", error);
//     res.status(500).json({ success: false, message: "Internal server error" });
//   }
// };


// exports.getHierarchyDataStats = async (req, res) => {
//   try {
//     console.log("Lazy hierarchy API reached");

//     const { code } = req.user;
//     const {
//       filter_type = "value",
//       start_date,
//       end_date,
//       position, // e.g. "division", "asm", "mdd", "tse", "dealer", "district", ...
//       parent_code,
//       page = 1,
//       limit = 50,
//     } = req.body;

//     if (!code || !start_date || !end_date || !position) {
//       return res.status(400).json({
//         success: false,
//         message: "Code, start_date, end_date, and position are required.",
//       });
//     }

//     // === STEP 1: Resolve user + hierarchy
//     const actor = await ActorCode.findOne({ code });
//     if (!actor)
//       return res
//         .status(404)
//         .json({ success: false, message: "Actor not found." });

//     const { role } = actor;

//     const actorHierarchy = await ActorTypesHierarchy.findOne({
//       name: "default_sales_flow",
//     });
//     if (!actorHierarchy || !actorHierarchy.hierarchy) {
//       return res
//         .status(500)
//         .json({ success: false, message: "Hierarchy data not found." });
//     }

//     const allPositions = actorHierarchy.hierarchy;

//     // === STEP 2: Collect hierarchy entries
//     let hierarchyEntries = [];
//     if (parent_code === "SPD") {
//       hierarchyEntries = await HierarchyEntries.find({
//         hierarchy_name: "default_sales_flow",
//         mdd: { $ne: "4782323" },
//       });
//     } else if (parent_code === "DMDD") {
//       hierarchyEntries = await HierarchyEntries.find({
//         hierarchy_name: "default_sales_flow",
//         mdd: "4782323",
//       });
//     } else if (parent_code) {
//       hierarchyEntries = await HierarchyEntries.find({
//         hierarchy_name: "default_sales_flow",
//         $or: allPositions.map((pos) => ({ [pos]: parent_code })),
//       });
//     } else if (["admin", "super_admin"].includes(role)) {
//       hierarchyEntries = await HierarchyEntries.find({
//         hierarchy_name: "default_sales_flow",
//       });
//     } else {
//       hierarchyEntries = await HierarchyEntries.find({
//         [actor.position]: code,
//       });
//     }

//     // === STEP 3: Special case for "division"
//     if (position === "division") {
//       const spdEntries = hierarchyEntries.filter(
//         (e) => e.mdd && e.mdd !== "4782323"
//       );
//       const dmddEntries = hierarchyEntries.filter(
//         (e) => e.mdd === "4782323"
//       );

//       const spdDealers = [
//         ...new Set(spdEntries.map((e) => e.dealer).filter(Boolean)),
//       ];
//       const dmddDealers = [
//         ...new Set(dmddEntries.map((e) => e.dealer).filter(Boolean)),
//       ];

//       const startDate = new Date(start_date);
//       startDate.setUTCHours(0, 0, 0, 0);
//       const endDate = new Date(end_date);
//       endDate.setUTCHours(0, 0, 0, 0);

//       const lmtdStartDate = new Date(startDate);
//       lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
//       const lmtdEndDate = new Date(endDate);
//       lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

//       const aggSales = async (dealers, from, to) => {
//         if (dealers.length === 0) return 0;
//         const result = await SalesData.aggregate([
//           {
//             $match: {
//               buyer_code: { $in: dealers },
//               sales_type: "Sell Out",
//               date: { $gte: from, $lte: to },
//             },
//           },
//           {
//             $group: {
//               _id: null,
//               total: {
//                 $sum: {
//                   $toDouble:
//                     `$${filter_type === "value" ? "total_amount" : "quantity"}`,
//                 },
//               },
//             },
//           },
//         ]);
//         return result.length > 0 ? result[0].total : 0;
//       };

//       const spd_mtd = await aggSales(spdDealers, startDate, endDate);
//       const spd_lmtd = await aggSales(spdDealers, lmtdStartDate, lmtdEndDate);
//       const dmdd_mtd = await aggSales(dmddDealers, startDate, endDate);
//       const dmdd_lmtd = await aggSales(dmddDealers, lmtdStartDate, lmtdEndDate);

//       const calcGrowth = (a, b) => (b !== 0 ? ((a - b) / b) * 100 : 0);

//       return res.status(200).json({
//         success: true,
//         position: "division",
//         subordinates: [
//           {
//             code: "SPD",
//             name: "SPD",
//             position: "division",
//             mtd_sell_out: spd_mtd,
//             lmtd_sell_out: spd_lmtd,
//             sell_out_growth: calcGrowth(spd_mtd, spd_lmtd).toFixed(2),
//             "M-1": 0,
//             "M-2": 0,
//             "M-3": 0,
//             ADS: 0,
//             FTD: 0,
//             TGT: 0,
//             "Req. ADS": 0,
//             "Contribution%": 0,
//           },
//           {
//             code: "DMDD",
//             name: "DMDD",
//             position: "division",
//             mtd_sell_out: dmdd_mtd,
//             lmtd_sell_out: dmdd_lmtd,
//             sell_out_growth: calcGrowth(dmdd_mtd, dmdd_lmtd).toFixed(2),
//             "M-1": 0,
//             "M-2": 0,
//             "M-3": 0,
//             ADS: 0,
//             FTD: 0,
//             TGT: 0,
//             "Req. ADS": 0,
//             "Contribution%": 0,
//           },
//         ],
//       });
//     }

//     // === STEP 4: For other positions
//     const filteredEntries = hierarchyEntries.filter((entry) => entry[position]);
//     let subCodes = [
//       ...new Set(filteredEntries.map((entry) => entry[position])),
//     ];

//     let paginated = false;
//     if (position === "dealer") {
//       paginated = true;
//       const startIndex = (page - 1) * limit;
//       const endIndex = startIndex + parseInt(limit);
//       subCodes = subCodes.slice(startIndex, endIndex);
//     }

//     const subs = await ActorCode.find(
//       { code: { $in: subCodes } },
//       { code: 1, name: 1, _id: 0 }
//     );

//     // Collect dealer codes under these subs
//     const dealerCodesSet = new Set();
//     for (const sub of subs) {
//       const subHierarchyDealers = filteredEntries
//         .filter((entry) => entry[position] === sub.code && entry.dealer)
//         .map((entry) => entry.dealer);
//       subHierarchyDealers.forEach((d) => dealerCodesSet.add(d));
//       if (position === "dealer") dealerCodesSet.add(sub.code);
//     }
//     const dealerCodes = [...dealerCodesSet];

//     // === Dates
//     const startDate = new Date(start_date);
//     startDate.setUTCHours(0, 0, 0, 0);
//     const endDate = new Date(end_date);
//     endDate.setUTCHours(0, 0, 0, 0);
//     const lmtdStartDate = new Date(startDate);
//     lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
//     const lmtdEndDate = new Date(endDate);
//     lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

//     // === MTD + LMTD Aggregates
//     const mtdSales = await SalesData.aggregate([
//       {
//         $match: {
//           buyer_code: { $in: dealerCodes },
//           sales_type: "Sell Out",
//           date: { $gte: startDate, $lte: endDate },
//         },
//       },
//       {
//         $group: {
//           _id: "$buyer_code",
//           total: {
//             $sum: {
//               $toDouble:
//                 `$${filter_type === "value" ? "total_amount" : "quantity"}`,
//             },
//           },
//         },
//       },
//     ]);

//     const lmtdSales = await SalesData.aggregate([
//       {
//         $match: {
//           buyer_code: { $in: dealerCodes },
//           sales_type: "Sell Out",
//           date: { $gte: lmtdStartDate, $lte: lmtdEndDate },
//         },
//       },
//       {
//         $group: {
//           _id: "$buyer_code",
//           total: {
//             $sum: {
//               $toDouble:
//                 `$${filter_type === "value" ? "total_amount" : "quantity"}`,
//             },
//           },
//         },
//       },
//     ]);

//     const mtdMap = Object.fromEntries(mtdSales.map((e) => [e._id, e.total]));
//     const lmtdMap = Object.fromEntries(lmtdSales.map((e) => [e._id, e.total]));

//     const calcGrowth = (a, b) => (b !== 0 ? ((a - b) / b) * 100 : 0);

//     // === Extra monthly windows (M-1, M-2, M-3)
//     const startOfMonth = new Date(startDate);
//     startOfMonth.setDate(1);
//     const monthWindows = [1, 2, 3].map((offset) => {
//       const mStart = new Date(startOfMonth);
//       mStart.setMonth(mStart.getMonth() - offset);
//       const mEnd = new Date(mStart.getFullYear(), mStart.getMonth() + 1, 0);
//       mStart.setUTCHours(0, 0, 0, 0);
//       mEnd.setUTCHours(0, 0, 0, 0);
//       return { label: `M-${offset}`, start: mStart, end: mEnd };
//     });

//     const monthlyMaps = {};
//     for (const { label, start, end } of monthWindows) {
//       const monthSales = await SalesData.aggregate([
//         {
//           $match: {
//             buyer_code: { $in: dealerCodes },
//             sales_type: "Sell Out",
//             date: { $gte: start, $lte: end },
//           },
//         },
//         {
//           $group: {
//             _id: "$buyer_code",
//             total: {
//               $sum: {
//                 $toDouble:
//                   `$${filter_type === "value" ? "total_amount" : "quantity"}`,
//               },
//             },
//           },
//         },
//       ]);
//       monthlyMaps[label] = Object.fromEntries(
//         monthSales.map((e) => [e._id, e.total])
//       );
//     }

//     // === FTD (first day of month)
//     const ftdSales = await SalesData.aggregate([
//       {
//         $match: {
//           buyer_code: { $in: dealerCodes },
//           sales_type: "Sell Out",
//           date: startDate,
//         },
//       },
//       {
//         $group: {
//           _id: "$buyer_code",
//           total: {
//             $sum: {
//               $toDouble:
//                 `$${filter_type === "value" ? "total_amount" : "quantity"}`,
//             },
//           },
//         },
//       },
//     ]);
//     const ftdMap = Object.fromEntries(ftdSales.map((e) => [e._id, e.total]));

//     // === Group totals for contribution
//     let totalMtd = 0;
//     subs.forEach((sub) => {
//       const dealerCodesForSub = filteredEntries
//         .filter((entry) => entry[position] === sub.code && entry.dealer)
//         .map((entry) => entry.dealer);
//       if (position === "dealer") dealerCodesForSub.push(sub.code);
//       [...new Set(dealerCodesForSub)].forEach((c) => {
//         totalMtd += mtdMap[c] || 0;
//       });
//     });

//     const enrichedSubs = subs.map((sub) => {
//       const dealerCodesForSub = filteredEntries
//         .filter((entry) => entry[position] === sub.code && entry.dealer)
//         .map((entry) => entry.dealer);
//       if (position === "dealer") dealerCodesForSub.push(sub.code);
//       const uniqueDealers = [...new Set(dealerCodesForSub)];

//       let mtd = 0,
//         lmtd = 0,
//         ftd = 0;
//       const monthValues = { "M-1": 0, "M-2": 0, "M-3": 0 };
//       uniqueDealers.forEach((c) => {
//         mtd += mtdMap[c] || 0;
//         lmtd += lmtdMap[c] || 0;
//         ftd += ftdMap[c] || 0;
//         for (const key of ["M-1", "M-2", "M-3"]) {
//           monthValues[key] += monthlyMaps[key]?.[c] || 0;
//         }
//       });

//       const todayDate = endDate.getDate();
//       const ads = todayDate > 0 ? mtd / todayDate : 0;
//       const reqAds = 0; // placeholder
//       const contribution = totalMtd > 0 ? (mtd / totalMtd) * 100 : 0;

//       return {
//         code: sub.code,
//         name: sub.name,
//         position,
//         mtd_sell_out: mtd,
//         lmtd_sell_out: lmtd,
//         sell_out_growth: calcGrowth(mtd, lmtd).toFixed(2),
//         "M-1": monthValues["M-1"],
//         "M-2": monthValues["M-2"],
//         "M-3": monthValues["M-3"],
//         ADS: ads.toFixed(2),
//         FTD: ftd,
//         TGT: 0,
//         "Req. ADS": reqAds.toFixed(2),
//         "Contribution%": contribution.toFixed(2),
//       };
//     });

//     res.status(200).json({
//       success: true,
//       position,
//       paginated,
//       page,
//       limit,
//       count: enrichedSubs.length,
//       subordinates: enrichedSubs,
//     });
//   } catch (error) {
//     console.error("Error in getHierarchyData:", error);
//     res
//       .status(500)
//       .json({ success: false, message: "Internal server error" });
//   }
// };






// exports.getSubordinatesForUser = async (req, res) => {
//   try {
//     console.log("Subods reaching");
//     const { code } = req.user;
//     const {
//       filter_type = "value",
//       start_date,
//       end_date,
//       subordinate_codes = [],
//     } = req.body;
//     console.log("Subordinate: ", subordinate_codes);

//     if (!code || !start_date || !end_date) {
//       return res.status(400).json({
//         success: false,
//         message: "Code, start_date, and end_date are required.",
//       });
//     }

//     const actor = await ActorCode.findOne({ code });
//     if (!actor)
//       return res
//         .status(404)
//         .json({ success: false, message: "Actor not found." });
//     const { position, role } = actor;
//     if (!position)
//       return res
//         .status(400)
//         .json({ success: false, message: "Position not found for this user." });

//     const actorHierarchy = await ActorTypesHierarchy.findOne({
//       name: "default_sales_flow",
//     });
//     if (!actorHierarchy || !actorHierarchy.hierarchy) {
//       return res
//         .status(500)
//         .json({ success: false, message: "Hierarchy data not found." });
//     }

//     const allPositions = actorHierarchy.hierarchy;
//     let subordinatePositions = [];
//     let hierarchyEntries = [];
//     const subordinates = [];
//     const allDealerCodesSet = new Set();
//     const addedSubordinateCodes = new Set();

//     // ADMIN / SUPER_ADMIN logic
//     if (["admin", "super_admin"].includes(role)) {
//       subordinatePositions = allPositions;

//       hierarchyEntries = await HierarchyEntries.find({
//         hierarchy_name: "default_sales_flow",
//       });

//       for (const subPosition of subordinatePositions) {
//         const filteredEntries = hierarchyEntries.filter(
//           (entry) => entry[subPosition]
//         );
//         const subCodes = [
//           ...new Set(
//             filteredEntries
//               .map((entry) => entry[subPosition])
//               .filter((code) => code && !addedSubordinateCodes.has(code))
//           ),
//         ];
//         const subs = await ActorCode.find(
//           { code: { $in: subCodes } },
//           { code: 1, name: 1, _id: 0 }
//         );

//         for (const sub of subs) {
//           addedSubordinateCodes.add(sub.code);

//           const subHierarchyDealers = filteredEntries
//             .filter((entry) => entry[subPosition] === sub.code && entry.dealer)
//             .map((entry) => entry.dealer);

//           subHierarchyDealers.forEach((code) => allDealerCodesSet.add(code));
//           if (subPosition === "dealer") allDealerCodesSet.add(sub.code);

//           subordinates.push({
//             code: sub.code,
//             name: sub.name,
//             position: subPosition,
//           });
//         }
//       }
//     } else {
//       // ORIGINAL logic for non-admin users
//       const userPositionIndex = allPositions.indexOf(position);
//       if (
//         userPositionIndex === -1 ||
//         userPositionIndex >= allPositions.length - 1
//       ) {
//         return res
//           .status(200)
//           .json({ success: true, positions: [], subordinates: [] });
//       }

//       subordinatePositions = allPositions.slice(userPositionIndex + 1);

//       if (subordinate_codes.length > 0) {
//         hierarchyEntries = await HierarchyEntries.find({
//           hierarchy_name: "default_sales_flow",
//           $and: subordinate_codes.map((code) => ({
//             $or: allPositions.map((pos) => ({ [pos]: code })),
//           })),
//         });
//       } else {
//         hierarchyEntries = await HierarchyEntries.find({ [position]: code });
//       }

//       for (const subPosition of subordinatePositions) {
//         const filteredEntries = hierarchyEntries.filter(
//           (entry) => entry[subPosition]
//         );
//         const subCodes = [
//           ...new Set(
//             filteredEntries
//               .map((entry) => entry[subPosition])
//               .filter((code) => code && !addedSubordinateCodes.has(code))
//           ),
//         ];
//         const subs = await ActorCode.find(
//           { code: { $in: subCodes } },
//           { code: 1, name: 1, _id: 0 }
//         );

//         for (const sub of subs) {
//           addedSubordinateCodes.add(sub.code);

//           const subHierarchyDealers = filteredEntries
//             .filter((entry) => entry[subPosition] === sub.code && entry.dealer)
//             .map((entry) => entry.dealer);

//           subHierarchyDealers.forEach((code) => allDealerCodesSet.add(code));
//           if (subPosition === "dealer") allDealerCodesSet.add(sub.code);

//           subordinates.push({
//             code: sub.code,
//             name: sub.name,
//             position: subPosition,
//           });
//         }
//       }
//     }

//     // const convertToIST = (date) => new Date(new Date(date).getTime() + 5.5 * 60 * 60 * 1000);
//     // const startDate = convertToIST(start_date);
//     // const endDate = convertToIST(end_date);
//     const startDate = new Date(start_date);
//     startDate.setUTCHours(0, 0, 0, 0);

//     const endDate = new Date(end_date);
//     endDate.setUTCHours(0, 0, 0, 0);
//     const todayDate = new Date().getDate();
//     const lmtdStartDate = new Date(startDate);
//     lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
//     const lmtdEndDate = new Date(endDate);
//     lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

//     const allDealerCodes = [...allDealerCodesSet];

//     const mtdSales = await SalesData.aggregate([
//       {
//         $match: {
//           buyer_code: { $in: allDealerCodes },
//           sales_type: "Sell Out",
//           date: { $gte: startDate, $lte: endDate },
//         },
//       },
//       {
//         $group: {
//           _id: "$buyer_code",
//           total: {
//             $sum: {
//               $toDouble: `$${
//                 filter_type === "value" ? "total_amount" : "quantity"
//               }`,
//             },
//           },
//         },
//       },
//     ]);

//     const lmtdSales = await SalesData.aggregate([
//       {
//         $match: {
//           buyer_code: { $in: allDealerCodes },
//           sales_type: "Sell Out",
//           date: { $gte: lmtdStartDate, $lte: lmtdEndDate },
//         },
//       },
//       {
//         $group: {
//           _id: "$buyer_code",
//           total: {
//             $sum: {
//               $toDouble: `$${
//                 filter_type === "value" ? "total_amount" : "quantity"
//               }`,
//             },
//           },
//         },
//       },
//     ]);
//     // console.log("mtdSales: ", mtdSales);
//     // console.log("lmtdSales: ", lmtdSales);

//     const mtdMap = Object.fromEntries(mtdSales.map((e) => [e._id, e.total]));
//     const lmtdMap = Object.fromEntries(lmtdSales.map((e) => [e._id, e.total]));

//     // new
//     // STEP: CATEGORY-WISE SALES AGGREGATION
//     const mtdSalesRaw = await SalesData.find({
//       buyer_code: { $in: allDealerCodes },
//       sales_type: "Sell Out",
//       date: { $gte: startDate, $lte: endDate },
//     }, { product_code: 1, total_amount: 1, quantity: 1 });

//     const lmtdSalesRaw = await SalesData.find({
//       buyer_code: { $in: allDealerCodes },
//       sales_type: "Sell Out",
//       date: { $gte: lmtdStartDate, $lte: lmtdEndDate },
//     }, { product_code: 1, total_amount: 1, quantity: 1 });

//     const allProductCodes = [
//       ...new Set([
//         ...mtdSalesRaw.map(s => s.product_code),
//         ...lmtdSalesRaw.map(s => s.product_code)
//       ])
//     ];

//     const productDocs = await Product.find(
//       { product_code: { $in: allProductCodes } },
//       { product_code: 1, product_category: 1, _id: 0 }
//     );

//     const productMap = Object.fromEntries(
//       productDocs.map(p => [p.product_code, p.product_category || "Uncategorized"])
//     );
    
//     const enrichedMTDSales = mtdSalesRaw.map(sale => ({
//       ...sale._doc,
//       category: productMap[sale.product_code] || "Uncategorized"
//     }));
    
//     const enrichedLMTDSales = lmtdSalesRaw.map(sale => ({
//       ...sale._doc,
//       category: productMap[sale.product_code] || "Uncategorized"
//     }));
//     console.log("Raw (first 5):", enrichedMTDSales.slice(0, 5));


//     const mtdCategoryMap = {};
//     enrichedMTDSales.forEach(sale => {
//       const value = filter_type === "value" ? sale.total_amount : sale.quantity;
//       mtdCategoryMap[sale.category] = (mtdCategoryMap[sale.category] || 0) + value;
//       // console.log("Fin val: ", mtdCategoryMap);
//     });

//     const lmtdCategoryMap = {};
//     enrichedLMTDSales.forEach(sale => {
//       const value = filter_type === "value" ? sale.total_amount : sale.quantity;
//       lmtdCategoryMap[sale.category] = (lmtdCategoryMap[sale.category] || 0) + value;
//     });


//     const allCategories = new Set([
//       ...Object.keys(mtdCategoryMap),
//       ...Object.keys(lmtdCategoryMap),
//     ]);

//     const categoryWiseSales = [...allCategories].map(cat => {
//       const mtd = mtdCategoryMap[cat] || 0;
//       const lmtd = lmtdCategoryMap[cat] || 0;
//       const growth = lmtd !== 0 ? ((mtd - lmtd) / lmtd) * 100 : 0;
//       return {
//         code: cat,
//         name: cat,
//         position: "product_category",
//         mtd_sell_out: mtd,
//         lmtd_sell_out: lmtd,
//         sell_out_growth: growth.toFixed(2),
//       };
//     });

//     subordinates.push(...categoryWiseSales);


//     // console.log("mtdMap: ", mtdMap);
//     // console.log("lmtdMap: ", lmtdMap);

//     const calculateGrowth = (current, last) =>
//       last !== 0 ? ((current - last) / last) * 100 : 0;

//     subordinates.forEach((sub) => {
//       if (sub.position === "product_category") return;

//       const dealerCodes = hierarchyEntries
//         .filter((entry) => entry[sub.position] === sub.code && entry.dealer)
//         .map((entry) => entry.dealer);

//       if (sub.position === "dealer") dealerCodes.push(sub.code);

//       let mtd = 0,
//         lmtd = 0;
//       [...new Set(dealerCodes)].forEach((code) => {
//         mtd += mtdMap[code] || 0;
//         lmtd += lmtdMap[code] || 0;
//       });

//       sub.mtd_sell_out = mtd;
//       sub.lmtd_sell_out = lmtd;
//       sub.sell_out_growth = calculateGrowth(mtd, lmtd).toFixed(2);
//     });

//     const profileDealers = await User.find(
//       { role: "dealer" },
//       { code: 1, taluka: 1, district: 1, town: 1, labels: 1 }
//     );

//     const fieldGroups = {
//       taluka: {},
//       district: {},
//       town: {},
//       dealer_category: {},
//     };

//     profileDealers.forEach((dealer) => {
//       for (const key of ["taluka", "district", "town"]) {
//         const val = dealer[key];
//         if (val)
//           (fieldGroups[key][val] = fieldGroups[key][val] || []).push(
//             dealer.code
//           );
//       }
//       if (Array.isArray(dealer.labels)) {
//         dealer.labels.forEach((label) => {
//           if (label)
//             (fieldGroups.dealer_category[label] =
//               fieldGroups.dealer_category[label] || []).push(dealer.code);
//         });
//       }
//     });

//     for (const [field, groupMap] of Object.entries(fieldGroups)) {
//       for (const [group, codes] of Object.entries(groupMap)) {
//         let mtd = 0,
//           lmtd = 0;
//         codes.forEach((code) => {
//           mtd += mtdMap[code] || 0;
//           lmtd += lmtdMap[code] || 0;
//         });
//         subordinates.push({
//           code: group,
//           name: group,
//           position: field,
//           mtd_sell_out: mtd,
//           lmtd_sell_out: lmtd,
//           sell_out_growth: calculateGrowth(mtd, lmtd).toFixed(2),
//         });
//       }
//     }

//     const finalPositions = [
//       ...new Set([
//         ...subordinatePositions,
//         "product_category",
//         "taluka",
//         "district",
//         "town",
//         "dealer_category",
//       ]),
//     ];

//   // console.log("Smart Phone Subordinate:", subordinates.find(s => s.code === "smart_phone"));

//     // console.log("Sobords 19 : ", subordinates)
//     res
//       .status(200)
//       .json({ success: true, positions: finalPositions, subordinates });
//   } catch (error) {
//     console.error("Error in getSubordinatesForUser:", error);
//     res.status(500).json({ success: false, message: "Internal server error" });
//   }
// };



exports.getDealersForUser = async (req, res) => {
  try {
    const { code } = req.user;

    if (!code) {
      return res
        .status(400)
        .json({ success: false, message: "User code is required." });
    }

    // Find the user in ActorCode
    const actor = await ActorCode.findOne({ code });
    if (!actor) {
      return res
        .status(404)
        .json({ success: false, message: "Actor not found." });
    }

    const { position } = actor;
    if (!position) {
      return res
        .status(400)
        .json({ success: false, message: "Position not found for this user." });
    }

    // Load hierarchy structure
    const actorHierarchy = await ActorTypesHierarchy.findOne({
      name: "default_sales_flow",
    });
    if (!actorHierarchy || !actorHierarchy.hierarchy) {
      return res
        .status(500)
        .json({ success: false, message: "Hierarchy data not found." });
    }

    const allPositions = actorHierarchy.hierarchy;
    const userPositionIndex = allPositions.indexOf(position);

    if (
      userPositionIndex === -1 ||
      userPositionIndex >= allPositions.length - 1
    ) {
      return res.status(200).json({ success: true, dealers: [] });
    }

    // Get all subordinates in hierarchy entries
    const hierarchyEntries = await HierarchyEntries.find({ [position]: code });
    if (!hierarchyEntries.length) {
      return res.status(200).json({ success: true, dealers: [] });
    }

    // Get the 'dealer' position
    const dealerPosition = "dealer";
    if (!allPositions.includes(dealerPosition)) {
      return res.status(200).json({ success: true, dealers: [] });
    }

    // Get all dealer codes from the hierarchy
    let dealerCodes = hierarchyEntries
      .map((entry) => entry[dealerPosition])
      .filter(Boolean);
    dealerCodes = [...new Set(dealerCodes)]; // Remove duplicates

    // Fetch only code and name of those dealers
    const dealers = await ActorCode.find(
      { code: { $in: dealerCodes } },
      { code: 1, name: 1, _id: 0 }
    );

    return res.status(200).json({ success: true, dealers });
  } catch (error) {
    console.error("Error in getDealersForUser:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.getHierarchyDataByFirmName = async (req, res) => {
  try {
    const { name: firmName } = req.query;

    if (!firmName) {
      return res.status(400).json({
        success: false,
        message: "Firm name is required in query",
      });
    }

    // 🔍 Find the firm and its flows
    const firm = await Firm.findOne({ name: firmName }).populate(
      "flowTypes",
      "name"
    );
    if (!firm) {
      return res.status(404).json({
        success: false,
        message: `Firm '${firmName}' not found`,
      });
    }

    const flowNames = firm.flowTypes.map((flow) => flow.name);
    if (flowNames.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No flowTypes assigned to this firm",
      });
    }

    // 🔍 Get all hierarchy entries by flow names
    const hierarchyEntries = await HierarchyEntries.find({
      hierarchy_name: { $in: flowNames },
    });

    // 🔁 Group & clean data
    const groupedData = {};
    for (const entry of hierarchyEntries) {
      const flow = entry.hierarchy_name;
      if (!groupedData[flow]) groupedData[flow] = [];

      // Convert to plain object and remove unwanted keys
      const obj = entry.toObject();
      delete obj._id;
      delete obj.__v;
      delete obj.hierarchy_name;

      groupedData[flow].push(obj);
    }

    return res.status(200).json({
      success: true,
      message: "Hierarchy entries fetched successfully",
      data: groupedData,
    });
  } catch (error) {
    console.error("❌ Error fetching hierarchy entries:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};


exports.getHierarchyMyntraDataStats = async (req, res) => {
  try {
    console.log("🔍 [MyntraHierarchy] API reached");

    const { code } = req.user;
    const {
      filter_type = "value",
      start_date,
      end_date,
      selected_entities = [],
      product_categories = [],
      position = "division",
      parent_code,
      page = 1,
      limit = 50,
    } = req.body;

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: "start_date and end_date are required.",
      });
    }

    // === STEP 1: Load hierarchy definition
    const actorHierarchy = await ActorTypesHierarchy.findOne({ name: "default_sales_flow" });
    if (!actorHierarchy || !actorHierarchy.hierarchy) {
      return res.status(500).json({ success: false, message: "Hierarchy data not found." });
    }
    const allPositions = actorHierarchy.hierarchy;

    // === STEP 2: Collect hierarchy entries
    let hierarchyEntries = [];

    const baseFilter = { hierarchy_name: "default_sales_flow" };

    if (parent_code) {
      // When a parent code is provided (click on SPD/DMDD/ASM etc.)
      hierarchyEntries = await HierarchyEntries.find({
        ...baseFilter,
        $or: allPositions.map((pos) => ({ [pos]: parent_code })),
      });
    } else if (Array.isArray(selected_entities) && selected_entities.length > 0) {
      // When user has applied selected filters
      hierarchyEntries = await HierarchyEntries.find({
        ...baseFilter,
        $or: allPositions.map((pos) => ({ [pos]: { $in: selected_entities } })),
      });
    } else {
      // Default case — no selection, fetch entire flow
      hierarchyEntries = await HierarchyEntries.find(baseFilter);
    }


    // === STEP 3: Normalize product categories
    const hasProductCategories = Array.isArray(product_categories) && product_categories.length > 0;
    const normalize = (str = "") => str.toLowerCase().replace(/[_\s]+/g, "");
    const normalizedSelected = product_categories.map(normalize);

    // === 🧭 SPECIAL CASE: Division level (SPD vs DMDD)
    if (position === "division") {
      console.log("🏗️ Division case triggered");

      const spdEntries = hierarchyEntries.filter((e) => e.mdd && e.mdd !== "4782323");
      const dmddEntries = hierarchyEntries.filter((e) => e.mdd === "4782323");

      const spdDealers = [...new Set(spdEntries.map((e) => e.dealer).filter(Boolean))];
      const dmddDealers = [...new Set(dmddEntries.map((e) => e.dealer).filter(Boolean))];

      const startDate = new Date(start_date);
      startDate.setUTCHours(0, 0, 0, 0);
      const endDate = new Date(end_date);
      endDate.setUTCHours(0, 0, 0, 0);
      const lmtdStartDate = new Date(startDate);
      lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
      const lmtdEndDate = new Date(endDate);
      lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

      const aggregate = async (codes, from, to) => {
        if (codes.length === 0) return 0;
        const match = {
          buyer_code: { $in: codes },
          sales_type: "Sell Out",
          date: { $gte: from, $lte: to },
        };
        if (hasProductCategories) {
          match.$expr = {
            $in: [
              {
                $toLower: {
                  $replaceAll: {
                    input: { $ifNull: ["$product_category", ""] },
                    find: " ",
                    replacement: "",
                  },
                },
              },
              normalizedSelected,
            ],
          };
        }

        const result = await SalesData.aggregate([
          { $match: match },
          {
            $group: {
              _id: null,
              total: {
                $sum: {
                  $toDouble:
                    `$${filter_type === "value" ? "total_amount" : "quantity"}`,
                },
              },
            },
          },
        ]);
        return result.length > 0 ? result[0].total : 0;
      };

      const spd_mtd = await aggregate(spdDealers, startDate, endDate);
      const spd_lmtd = await aggregate(spdDealers, lmtdStartDate, lmtdEndDate);
      const dmdd_mtd = await aggregate(dmddDealers, startDate, endDate);
      const dmdd_lmtd = await aggregate(dmddDealers, lmtdStartDate, lmtdEndDate);

      const calcGrowth = (a, b) => (b !== 0 ? ((a - b) / b) * 100 : 0);

      const response = {
        success: true,
        position: "division",
        count: 2,
        subordinates: [
          {
            code: "SPD",
            name: "SPD",
            position: "division",
            mtd_sell_out: spd_mtd,
            lmtd_sell_out: spd_lmtd,
            sell_out_growth: calcGrowth(spd_mtd, spd_lmtd).toFixed(2),
            "Contribution%": 0,
          },
          {
            code: "DMDD",
            name: "DMDD",
            position: "division",
            mtd_sell_out: dmdd_mtd,
            lmtd_sell_out: dmdd_lmtd,
            sell_out_growth: calcGrowth(dmdd_mtd, dmdd_lmtd).toFixed(2),
            "Contribution%": 0,
          },
        ],
      };

      console.log("🟢 [MyntraHierarchy] Division Response:", response);
      return res.status(200).json(response);
    }

    // === STEP 4: Determine next position
    const currentPosition = position;
    const nextIndex = allPositions.indexOf(currentPosition) + 1;
    const nextPosition = allPositions[nextIndex] || "dealer";

    // === STEP 5: Filter hierarchy for the given parent (or top level)
    let filteredEntries;
    if (parent_code) {
      filteredEntries = hierarchyEntries.filter((e) =>
        Object.values(e.toObject()).includes(parent_code)
      );
    } else {
      filteredEntries = hierarchyEntries;
    }

    const subCodes = [
      ...new Set(filteredEntries.map((e) => e[nextPosition]).filter(Boolean)),
    ];

    if (!subCodes.length) {
      return res.status(200).json({
        success: true,
        message: `No ${nextPosition} found under selection.`,
        subordinates: [],
      });
    }

    // === STEP 6: Gather actor data for next level
    const subs = await ActorCode.find(
      { code: { $in: subCodes } },
      { code: 1, name: 1, position: 1, _id: 0 }
    );

    // === STEP 7: Get all dealer codes under these subs
    const dealerCodesSet = new Set();
    for (const sub of subs) {
      const subDealers = filteredEntries
        .filter((e) => e[nextPosition] === sub.code && e.dealer)
        .map((e) => e.dealer);
      subDealers.forEach((d) => dealerCodesSet.add(d));
      if (nextPosition === "dealer") dealerCodesSet.add(sub.code);
    }
    const dealerCodes = [...dealerCodesSet];

    // === STEP 8: Dates setup
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    startDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCHours(0, 0, 0, 0);

    const lmtdStartDate = new Date(startDate);
    const lmtdEndDate = new Date(endDate);
    lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
    lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

    const makeMatch = (from, to) => {
      const match = {
        buyer_code: { $in: dealerCodes },
        sales_type: "Sell Out",
        date: { $gte: from, $lte: to },
      };
      if (hasProductCategories) {
        match.$expr = {
          $in: [
            {
              $toLower: {
                $replaceAll: {
                  input: { $ifNull: ["$product_category", ""] },
                  find: " ",
                  replacement: "",
                },
              },
            },
            normalizedSelected,
          ],
        };
      }
      return match;
    };

    // === STEP 9: Aggregations
    const aggregateSales = async (from, to) => {
      const result = await SalesData.aggregate([
        { $match: makeMatch(from, to) },
        {
          $group: {
            _id: "$buyer_code",
            total: {
              $sum: {
                $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}`,
              },
            },
          },
        },
      ]);
      return Object.fromEntries(result.map((e) => [e._id, e.total]));
    };

    const mtdMap = await aggregateSales(startDate, endDate);
    const lmtdMap = await aggregateSales(lmtdStartDate, lmtdEndDate);

    // === STEP 10: Month windows (M-1, M-2, M-3)
    const startOfMonth = new Date(startDate);
    startOfMonth.setDate(1);
    const monthWindows = [1, 2, 3].map((offset) => {
      const mStart = new Date(startOfMonth);
      mStart.setMonth(mStart.getMonth() - offset);
      const mEnd = new Date(mStart.getFullYear(), mStart.getMonth() + 1, 0);
      return { label: `M-${offset}`, start: mStart, end: mEnd };
    });

    const monthlyMaps = {};
    for (const { label, start, end } of monthWindows) {
      monthlyMaps[label] = await aggregateSales(start, end);
    }

    // === STEP 11: FTD (first day only)
    const ftdResult = await SalesData.aggregate([
      { $match: makeMatch(startDate, startDate) },
      {
        $group: {
          _id: "$buyer_code",
          total: {
            $sum: {
              $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}`,
            },
          },
        },
      },
    ]);
    const ftdMap = Object.fromEntries(ftdResult.map((e) => [e._id, e.total]));

    // === STEP 12: Calculate per-subordinate totals
    const calcGrowth = (a, b) => (b !== 0 ? ((a - b) / b) * 100 : 0);
    let totalMtd = 0;
    for (const c of dealerCodes) totalMtd += mtdMap[c] || 0;

    const todayDate = endDate.getDate();
    const enrichedSubs = subs.map((sub) => {
      const subDealers = filteredEntries
        .filter((e) => e[nextPosition] === sub.code && e.dealer)
        .map((e) => e.dealer);
      if (nextPosition === "dealer") subDealers.push(sub.code);
      const dealers = [...new Set(subDealers)];

      let mtd = 0,
        lmtd = 0,
        ftd = 0;
      const monthValues = { "M-1": 0, "M-2": 0, "M-3": 0 };
      dealers.forEach((c) => {
        mtd += mtdMap[c] || 0;
        lmtd += lmtdMap[c] || 0;
        ftd += ftdMap[c] || 0;
        for (const key of ["M-1", "M-2", "M-3"]) {
          monthValues[key] += monthlyMaps[key]?.[c] || 0;
        }
      });

      const ads = todayDate > 0 ? mtd / todayDate : 0;
      const contribution = totalMtd > 0 ? (mtd / totalMtd) * 100 : 0;

      return {
        code: sub.code,
        name: sub.name,
        position: nextPosition,
        mtd_sell_out: mtd,
        lmtd_sell_out: lmtd,
        sell_out_growth: calcGrowth(mtd, lmtd).toFixed(2),
        "M-1": monthValues["M-1"],
        "M-2": monthValues["M-2"],
        "M-3": monthValues["M-3"],
        ADS: ads.toFixed(2),
        FTD: ftd,
        TGT: 0,
        "Req. ADS": 0,
        "Contribution%": contribution.toFixed(2),
      };
    });

    console.log("🟢 [MyntraHierarchy] Response Preview:", {
      position: nextPosition,
      count: enrichedSubs.length,
      sample: enrichedSubs.slice(0, 10),
    });

    // === STEP 13: Pagination (dealers only)
    const startIndex = (page - 1) * limit;
    const paginated =
      nextPosition === "dealer"
        ? enrichedSubs.slice(startIndex, startIndex + limit)
        : enrichedSubs;

    res.status(200).json({
      success: true,
      position: nextPosition,
      page,
      limit,
      total_count: enrichedSubs.length,
      subordinates: paginated,
    });
  } catch (error) {
    console.error("❌ [MyntraHierarchy] Error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};


