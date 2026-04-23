const moment = require("moment");
const ActivationData = require("../../model/ActivationData");
const Product = require("../../model/Product");
const User = require("../../model/User");
const resolveScope = require("../../services/resolvers/resolveScope");

exports.getTopSellingBySegment = async (req, res) => {
  try {
    const input = {
      ...(req.query || {}),
      ...(req.body || {}),
    };

    const {
      startDate,
      endDate,
      productCategory,
      tags,
      groupBy = "product_code",
      flow_name = "default_sales_flow",
      subordinate_filters = {},
      dealer_filters = {},
    } = input;

    console.log("Start date end date top selling: ", startDate, endDate)

    const user = req.user;

    const safeNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

    const hasCustomDateFilter = Boolean(startDate || endDate);

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

    console.log("Default Start date end date top selling: ", start, end)

    const prevStart = moment(start).subtract(1, "month").startOf("month");
    const prevEnd = moment(start).subtract(1, "month").endOf("month");

    console.log("Prev Start date end date top selling: ", prevStart, prevEnd)

    const ftdDate = hasCustomDateFilter
      ? moment(end).startOf("day")
      : moment().subtract(1, "day").startOf("day");

    const ftdDateStart = moment(ftdDate).startOf("day");
    const ftdDateEnd = moment(ftdDate).endOf("day");

    const tagArray = Array.isArray(tags)
      ? tags.filter(Boolean)
      : typeof tags === "string" && tags.trim()
      ? tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    const isAdmin =
      user?.role === "admin" ||
      user?.role === "super_admin" ||
      user?.role === "hr";

    const normalizedSubordinateFilters =
      subordinate_filters &&
      typeof subordinate_filters === "object" &&
      !Array.isArray(subordinate_filters)
        ? subordinate_filters
        : {};

    const normalizedDealerFilters =
      dealer_filters &&
      typeof dealer_filters === "object" &&
      !Array.isArray(dealer_filters)
        ? dealer_filters
        : {};

    const hasScopeFilters =
      Object.keys(normalizedSubordinateFilters).length > 0 ||
      Object.keys(normalizedDealerFilters).length > 0;

    const scope = await resolveScope({
      user,
      flow_name,
      subordinate_filters: normalizedSubordinateFilters,
      dealer_filters: normalizedDealerFilters,
      exclude_positions: [],
    });

    const scopedDealerCodes = Array.isArray(scope?.dealer) ? scope.dealer : [];

    let dealerFilter = {};

    // Non-admins should always be restricted to scope
    // Admins/super_admin/hr should see all data when no scope filters are applied
    if (!isAdmin || hasScopeFilters) {
      dealerFilter = {
        tertiary_buyer_code: { $in: scopedDealerCodes },
      };
    }

    const baseSamsungFilter = { brand: "samsung" };
    const productFilter = { ...baseSamsungFilter };

    if (productCategory) {
      productFilter.product_category = productCategory;
    }

    if (tagArray.length) {
      productFilter.tags = { $in: tagArray };
    }

    const filteredProducts = await Product.find(productFilter).lean();
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

    const activations = await ActivationData.find({
      ...dealerFilter,
    }).lean();

    function parseDate(raw) {
      const m = moment(raw, ["M/D/YY", "MM/DD/YY"], true);
      return m.isValid() ? m.toDate() : null;
    }

    const filteredActivations = activations.filter((a) => {
      return (
        allowedProductCodes.has(a.product_code) ||
        allowedModelCodes.has(a.model_no)
      );
    });

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
      const key =
        a.product_code ||
        product?.product_code ||
        a.model_no ||
        product?.model_code ||
        "UNKNOWN_PRODUCT";

      if (!result[segment]) result[segment] = {};

      if (!result[segment][key]) {
        result[segment][key] = {
          rowType: "item",
          product_code: a.product_code || product?.product_code || "-",
          model: a.model_no || product?.model_code || "-",
          model_code: product?.model_code || a.model_no || "UNKNOWN_MODEL",
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

      if (invoiceDate >= prevStart.toDate() && invoiceDate <= prevEnd.toDate()) {
        result[segment][key].LM += qty;
        result[segment][key].LMValue += val;
      }

      if (invoiceDate >= ftdDateStart.toDate() && invoiceDate <= ftdDateEnd.toDate()) {
        result[segment][key].FTD += qty;
      }
    });

    const selectedRangeDays = Math.max(
      1,
      end.clone().startOf("day").diff(start.clone().startOf("day"), "days") + 1
    );

    const finalData = {};

    Object.keys(result).forEach((segment) => {
      const itemRows = Object.values(result[segment])
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
            WOS: 0,
            topDealersByVolume,
            topDealersByValue,
          };
        })
        .sort((a, b) => safeNum(b.MTD) - safeNum(a.MTD));

      if (groupBy === "model") {
        const groupedMap = {};

        itemRows.forEach((row) => {
          const modelKey = row.model_code || row.model || "UNKNOWN_MODEL";

          if (!groupedMap[modelKey]) {
            groupedMap[modelKey] = {
              rowType: "group",
              model_code: modelKey,
              model: modelKey,
              name: modelKey,
              segment,
              product_category: "",
              category: "",
              tags: [],
              dp: 0,
              LM: 0,
              MTD: 0,
              FTD: 0,
              GR: 0,
              ADS: 0,
              WOS: 0,
              total: 0,
              totalValue: 0,
              variantCount: 0,
              children: [],
            };
          }

          groupedMap[modelKey].children.push(row);
          groupedMap[modelKey].LM += safeNum(row.LM);
          groupedMap[modelKey].MTD += safeNum(row.MTD);
          groupedMap[modelKey].FTD += safeNum(row.FTD);
          groupedMap[modelKey].total += safeNum(row.total);
          groupedMap[modelKey].totalValue += safeNum(row.totalValue);
          groupedMap[modelKey].variantCount += 1;
          groupedMap[modelKey].dp = Math.max(groupedMap[modelKey].dp, safeNum(row.dp));
        });

        finalData[segment] = Object.values(groupedMap)
          .map((group) => {
            const ads = selectedRangeDays > 0 ? group.MTD / selectedRangeDays : 0;

            let gr = 0;
            if (group.LM > 0) {
              gr = ((group.MTD - group.LM) / group.LM) * 100;
            } else if (group.MTD > 0) {
              gr = 100;
            }

            const tagSet = new Set();
            group.children.forEach((child) => {
              (child.tags || []).forEach((tag) => tagSet.add(tag));
            });

            return {
              ...group,
              ADS: Number(ads.toFixed(2)),
              GR: Number(gr.toFixed(2)),
              tags: [...tagSet],
              children: group.children.sort((a, b) => safeNum(b.MTD) - safeNum(a.MTD)),
            };
          })
          .sort((a, b) => safeNum(b.MTD) - safeNum(a.MTD));
      } else {
        finalData[segment] = itemRows;
      }
    });

    const flatRowsForSummary =
      groupBy === "model"
        ? Object.values(finalData).flatMap((groups) =>
            groups.flatMap((group) => group.children || [])
          )
        : Object.values(finalData).flat();

    const top3ByVolume = [...flatRowsForSummary]
      .sort((a, b) => safeNum(b.total) - safeNum(a.total))
      .slice(0, 3);

    const top3ByValue = [...flatRowsForSummary]
      .sort((a, b) => safeNum(b.totalValue) - safeNum(a.totalValue))
      .slice(0, 3);

    const summary = flatRowsForSummary.reduce(
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
          groupBy,
          flow_name,
          subordinate_filters: normalizedSubordinateFilters,
          dealer_filters: normalizedDealerFilters,
        },
        ftdDate: ftdDate.format("YYYY-MM-DD"),
        usedDefaultDateRange: !hasCustomDateFilter,
        groupBy,
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