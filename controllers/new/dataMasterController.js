const XLSX = require("xlsx");
const ActivationData = require("../../model/ActivationData");
const SecondaryData = require("../../model/SecondaryData");
const TertiaryData = require("../../model/TertiaryData");


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

const validateHeaders = (row, requiredHeaders) => {
  const fileHeaders = Object.keys(row);
  const missing = requiredHeaders.filter(h => !fileHeaders.includes(h));

  if (missing.length) {
    throw new Error(
      `Missing required columns: ${missing.join(", ")}`
    );
  }
};

const validateSingleMonth = (rows, dateKey) => {
  const months = new Set(
    rows.map((r) => getYearMonth(r[dateKey]))
  );

  if (months.size !== 1) {
    throw new Error("File contains multiple months. Upload one month at a time.");
  }

  return [...months][0];
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

    if (!workbook.SheetNames.length) {
      return res.status(400).json({ message: "No sheets found in file" });
    }

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
          "ActivationDate",
          "ModelNo",
          "ProductCode",
          "TertiaryBuyerCode",
          "TertiarySellerCode",
          "Qty",
          "VAL",
        ]);

        const yearMonth = validateSingleMonth(rows, "ActivationDate");

        await ActivationData.deleteMany({ year_month: yearMonth });

        const formatted = rows.map((r) => ({
          activation_date_raw: r.ActivationDate,
          year_month: getYearMonth(r.ActivationDate),
          model_no: r.ModelNo,
          product_code: r.ProductCode,
          tertiary_buyer_code: r.TertiaryBuyerCode,
          tertiary_seller_code: r.TertiarySellerCode,
          qty: Number(r.Qty),
          val: Number(r.VAL),
        }));

        await ActivationData.insertMany(formatted);
      }

      // =============================
      // TERTIARY
      // =============================
      if (name.startsWith("tertiary")) {

        validateHeaders(rows[0], [
          "MDDCode",
          "MDDName",
          "DealerCode",
          "DealerName",
          "InvoiceDate",
          "Model",
          "SKU",
          "Qty",
          "Net_Value",
        ]);

        const yearMonth = validateSingleMonth(rows, "InvoiceDate");

        await TertiaryData.deleteMany({ year_month: yearMonth });

        const formatted = rows.map((r) => ({
          mdd_code: r.MDDCode,
          mdd_name: r.MDDName,
          dealer_code: r.DealerCode,
          dealer_name: r.DealerName,
          invoice_no: r.InvoiceNo,
          invoice_date_raw: r.InvoiceDate,
          year_month: getYearMonth(r.InvoiceDate),
          model: r.Model,
          sku: r.SKU,
          qty: Number(r.Qty),
          net_value: Number(r.Net_Value),
          month_year: r.MonthYear,
        }));

        await TertiaryData.insertMany(formatted);
      }

      // =============================
      // SECONDARY
      // =============================
      if (name === "secondary") {

        validateHeaders(rows[0], [
          "MDDCode",
          "MDDName",
          "InvoiceDate",
          "SKU",
          "Model",
          "Qty",
          "Net_Value",
        ]);

        const yearMonth = validateSingleMonth(rows, "InvoiceDate");

        await SecondaryData.deleteMany({ year_month: yearMonth });

        const formatted = rows.map((r) => ({
          mdd_code: r.MDDCode,
          mdd_name: r.MDDName,
          invoice_no: r.InvoiceNo,
          invoice_date_raw: r.InvoiceDate,
          year_month: getYearMonth(r.InvoiceDate),
          sku: r.SKU,
          model: r.Model,
          qty: Number(r.Qty),
          net_value: Number(r.Net_Value),
        }));

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
