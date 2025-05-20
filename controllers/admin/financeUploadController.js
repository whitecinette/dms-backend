const FinanceUpload = require("../../model/FinanceUpload");

// POST /api/finance-upload
exports.uploadFinanceData = async (req, res) => {
  try {
    console.log("Reaching");
    const { label, type, startDate, endDate, rows } = req.body;

    if (!label || !type || !startDate || !endDate || !rows || !Array.isArray(rows)) {
      return res.status(400).json({ message: "Missing required fields or invalid data format" });
    }

    // Determine function
    const lowerType = type.toLowerCase();
    let func = "credit";
    if (lowerType.includes("debit")) func = "debit";

    // Determine role
    let role = "main";
    if (lowerType.includes("working")) role = "sub";

    // Map each row to include metadata
    const enrichedRows = rows.map(row => ({
      ...row,
      label,
      type,
      function: func,
      role,
      startDate,
      endDate,
    }));

    // Insert all rows
    await FinanceUpload.insertMany(enrichedRows);

    return res.status(200).json({ message: "Upload successful", inserted: enrichedRows.length });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ message: "Server error", error });
  }
};
