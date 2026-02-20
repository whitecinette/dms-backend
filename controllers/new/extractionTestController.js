const XLSX = require("xlsx");
const ExtractionTest = require("../../model/ExtractionTest");
const ExtractionRecord = require("../../model/ExtractionRecord");

const BRAND_MAP = {
  samsung: "samsung",
  apple: "Apple",
  google: "Google",
  infinix: "Infinix",
  motorola: "Motorola",
  oneplus: "OnePlus",
  oppo: "Oppo",
  realme: "Realme",
  vivo: "Vivo",
  xiaomi: "Xiaomi",
  lenovo: "Lenovo",
  nothing: "Nothing",
  tecno: "Tecno",
};

const normalizeBrand = (brand) => {
  if (!brand) return "Others";

  const cleaned = brand.toString().trim().toLowerCase();

  return BRAND_MAP[cleaned] || "Others";
};

// Parse Excel
const parseFile = (buffer) => {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
};

const makeProductCode = (name) => {
  if (!name) return "UNKNOWN_ext";

  return (
    name
      .toString()
      .trim()
      .toUpperCase()
      .replace(/[\s\/()+-]+/g, "_")  // replace spaces & special chars
      .replace(/[^A-Z0-9_]/g, "")    // remove anything else
      .replace(/_+/g, "_")           // remove duplicate underscores
      .replace(/^_|_$/g, "")         // trim underscores
      + "_ext"
  );
};

// Segment Logic (From Your Screenshots)
const getSegmentFromPrice = (price) => {
  const p = Number(price);

  if (p < 6000) return "0-6";
  if (p < 10000) return "6-10";
  if (p < 15000) return "10-15";
  if (p < 20000) return "15-20";
  if (p < 30000) return "20-30";
  if (p < 40000) return "30-40";
  if (p < 70000) return "40-70";
  if (p < 100000) return "70-100";

  return "100+";
};

exports.uploadExternalExtraction = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "File required" });
    }

    const { month, year } = req.body;

    // ✅ Basic Validation
    if (!month || !year) {
      return res.status(400).json({
        message: "Month and Year are required",
      });
    }

    if (
      isNaN(month) ||
      isNaN(year) ||
      Number(month) < 1 ||
      Number(month) > 12
    ) {
      return res.status(400).json({
        message: "Invalid month/year",
      });
    }

    const rows = parseFile(req.file.buffer);
    if (!rows.length) {
      return res.status(400).json({ message: "Empty file" });
    }

    // ❗ STRICT DELETE CONDITION
    await ExtractionRecord.deleteMany({
      external: true,
      month: String(month),
      year: String(year),
    });

    const formatted = rows.map((r) => {
      const productName = r.MODEL?.toString().trim();

      return {
        uploaded_by: r.PUNCH_BY_ID?.toString().trim(),
        dealer: r.DMS_CODE?.toString().trim(),
        brand: normalizeBrand(r.BRAND),

        product_name: productName,
        product_code: makeProductCode(productName),

        price: Number(r.DP) || 0,
        quantity: Number(r.QTY) || 0,
        amount: Number(r.VAL) || 0,

        segment: getSegmentFromPrice(r.DP),
        product_category: "smart_phone",

        external: true,
        month: String(month),
        year: String(year),
      };
    });

    await ExtractionRecord.insertMany(formatted);

    res.json({
      success: true,
      message: `External month ${month}-${year} replaced`,
      total: formatted.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Upload failed" });
  }
};

exports.deleteExtractionData = async (req, res) => {
  try {
    const { month, year, external } = req.body;

    const filter = {};

    // Build dynamic filter
    if (month && year) {
      filter.month = String(month);
      filter.year = String(year);
    }

    if (typeof external === "boolean") {
      filter.external = external;
    }

    // 🚨 Safety Check
    if (Object.keys(filter).length === 0) {
      return res.status(400).json({
        message:
          "Provide at least one filter (month+year or external)",
      });
    }

    const result = await ExtractionRecord.deleteMany(filter);

    res.json({
      success: true,
      deletedCount: result.deletedCount,
      filterUsed: filter,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Delete failed",
    });
  }
};

exports.shiftExtractionMonth = async (req, res) => {
  try {
    const { month, year, external, new_month } = req.body;

    if (!month || !year || typeof external !== "boolean" || !new_month) {
      return res.status(400).json({
        message: "month, year, external, new_month are required",
      });
    }

    if (
      isNaN(month) ||
      isNaN(new_month) ||
      Number(month) < 1 ||
      Number(month) > 12 ||
      Number(new_month) < 1 ||
      Number(new_month) > 12
    ) {
      return res.status(400).json({
        message: "Invalid month values",
      });
    }

    const filter = {
      month: String(month),
      year: String(year),
      external,
    };

    const docs = await ExtractionRecord.find(filter);

    if (!docs.length) {
      return res.json({
        success: true,
        message: "No documents found",
        updated: 0,
      });
    }

    const bulkOps = docs.map((doc) => {
      const oldDate = new Date(doc.createdAt);

      // Keep same day & time, change only month
      const newDate = new Date(oldDate);
      newDate.setMonth(Number(new_month) - 1);

      return {
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              createdAt: newDate,
            },
          },
        },
      };
    });

    await ExtractionRecord.bulkWrite(bulkOps, { timestamps: false });

    res.json({
      success: true,
      message: `CreatedAt month shifted from ${month} to ${new_month}`,
      updated: docs.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Shift failed",
    });
  }
};