const XLSX = require("xlsx");
const ProductMaster = require("../../model/ProductMaster");

// =============================
// NORMALIZATION HELPERS
// =============================

const CATEGORY_MAP = {
  SP: "Smartphone",
  "M & F": "Smartphone",

  TAB: "Tablet",
  WIFITABIT: "Tablet",

  WATCH: "Watch",
  BUDS: "Buds",
  RING: "Ring",
};

const normalizeCategory = (value) => {
  if (!value) return "";
  const key = value.toString().trim().toUpperCase();
  return CATEGORY_MAP[key] || value.trim();
};

const normalizeBoolean = (value, defaultVal = false) => {
  if (value === undefined || value === null || value === "") {
    return defaultVal;
  }

  const v = value.toString().trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
};

const normalizeCompetitor = (value) => {
  if (!value) return "Own";
  const v = value.toString().trim().toLowerCase();
  return v === "competitor" ? "Competitor" : "Own";
};

const normalizeString = (value) => {
  if (!value) return "";
  return value.toString().trim();
};

// =============================
// UPLOAD PRODUCT MASTER
// =============================

exports.uploadProductMaster = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (!rows.length) {
      return res.status(400).json({ message: "Empty sheet" });
    }

    const bulkOps = rows.map((r) => {
      const updateFields = {
        brand: normalizeString(r.Brand) || "Samsung",

        model: normalizeString(r.MODEL),
        family: normalizeString(r.Family),
        product_name: normalizeString(r.PRODUCT_NAME),

        dp: r.DP ? Number(r.DP) : undefined,
        mop: r.MOP ? Number(r.MOP) : undefined,

        model_age: normalizeString(r.MODEL_AGE),

        category: normalizeCategory(r.Category),
        sub_category: normalizeString(r.SubCategory),

        segment: normalizeString(r.Segment),
        sub_segment: normalizeString(r.SubSegment),

        in_billed_dis: r.InBilledDis ? Number(r.InBilledDis) : undefined,

        launch_month: normalizeString(r.launch_month),

        is_active: normalizeBoolean(r.is_active, false),
        market_share_active: normalizeBoolean(r.market_share_active, false),
        is_accessory: normalizeBoolean(r.is_accessory, false),
        is_smartphone: normalizeBoolean(r.is_smartphone, false),


        competitor_type: normalizeCompetitor(r.competitor_type),
      };

      return {
        updateOne: {
          filter: { sku: normalizeString(r.SKU) },
          update: { $set: updateFields },
          upsert: true,
        },
      };
    });

    const result = await ProductMaster.bulkWrite(bulkOps);

    res.json({
      success: true,
      message: "Product master uploaded successfully",
      inserted: result.upsertedCount,
      modified: result.modifiedCount,
    });

  } catch (err) {
    console.error("Upload error:", err.message);
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

// =============================
// GET ALL PRODUCTS
// =============================

exports.getAllProducts = async (req, res) => {
  try {
    let {
      brand = "Samsung",
      page = 1,
      limit = 100,
      is_active = "true",
    } = req.query;

    page = Number(page);
    limit = Number(limit);

    const query = {
      brand: { $regex: `^${brand}$`, $options: "i" },
    };

    // Default active products only
    if (is_active !== undefined) {
      query.is_active = is_active === "true";
    }

    const products = await ProductMaster.find(query)
      .sort({ model: 1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await ProductMaster.countDocuments(query);

    res.json({
      success: true,
      total,
      page,
      limit,
      data: products,
    });

  } catch (err) {
    console.error("Fetch error:", err.message);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =============================
// UPDATE PRODUCT (ADMIN EDIT)
// =============================

exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await ProductMaster.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.json({
      success: true,
      data: updated,
    });

  } catch (err) {
    console.error("Update error:", err.message);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
