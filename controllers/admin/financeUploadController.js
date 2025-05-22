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

// GET /finance/main-labels
exports.getMainLabels = async (req, res) => {
  try {
    const { search = "", type, startDate, endDate } = req.query;

    const matchStage = {
      role: "main",
    };

    // 🔍 Universal Search on label
    if (search) {
      matchStage.label = { $regex: search, $options: "i" };
    }

    // 🎯 Filter by type
    if (type) {
      matchStage.type = type;
    }

    // 📅 Date range filter (inclusive)
    if (startDate && endDate) {
      matchStage.startDate = { $gte: new Date(startDate) };
      matchStage.endDate = { $lte: new Date(endDate) };
    }

    const results = await FinanceUpload.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$label",
          type: { $first: "$type" },
          function: { $first: "$function" },
          startDate: { $first: "$startDate" },
          endDate: { $first: "$endDate" },
        },
      },
      {
        $project: {
          _id: 0,
          label: "$_id",
          type: 1,
          function: 1,
          startDate: 1,
          endDate: 1,
        },
      },
      { $sort: { startDate: -1 } }
    ]);

    res.status(200).json({ success: true, data: results });
  } catch (err) {
    console.error("Error fetching main labels:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /finance/details/:label?role=main|sub
exports.getFinanceDetailsByLabel = async (req, res) => {
  try {
    const { label } = req.params;
    const { role = "main" } = req.query;

    if (!label) {
      return res.status(400).json({ success: false, message: "Label is required" });
    }

    const entries = await FinanceUpload.find({ label, role });
    res.status(200).json({ success: true, data: entries });
  } catch (error) {
    console.error("Error fetching finance details:", error);
    res.status(500).json({ success: false, message: "Server error", error });
  }
};

//delete/finance/:label
exports.deleteFinanceByLabel = async (req, res) => {
  try {
    const { label } = req.params;
    const{ startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ warning: true, message: "Start date and end date are required" });
    }
    if (!label) {
      return res.status(400).json({ warning: true, message: "Label is required" });
    }

    await FinanceUpload.deleteMany({ label, startDate, endDate });
    res.status(200).json({ success: true, message: `${label} deleted successfully` });  
  }catch (error) {
    console.error("Error deleting finance data:", error);
    res.status(500).json({ success: false, message: "Server error", error });
  }
}