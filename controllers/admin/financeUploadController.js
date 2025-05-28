const { duration } = require("moment");
const FinanceUpload = require("../../model/FinanceUpload");
const path = require("path");
const XLSX = require("xlsx");

const formatDateForDisplay = (dateObj) => {
  const options = { day: "2-digit", month: "short", year: "2-digit" };
  return dateObj.toLocaleDateString("en-GB", options).replace(/ /g, "-");
};

const formatDateToRangeLabel = (start, end) => {
  const safeDate = (d) => new Date(d instanceof Date ? d : new Date(d));

  if (!start || !end || isNaN(safeDate(start)) || isNaN(safeDate(end))) {
    return "Invalid duration";
  }

  const format = (date) =>
    safeDate(date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "2-digit",
    }).replace(/ /g, " ").replace(",", "'");

  return `${format(start)} to ${format(end)}`;
};

const formatDateShort = (date) =>
  new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).replace(/ /g, "-").replace(",", "'");


exports.uploadFinanceData = async (req, res) => {
  try {
    console.log("Reachingg")
    const file = req.file; // handled by multer
    if (!file) return res.status(400).json({ message: "No file uploaded" });

    const fileName = path.basename(file.originalname, path.extname(file.originalname));
    console.log("File name: ", fileName);
    const parts = fileName.split("_");

    // Extract start and end date positions
    const dateIndex = parts.findIndex(p => /^\d{2}-\d{2}-\d{4}$/.test(p));
    if (dateIndex === -1 || parts[dateIndex + 1] !== "to" || !parts[dateIndex + 2]) {
      return res.status(400).json({ message: "Filename must include startDate_to_endDate" });
    }

    const parseDate = (str) => {
      const [day, month, year] = str.split("-").map(Number);
      return new Date(year, month - 1, day);
    };

    const startDate = parseDate(parts[dateIndex]);
    const endDate = parseDate(parts[dateIndex + 2]);
    if (isNaN(startDate) || isNaN(endDate)) {
      return res.status(400).json({ message: "Invalid date format in file name" });
    }

    const schemeParts = parts.slice(0, dateIndex);
    const label = schemeParts.join(" ").replace(/_/g, " ");

    const workbook = XLSX.read(file.buffer, { type: "buffer" });

    let totalInserted = 0;

    for (const sheetName of workbook.SheetNames) {
      const lower = sheetName.toLowerCase();
      let func = "", role = "";

      if (lower.includes("credit") && lower.includes("voucher")) {
        func = "credit";
        role = "main";
      } else if (lower.includes("debit") && lower.includes("voucher")) {
        func = "debit";
        role = "main";
      } else if (lower.includes("credit") && lower.includes("working")) {
        func = "credit";
        role = "sub";
      } else if (lower.includes("debit") && lower.includes("working")) {
        func = "debit";
        role = "sub";
      } else {
        console.log(`❌ Skipping unrecognized sheet: ${sheetName}`);
        continue;
      }

      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet);


      const enrichedRows = rows.map(row => ({
        ...row,
        label,
        type: sheetName,
        function: func,
        role,
        startDate,
        endDate,
        'CN Date': formatDateForDisplay(new Date()),
      }));

      try {
        const result = await FinanceUpload.insertMany(enrichedRows, { ordered: false });
        console.log(`✅ Inserted ${result.length} records for sheet: ${sheetName}`);
        totalInserted += result.length;
      } catch (insertErr) {
        console.error(`❌ Insert failed for sheet: ${sheetName}`, insertErr);
      }

      totalInserted += enrichedRows.length;
    }

    return res.status(200).json({ message: "Upload successful", inserted: totalInserted });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ message: "Server error", error });
  }
};

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
      const startUTC = new Date(new Date(startDate).setHours(0, 0, 0, 0));
      const endUTC = new Date(new Date(endDate).setHours(23, 59, 59, 999));

      matchStage.startDate = { $gte: startUTC };
      matchStage.endDate = { $lte: endUTC };
    }


    const results = await FinanceUpload.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            label: "$label",
            type: "$type",
            function: "$function",
            startDate: "$startDate",
            endDate: "$endDate"
          }
        },
      },
      {
        $project: {
          _id: 0,
          label: "$_id.label",
          type: "$_id.type",
          function: "$_id.function",
          startDate: "$_id.startDate",
          endDate: "$_id.endDate"
        }
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


exports.getCreditNotesForMdd = async (req, res) => {
  try {
    const code = req.user.code; // from JWT middleware
    const { search = "", startDate, endDate } = req.query;

    // Default to current month if no range is provided
    const today = new Date();
    const defaultStart =  new Date(today.getFullYear(), today.getMonth(), 1);
    const defaultEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const startUTC = startDate
      ? new Date(new Date(startDate).setHours(0, 0, 0, 0))
      : new Date(defaultStart.setHours(0, 0, 0, 0));

    const endUTC = endDate
      ? new Date(new Date(endDate).setHours(23, 59, 59, 999))
      : new Date(defaultEnd.setHours(23, 59, 59, 999));

    const matchStage = {
      role: "main",
      type: "credit note voucher",
      ["SRD Code"]: code,
      startDate: { $gte: startUTC },
      endDate: { $lte: endUTC },
    };

    if (search) {
      matchStage.label = { $regex: search, $options: "i" };
    }

    const results = await FinanceUpload.find(matchStage).sort({ startDate: -1 });

    const formattedResults = results.map((entry) => ({
      ...entry.toObject(),
      startDateFormatted: formatDateShort(entry.startDate),
      endDateFormatted: formatDateShort(entry.endDate),
    }));

    res.status(200).json({ success: true, data: formattedResults });

  } catch (err) {
    console.error("Error in getCreditNotesForMdd:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


exports.getCreditNotesWorkingForMdd = async (req, res) => {
  try {
    const code = req.user.code; // from JWT middleware
    const { label, startDate, endDate } = req.query;

    if (!label) {
      return res.status(400).json({ success: false, message: "Missing scheme name (label)" });
    }

    // Default to current month if no range is provided
    const today = new Date();
    const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const defaultEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const startUTC = startDate
      ? new Date(new Date(startDate).setHours(0, 0, 0, 0))
      : new Date(defaultStart.setHours(0, 0, 0, 0));

    const endUTC = endDate
      ? new Date(new Date(endDate).setHours(23, 59, 59, 999))
      : new Date(defaultEnd.setHours(23, 59, 59, 999));

    const matchStage = {
      role: "sub",
      type: "credit note working",
      ["SRD Code"]: code,
      label: label,
      startDate: { $gte: startUTC },
      endDate: { $lte: endUTC },
    };

    const results = await FinanceUpload.find(matchStage).sort({ startDate: -1 });

    const formattedResults = results.map((entry) => ({
      ...entry.toObject(),
      label: label,
      startDateFormatted: formatDateShort(entry.startDate),
      endDateFormatted: formatDateShort(entry.endDate),
    }));

    res.status(200).json({ success: true, data: formattedResults });

  } catch (err) {
    console.error("Error in getCreditNotesWorking:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getDebitNotesForMdd = async (req, res) => {
  try {
    const code = req.user.code; // from JWT middleware
    const { search = "", startDate, endDate } = req.query;

    // Default to current month if no range is provided
    const today = new Date();
    const defaultStart =  new Date(today.getFullYear(), today.getMonth(), 1);
    const defaultEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const startUTC = startDate
      ? new Date(new Date(startDate).setHours(0, 0, 0, 0))
      : new Date(defaultStart.setHours(0, 0, 0, 0));

    const endUTC = endDate
      ? new Date(new Date(endDate).setHours(23, 59, 59, 999))
      : new Date(defaultEnd.setHours(23, 59, 59, 999));

    const matchStage = {
      role: "main",
      type: "debit note voucher",
      ["SRD Code"]: code,
      startDate: { $gte: startUTC },
      endDate: { $lte: endUTC },
    };

    if (search) {
      matchStage.label = { $regex: search, $options: "i" };
    }

    const results = await FinanceUpload.find(matchStage).sort({ startDate: -1 });

    const formattedResults = results.map((entry) => ({
      ...entry.toObject(),
      startDateFormatted: formatDateShort(entry.startDate),
      endDateFormatted: formatDateShort(entry.endDate),
    }));

    res.status(200).json({ success: true, data: formattedResults });

  } catch (err) {
    console.error("Error in getDebitNotesForMdd:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


exports.getDebitNotesWorkingForMdd = async (req, res) => {
  try {
    const code = req.user.code; // from JWT middleware
    const { label, startDate, endDate } = req.query;

    if (!label) {
      return res.status(400).json({ success: false, message: "Missing scheme name (label)" });
    }

    // Default to current month if no range is provided
    const today = new Date();
    const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const defaultEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const startUTC = startDate
      ? new Date(new Date(startDate).setHours(0, 0, 0, 0))
      : new Date(defaultStart.setHours(0, 0, 0, 0));

    const endUTC = endDate
      ? new Date(new Date(endDate).setHours(23, 59, 59, 999))
      : new Date(defaultEnd.setHours(23, 59, 59, 999));

    const matchStage = {
      role: "sub",
      type: "debit note working",
      ["SRD Code"]: code,
      label: label,
      startDate: { $gte: startUTC },
      endDate: { $lte: endUTC },
    };

    const results = await FinanceUpload.find(matchStage).sort({ startDate: -1 });

    const formattedResults = results.map((entry) => ({
      ...entry.toObject(),
      label: label,
      startDateFormatted: formatDateShort(entry.startDate),
      endDateFormatted: formatDateShort(entry.endDate),
    }));

    res.status(200).json({ success: true, data: formattedResults });

  } catch (err) {
    console.error("Error in getDebitNotesWorking:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};