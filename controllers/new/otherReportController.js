const moment = require("moment");
const ActivationData = require("../../model/ActivationData");
const Product = require("../../model/Product");
const HierarchyEntries = require("../../model/HierarchyEntries");


exports.getTopSellingBySegment = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const user = req.user;

    console.log("user", user);

    const safeNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

    // -----------------------------
    // DATE RANGE
    // -----------------------------
    const start = startDate
      ? moment(startDate, "YYYY-MM-DD").startOf("day")
      : moment().startOf("month");

    const end = endDate
      ? moment(endDate, "YYYY-MM-DD").endOf("day")
      : moment().endOf("month");

    const prevStart = moment(start).subtract(1, "month").startOf("month");
    const prevEnd = moment(start).subtract(1, "month").endOf("month");

    console.log("start and end date:", start.format("YYYY-MM-DD"), end.format("YYYY-MM-DD"));

    // -----------------------------
    // FETCH DEALERS (ROLE BASED)
    // -----------------------------
    let dealerFilter = {};

    if (user.role !== "admin") {
      const hierarchy = await HierarchyEntries.find({
        hierarchy_name: "default_sales_flow",
        [String(user.position || "").toLowerCase()]: user.code,
      }).lean();

      const dealers = hierarchy.map((h) => h.dealer).filter(Boolean);

      dealerFilter = {
        tertiary_buyer_code: { $in: dealers },
      };

      console.log("hierarchy count:", hierarchy.length);
      console.log("dealer count:", dealers.length);
    }

    // -----------------------------
    // FETCH ACTIVATIONS
    // -----------------------------
    const activations = await ActivationData.find({
      ...dealerFilter,
    }).lean();

    console.log("activations count:", activations.length);

    // -----------------------------
    // HELPER: parse invoice date
    // -----------------------------
    function parseDate(raw) {
      const m = moment(raw, ["M/D/YY", "MM/DD/YY"], true);
      return m.isValid() ? m.toDate() : null;
    }

    // -----------------------------
    // PRODUCT MAP
    // -----------------------------
    const products = await Product.find().lean();
    const productMap = {};

    products.forEach((p) => {
      if (p.product_code) productMap[p.product_code] = p;
      if (p.model_code) productMap[p.model_code] = p;
    });

    // -----------------------------
    // SEGMENT FUNCTION
    // -----------------------------
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

    // -----------------------------
    // AGGREGATION
    // -----------------------------
    const result = {};

    activations.forEach((a) => {
      const invoiceDate = parseDate(a.activation_date_raw);
      if (!invoiceDate) return;

      const product = productMap[a.product_code] || productMap[a.model_no];

      const qty = safeNum(a.qty);
      const val = safeNum(a.val);

      if (qty <= 0) return;

      const price = product?.price ? safeNum(product.price) : val / qty;
      const segment = product?.segment || getSegment(price);
      const key = a.model_no || a.product_code || "UNKNOWN_MODEL";

      if (!result[segment]) result[segment] = {};

      if (!result[segment][key]) {
        result[segment][key] = {
          model: a.model_no || "-",
          name: product?.product_name || a.model_no || a.product_code || "-",
          segment,
          dp: price,
          LM: 0,
          MTD: 0,
          total: 0,
          totalValue: 0,
          MTDValue: 0,
          LMValue: 0,
        };
      }

      // CURRENT FILTER RANGE
      if (invoiceDate >= start.toDate() && invoiceDate <= end.toDate()) {
        result[segment][key].MTD += qty;
        result[segment][key].total += qty;
        result[segment][key].MTDValue += val;
        result[segment][key].totalValue += val;
      }

      // PREVIOUS MONTH
      if (invoiceDate >= prevStart.toDate() && invoiceDate <= prevEnd.toDate()) {
        result[segment][key].LM += qty;
        result[segment][key].LMValue += val;
      }
    });

    // -----------------------------
    // FORMAT SEGMENT DATA
    // -----------------------------
    const finalData = {};

    Object.keys(result).forEach((segment) => {
      finalData[segment] = Object.values(result[segment]).sort(
        (a, b) => safeNum(b.total) - safeNum(a.total)
      );
    });

    // -----------------------------
    // FLAT DATA FOR TOP LISTS
    // -----------------------------
    const flatRows = Object.values(finalData).flat();

    const top3ByVolume = [...flatRows]
      .sort((a, b) => safeNum(b.total) - safeNum(a.total))
      .slice(0, 3);

    const top3ByValue = [...flatRows]
      .sort((a, b) => safeNum(b.totalValue) - safeNum(a.totalValue))
      .slice(0, 3);

    // -----------------------------
    // SUMMARY
    // -----------------------------
    const summary = flatRows.reduce(
      (acc, row) => {
        acc.segments = Object.keys(finalData).length;
        acc.models += 1;
        acc.lm += safeNum(row.LM);
        acc.mtd += safeNum(row.MTD);
        acc.total += safeNum(row.total);
        acc.totalValue += safeNum(row.totalValue);
        return acc;
      },
      {
        segments: 0,
        models: 0,
        lm: 0,
        mtd: 0,
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
    });
  } catch (err) {
    console.error("getTopSellingBySegment error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  }
};