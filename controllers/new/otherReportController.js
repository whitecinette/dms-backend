const moment = require("moment");
const ActivationData = require("../../model/ActivationData");
const Product = require("../../model/Product");
const HierarchyEntries = require("../../model/HierarchyEntries");
const User = require("../../model/User");

exports.getTopSellingBySegment = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      productCategory,
      tags,
    } = req.query;

    const user = req.user;

    const safeNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

    const hasCustomDateFilter = Boolean(startDate || endDate);

    // ---------------------------------
    // DATE RANGE
    // ---------------------------------
    const start = hasCustomDateFilter
      ? (startDate
          ? moment(startDate, "YYYY-MM-DD").startOf("day")
          : moment().startOf("month"))
      : moment().startOf("month");

    const end = hasCustomDateFilter
      ? (endDate
          ? moment(endDate, "YYYY-MM-DD").endOf("day")
          : moment().endOf("day"))
      : moment().endOf("day");

    const prevStart = moment(start).subtract(1, "month").startOf("month");
    const prevEnd = moment(start).subtract(1, "month").endOf("month");

    // Default behavior:
    // - no manual date selected => FTD = yesterday
    // - manual date selected => FTD = selected end date
    const ftdDate = hasCustomDateFilter
      ? moment(end).startOf("day")
      : moment().subtract(1, "day").startOf("day");

    const ftdDateStart = moment(ftdDate).startOf("day");
    const ftdDateEnd = moment(ftdDate).endOf("day");

    // ---------------------------------
    // TAG ARRAY
    // ---------------------------------
    const tagArray = Array.isArray(tags)
      ? tags.filter(Boolean)
      : typeof tags === "string" && tags.trim()
      ? tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    // ---------------------------------
    // FETCH DEALERS (ROLE BASED)
    // ---------------------------------
    let dealerFilter = {};

    if (!["admin", "super_admin", "hr"].includes(user.role)) {
      const hierarchy = await HierarchyEntries.find({
        hierarchy_name: "default_sales_flow",
        [String(user.position || "").toLowerCase()]: user.code,
      }).lean();

      const dealers = hierarchy.map((h) => h.dealer).filter(Boolean);

      dealerFilter = {
        tertiary_buyer_code: { $in: dealers },
      };
    }

    // ---------------------------------
    // PRODUCT FILTER
    // ---------------------------------
    const baseSamsungFilter = {
      brand: "samsung",
    };

    const productFilter = {
      ...baseSamsungFilter,
    };

    if (productCategory) {
      productFilter.product_category = productCategory;
    }

    if (tagArray.length) {
      productFilter.tags = { $in: tagArray };
    }

    // For actual report rows
    const filteredProducts = await Product.find(productFilter).lean();

    // For dynamic filter options
    const allSamsungProducts = await Product.find(baseSamsungFilter).lean();

    const allCategories = [
      ...new Set(
        allSamsungProducts
          .map((p) => p.product_category)
          .filter(Boolean)
      ),
    ].sort();

    const allTags = [
      ...new Set(
        allSamsungProducts
          .flatMap((p) => (Array.isArray(p.tags) ? p.tags : []))
          .filter(Boolean)
      ),
    ].sort((a, b) => String(a).localeCompare(String(b)));

    // ---------------------------------
    // PRODUCT MAPS
    // ---------------------------------
    const productMap = {};
    const allowedProductCodes = new Set();
    const allowedModelCodes = new Set();

    filteredProducts.forEach((p) => {
      if (p.product_code) {
        productMap[p.product_code] = p;
        allowedProductCodes.add(p.product_code);
      }
      if (p.model_code) {
        productMap[p.model_code] = p;
        allowedModelCodes.add(p.model_code);
      }
    });

    // ---------------------------------
    // FETCH ACTIVATIONS
    // ---------------------------------
    const activations = await ActivationData.find({
      ...dealerFilter,
    }).lean();

    function parseDate(raw) {
      const m = moment(raw, ["M/D/YY", "MM/DD/YY"], true);
      return m.isValid() ? m.toDate() : null;
    }

    // Restrict activations to selected products
    const filteredActivations = activations.filter((a) => {
      return (
        allowedProductCodes.has(a.product_code) ||
        allowedModelCodes.has(a.model_no)
      );
    });

    // ---------------------------------
    // SEGMENT FUNCTION
    // ---------------------------------
    function getSegment(price) {
      if (price < 6000) return "0-6";
      if (price < 10000) return "6-10";
      if (price < 20000) return "10-20";
      if (price < 30000) return "20-30";
      if (price < 40000) return "30-40";
      if (price < 70000) return "40-70";
      if (price < 100000) return "70-100";
      if (price < 120000) return "100-120";
      return "120";
    }

    // ---------------------------------
    // DEALER MAP
    // ---------------------------------
    const dealerCodes = [
      ...new Set(
        filteredActivations
          .map((a) => a.tertiary_buyer_code)
          .filter(Boolean)
      ),
    ];

    const dealerDocs = await User.find(
      { code: { $in: dealerCodes } },
      { code: 1, name: 1, town: 1 }
    ).lean();

    const dealerMap = {};
    dealerDocs.forEach((d) => {
      dealerMap[d.code] = d;
    });

    // ---------------------------------
    // AGGREGATION
    // ---------------------------------
    const result = {};

    filteredActivations.forEach((a) => {
      const invoiceDate = parseDate(a.activation_date_raw);
      if (!invoiceDate) return;

      const product = productMap[a.product_code] || productMap[a.model_no];

      const qty = safeNum(a.qty);
      const val = safeNum(a.val);

      if (qty <= 0) return;

      const price = product?.price ? safeNum(product.price) : val / qty;
      const segment = product?.segment || getSegment(price);
      const key = a.model_no || a.product_code || product?.model_code || product?.product_code || "UNKNOWN_MODEL";

      if (!result[segment]) result[segment] = {};

      if (!result[segment][key]) {
        result[segment][key] = {
          model: a.model_no || product?.model_code || "-",
          name: product?.product_name || a.model_no || a.product_code || "-",
          product_category: product?.product_category || "",
          category: product?.category || "",
          tags: Array.isArray(product?.tags) ? product.tags : [],
          segment,
          dp: price,

          LM: 0,
          MTD: 0,
          total: 0,
          totalValue: 0,

          FTD: 0,
          GR: 0,
          ADS: 0,
          WOS: 0,

          MTDValue: 0,
          LMValue: 0,

          dealerStats: {},
        };
      }

      // Current selected range
      if (invoiceDate >= start.toDate() && invoiceDate <= end.toDate()) {
        result[segment][key].MTD += qty;
        result[segment][key].total += qty;
        result[segment][key].MTDValue += val;
        result[segment][key].totalValue += val;

        const dealerCode = a.tertiary_buyer_code || "UNKNOWN";
        const dealerInfo = dealerMap[dealerCode] || {};

        if (!result[segment][key].dealerStats[dealerCode]) {
          result[segment][key].dealerStats[dealerCode] = {
            dealerCode,
            dealerName: dealerInfo.name || dealerCode,
            town: dealerInfo.town || "",
            totalQty: 0,
            totalValue: 0,
          };
        }

        result[segment][key].dealerStats[dealerCode].totalQty += qty;
        result[segment][key].dealerStats[dealerCode].totalValue += val;
      }

      // Previous month window
      if (invoiceDate >= prevStart.toDate() && invoiceDate <= prevEnd.toDate()) {
        result[segment][key].LM += qty;
        result[segment][key].LMValue += val;
      }

      // FTD date
      if (invoiceDate >= ftdDateStart.toDate() && invoiceDate <= ftdDateEnd.toDate()) {
        result[segment][key].FTD += qty;
      }
    });

    // ---------------------------------
    // FORMAT SEGMENT DATA
    // ---------------------------------
    const finalData = {};
    const selectedRangeDays = Math.max(1, end.clone().startOf("day").diff(start.clone().startOf("day"), "days") + 1);

    Object.keys(result).forEach((segment) => {
      finalData[segment] = Object.values(result[segment])
        .map((row) => {
          const dealers = Object.values(row.dealerStats || {});

          const topDealersByVolume = [...dealers]
            .sort((a, b) => safeNum(b.totalQty) - safeNum(a.totalQty))
            .slice(0, 3);

          const topDealersByValue = [...dealers]
            .sort((a, b) => safeNum(b.totalValue) - safeNum(a.totalValue))
            .slice(0, 3);

          const ads = selectedRangeDays > 0 ? row.MTD / selectedRangeDays : 0;

          let gr = 0;
          if (row.LM > 0) {
            gr = ((row.MTD - row.LM) / row.LM) * 100;
          } else if (row.MTD > 0) {
            gr = 100;
          }

          return {
            ...row,
            ADS: Number(ads.toFixed(2)),
            GR: Number(gr.toFixed(2)),
            WOS: 0, // stock pending later
            topDealersByVolume,
            topDealersByValue,
          };
        })
        .sort((a, b) => safeNum(b.total) - safeNum(a.total));
    });

    // ---------------------------------
    // FLAT DATA
    // ---------------------------------
    const flatRows = Object.values(finalData).flat();

    const top3ByVolume = [...flatRows]
      .sort((a, b) => safeNum(b.total) - safeNum(a.total))
      .slice(0, 3);

    const top3ByValue = [...flatRows]
      .sort((a, b) => safeNum(b.totalValue) - safeNum(a.totalValue))
      .slice(0, 3);

    // ---------------------------------
    // SUMMARY
    // ---------------------------------
    const summary = flatRows.reduce(
      (acc, row) => {
        acc.segments = Object.keys(finalData).length;
        acc.models += 1;
        acc.lm += safeNum(row.LM);
        acc.mtd += safeNum(row.MTD);
        acc.ftd += safeNum(row.FTD);
        acc.total += safeNum(row.total);
        acc.totalValue += safeNum(row.totalValue);
        return acc;
      },
      {
        segments: 0,
        models: 0,
        lm: 0,
        mtd: 0,
        ftd: 0,
        total: 0,
        totalValue: 0,
      }
    );

    return res.status(200).json({
      success: true,
      summary,
      top3ByVolume,
      top3ByValue,
      data: finalData,
      filters: {
        categories: allCategories,
        tags: allTags,
      },
      meta: {
        appliedFilters: {
          startDate: start.format("YYYY-MM-DD"),
          endDate: end.format("YYYY-MM-DD"),
          productCategory: productCategory || null,
          tags: tagArray,
        },
        ftdDate: ftdDate.format("YYYY-MM-DD"),
        usedDefaultDateRange: !hasCustomDateFilter,
      },
    });
  } catch (err) {
    console.error("getTopSellingBySegment error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  }
};