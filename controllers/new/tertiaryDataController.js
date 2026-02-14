const TertiaryData = require("../../model/TertiaryData");


exports.uploadTertiary = async (req, res) => {
  try {
    const rows = parseFile(req.file.buffer, req.file.originalname);
    if (!rows.length) return res.status(400).json({ message: "Empty file" });

    const months = new Set(
      rows.map((r) => getYearMonth(r.InvoiceDate))
    );

    if (months.size !== 1) {
      return res.status(400).json({
        message: "Multiple months detected. Upload one month at a time.",
      });
    }

    const yearMonth = [...months][0];

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

    res.json({
      success: true,
      message: `Tertiary month ${yearMonth} replaced`,
      total: formatted.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Upload failed" });
  }
};


exports.getTertiary = async (req, res) => {
  const { year_month } = req.query;

  const data = await TertiaryData.find({ year_month });

  res.json({ success: true, total: data.length, data });
};


exports.downloadTertiaryFormat = (req, res) => {
  const headers = [
    "MDDCode",
    "MDDName",
    "DealerCode",
    "DealerName",
    "InvoiceNo",
    "InvoiceDate",
    "Model",
    "SKU",
    "Qty",
    "Net_Value",
    "MonthYear",
  ];

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=tertiary_format.csv"
  );

  res.send(headers.join(",") + "\n");
};
