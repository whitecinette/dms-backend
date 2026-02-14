const ActivationData = require("../../model/ActivationData");


exports.uploadActivation = async (req, res) => {
  try {
    const rows = parseFile(req.file.buffer, req.file.originalname);
    if (!rows.length) return res.status(400).json({ message: "Empty file" });

    const months = new Set(
      rows.map((r) => getYearMonth(r.ActivationDate))
    );

    if (months.size !== 1) {
      return res.status(400).json({
        message: "Multiple months detected. Upload one month at a time.",
      });
    }

    const yearMonth = [...months][0];

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

    res.json({
      success: true,
      message: `Activation month ${yearMonth} replaced`,
      total: formatted.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Upload failed" });
  }
};


exports.getActivation = async (req, res) => {
  const { year_month } = req.query;

  const data = await ActivationData.find({ year_month });

  res.json({ success: true, total: data.length, data });
};


exports.downloadActivationFormat = (req, res) => {
  const headers = [
    "ActivationDate",
    "ModelNo",
    "ProductCode",
    "TertiaryBuyerCode",
    "TertiarySellerCode",
    "Qty",
    "VAL",
  ];

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=activation_format.csv"
  );

  res.send(headers.join(",") + "\n");
};
