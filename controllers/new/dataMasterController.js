const XLSX = require("xlsx");
const ActivationData = require("../../model/ActivationData");
const SecondaryData = require("../../model/SecondaryData");
const TertiaryData = require("../../model/TertiaryData");
const Product = require("../../model/Product");

// =============================
// Helpers
// =============================

const getYearMonth = (dateStr) => {
  if (!dateStr) throw new Error("Date missing in row");

  const parts = dateStr.toString().split("/");
  if (parts.length !== 3) throw new Error("Invalid date format");

  const month = parts[0].padStart(2, "0");
  let year = parts[2];
  if (year.length === 2) year = "20" + year;

  return `${year}-${month}`;
};

const normalizeCode = (v) => String(v || "").trim().toUpperCase();

const bucketFromPrice = (price) => {
  price = Number(price) || 0;

  if (!price || price <= 0) return "";
  if (price <= 6000) return "0-6";
  if (price <= 10000) return "6-10";
  if (price <= 20000) return "10-20";
  if (price <= 30000) return "20-30";
  if (price <= 40000) return "30-40";
  if (price <= 70000) return "40-70";
  if (price <= 100000) return "70-100";
  if (price <= 120000) return "100-120";
  return "120";
};

const validateHeaders = (row, requiredHeaders) => {
  const fileHeaders = Object.keys(row);
  const missing = requiredHeaders.filter(h => !fileHeaders.includes(h));

  if (missing.length) {
    throw new Error(`Missing required columns: ${missing.join(", ")}`);
  }
};

const validateSingleMonth = (rows, dateKey) => {
  const months = new Set(rows.map((r) => getYearMonth(r[dateKey])));
  if (months.size !== 1) {
    throw new Error("File contains multiple months. Upload one month at a time.");
  }
  return [...months][0];
};

// =============================
// Product Mapper (Reusable)
// =============================
const buildProductMaps = async (codes, models) => {
  const products = await Product.find({
    brand: { $regex: /^samsung$/i },
    $or: [
      { product_code: { $in: codes } },
      { model_code: { $in: models } },
    ],
  }).lean();

  const productByCode = new Map();
  const productByModel = new Map();

  for (const p of products) {
    if (p.product_code) productByCode.set(normalizeCode(p.product_code), p);
    if (p.model_code) productByModel.set(normalizeCode(p.model_code), p);
  }

  return { productByCode, productByModel };
};

// =============================
// Combined Upload
// =============================

exports.uploadCombinedData = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (!rows.length) continue;

      const name = sheetName.toLowerCase().trim();

      // =============================
      // ACTIVATION
      // =============================
      if (name === "activation") {

        validateHeaders(rows[0], [
          "ActivationDate", "ModelNo", "ProductCode",
          "TertiaryBuyerCode", "TertiarySellerCode",
          "Qty", "VAL",
        ]);

        const yearMonth = validateSingleMonth(rows, "ActivationDate");
        await ActivationData.deleteMany({ year_month: yearMonth });

        const codes = [...new Set(rows.map(r => normalizeCode(r.ProductCode)).filter(Boolean))];
        const models = [...new Set(rows.map(r => normalizeCode(r.ModelNo)).filter(Boolean))];

        const { productByCode, productByModel } = await buildProductMaps(codes, models);

        const formatted = rows.map((r) => {
          const qty = Number(r.Qty) || 0;
          const val = Number(r.VAL) || 0;

          const product =
            productByCode.get(normalizeCode(r.ProductCode)) ||
            productByModel.get(normalizeCode(r.ModelNo));

          const unitPrice = product?.price || (qty > 0 ? val / qty : 0);
          const segment = product?.segment || bucketFromPrice(unitPrice);

          return {
            activation_date_raw: r.ActivationDate,
            year_month: getYearMonth(r.ActivationDate),
            model_no: r.ModelNo,
            product_code: r.ProductCode,
            tertiary_buyer_code: r.TertiaryBuyerCode,
            tertiary_seller_code: r.TertiarySellerCode,
            qty,
            val,
            unit_price_snapshot: unitPrice,
            segment_snapshot: segment,
          };
        });

        await ActivationData.insertMany(formatted);
      }

      // =============================
      // TERTIARY
      // =============================
      if (name.startsWith("tertiary")) {

        validateHeaders(rows[0], [
          "MDDCode","MDDName","DealerCode","DealerName",
          "InvoiceDate","Model","SKU","Qty","Net_Value",
        ]);

        const yearMonth = validateSingleMonth(rows, "InvoiceDate");
        await TertiaryData.deleteMany({ year_month: yearMonth });

        const codes = [...new Set(rows.map(r => normalizeCode(r.SKU)).filter(Boolean))];
        const models = [...new Set(rows.map(r => normalizeCode(r.Model)).filter(Boolean))];

        const { productByCode, productByModel } = await buildProductMaps(codes, models);

        const formatted = rows.map((r) => {
          const qty = Number(r.Qty) || 0;
          const val = Number(r.Net_Value) || 0;

          const product =
            productByCode.get(normalizeCode(r.SKU)) ||
            productByModel.get(normalizeCode(r.Model));

          const unitPrice = product?.price || (qty > 0 ? val / qty : 0);
          const segment = product?.segment || bucketFromPrice(unitPrice);

          return {
            mdd_code: r.MDDCode,
            mdd_name: r.MDDName,
            dealer_code: r.DealerCode,
            dealer_name: r.DealerName,
            invoice_no: r.InvoiceNo,
            invoice_date_raw: r.InvoiceDate,
            year_month: getYearMonth(r.InvoiceDate),
            model: r.Model,
            sku: r.SKU,
            qty,
            net_value: val,
            month_year: r.MonthYear,
            unit_price_snapshot: unitPrice,
            segment_snapshot: segment,
          };
        });

        await TertiaryData.insertMany(formatted);
      }

      // =============================
      // SECONDARY
      // =============================
      if (name === "secondary") {

        validateHeaders(rows[0], [
          "MDDCode","MDDName","InvoiceDate",
          "SKU","Model","Qty","Net_Value",
        ]);

        const yearMonth = validateSingleMonth(rows, "InvoiceDate");
        await SecondaryData.deleteMany({ year_month: yearMonth });

        const codes = [...new Set(rows.map(r => normalizeCode(r.SKU)).filter(Boolean))];
        const models = [...new Set(rows.map(r => normalizeCode(r.Model)).filter(Boolean))];

        const { productByCode, productByModel } = await buildProductMaps(codes, models);

        const formatted = rows.map((r) => {
          const qty = Number(r.Qty) || 0;
          const val = Number(r.Net_Value) || 0;

          const product =
            productByCode.get(normalizeCode(r.SKU)) ||
            productByModel.get(normalizeCode(r.Model));

          const unitPrice = product?.price || (qty > 0 ? val / qty : 0);
          const segment = product?.segment || bucketFromPrice(unitPrice);

          return {
            mdd_code: r.MDDCode,
            mdd_name: r.MDDName,
            invoice_no: r.InvoiceNo,
            invoice_date_raw: r.InvoiceDate,
            year_month: getYearMonth(r.InvoiceDate),
            sku: r.SKU,
            model: r.Model,
            qty,
            net_value: val,
            unit_price_snapshot: unitPrice,
            segment_snapshot: segment,
          };
        });

        await SecondaryData.insertMany(formatted);
      }
    }

    res.json({
      success: true,
      message: "Combined upload processed successfully",
    });

  } catch (err) {
    console.error("Upload error:", err.message);
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};