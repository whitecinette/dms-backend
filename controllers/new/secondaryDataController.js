const SecondaryData = require("../../model/SecondaryData");


exports.uploadSecondary = async (req, res) => {
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

    res.json({
      success: true,
      message: `Secondary month ${yearMonth} replaced`,
      total: formatted.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Upload failed" });
  }
};


exports.getSecondary = async (req, res) => {
  const { year_month } = req.query;

  const data = await SecondaryData.find({ year_month });

  res.json({ success: true, total: data.length, data });
};


exports.downloadSecondaryFormat = (req, res) => {
  const headers = [
    "MDDCode",
    "MDDName",
    "InvoiceNo",
    "InvoiceDate",
    "SKU",
    "Model",
    "Qty",
    "Net_Value",
  ];

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=secondary_format.csv"
  );

  res.send(headers.join(",") + "\n");
};
