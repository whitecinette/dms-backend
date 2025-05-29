// controllers/financeVoucherController.js
const XLSX = require("xlsx");
const mongoose = require("mongoose");
const moment = require("moment-timezone");
const FinanceVoucher = require("../../model/FinanceVoucher");

function parseExcelSerialDate(serial) {
  if (typeof serial !== "number") return null;
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  return moment.tz(utc_value * 1000, "Asia/Kolkata");
}

exports.uploadFinanceVouchers = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "File is required." });

    const isExcel = req.file.originalname.endsWith(".xlsx");
    const isCsv = req.file.originalname.endsWith(".csv");

    let rows = [];

    if (isExcel) {
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    } else if (isCsv) {
      const csv = req.file.buffer.toString("utf-8");
      rows = XLSX.utils.sheet_to_json(XLSX.read(csv, { type: "string" }).Sheets.Sheet1, { defval: "" });
    } else {
      return res.status(400).json({ message: "Unsupported file format." });
    }

    const cleaned = [];

    for (const row of rows) {
      const rawDateVal = row.Date;
      const dueDateVal = row["Due Date"];

      // Skip repeated headers and total rows
      if (
        typeof rawDateVal === "string" && rawDateVal.toLowerCase().includes("total") ||
        typeof row["MDD Code"] === "string" && row["MDD Code"].toLowerCase().includes("mdd code")
      ) {
        continue;
      }

      // Safe moment parse (Excel formatted or serial fallback)
      const rawDate = moment(rawDateVal, "DD-MMM-YY", true).isValid()
        ? moment.tz(rawDateVal, "DD-MMM-YY", "Asia/Kolkata")
        : parseExcelSerialDate(rawDateVal);

      const dueDate = moment(dueDateVal, "DD-MMM-YY", true).isValid()
        ? moment.tz(dueDateVal, "DD-MMM-YY", "Asia/Kolkata")
        : parseExcelSerialDate(dueDateVal);

      const amtRaw = row["Invoice Amt"];
      const isCredit = typeof amtRaw === "string" && amtRaw.toLowerCase().includes("cr");
      console.log("isCredit: ", isCredit);
      console.log("amt row: ", amtRaw)

      const refRaw = row["Invoice/CN/DN No"];
      const refStr = typeof refRaw === "string" ? refRaw : refRaw?.toString() || "";
      const refLower = refStr.toLowerCase();
      const refUpper = refStr.toUpperCase();

      const voucherType = (() => {
        if (refLower.includes("scheme") || refLower.includes("stk")) {
          return isCredit ? "Credit Note" : "Debit Note";
        }
        if (refUpper.startsWith("SZD") || refUpper.startsWith("GT")) {
          return "Invoice";
        }
        return "Debit Note";
      })();


      const pendingAmt = parseFloat((row["Pending Amt"] || "").toString().replace(/[^\d.-]/g, "")) || 0;
      const invoiceAmt = parseFloat((amtRaw || "").toString().replace(/[^\d.-]/g, "")) || 0;
      const dueDays = parseInt(row["Due Days"]) || 0;
      const today = moment().startOf("day");

      let remarks = "Upcoming Dues";
      if (dueDate) {
        const diff = dueDate.diff(today, "days");
        if (diff < 0) remarks = "Overdue";
        else if (diff === 0) remarks = "Today Due";
      }

        cleaned.push({
        code: row["MDD Code"] || "",
        name: row["MDD Name"] || "",
        partyName: row["Party's Name"] || "",
        voucherName: row["Invoice/CN/DN No"] || "",
        voucherType,
        invoiceNumber: row["Invoice/CN/DN No"] || "",
        date: rawDate?.format("DD-MMM-YY") || rawDateVal,
        dateISO: rawDate?.toDate() || null,
        dueDate: dueDate?.format("DD-MMM-YY") || dueDateVal,
        dueDateISO: dueDate?.toDate() || null,
        dueDays,
        invoiceAmount: invoiceAmt,
        pendingAmount: pendingAmt,
        isCredit,
        remarks,
        overDueDays: dueDays,
        });

    }

    // Delete all existing records before inserting new ones
    await FinanceVoucher.deleteMany({});

    await FinanceVoucher.insertMany(cleaned);
    return res.status(200).json({ message: "Upload successful", inserted: cleaned.length });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// exports.uploadFinanceVouchers = async (req, res) => {
//   try {
//     if (!req.file) return res.status(400).json({ message: "File is required." });

//     const isExcel = req.file.originalname.endsWith(".xlsx");
//     const isCsv = req.file.originalname.endsWith(".csv");

//     let rows = [];

//     if (isExcel) {
//       const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
//       const sheet = workbook.Sheets[workbook.SheetNames[0]];
//       rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
//     } else if (isCsv) {
//       const csv = req.file.buffer.toString("utf-8");
//       rows = XLSX.utils.sheet_to_json(XLSX.read(csv, { type: "string" }).Sheets.Sheet1, { defval: "" });
//     } else {
//       return res.status(400).json({ message: "Unsupported file format." });
//     }

//     const cleaned = [];

//     for (const row of rows) {
//       const rawDateVal = row.Date;
//       const dueDateVal = row["Due Date"];

//       // Skip repeated headers and total rows
//       if (
//         typeof rawDateVal === "string" && rawDateVal.toLowerCase().includes("total") ||
//         typeof row["MDD Code"] === "string" && row["MDD Code"].toLowerCase().includes("mdd code")
//       ) {
//         continue;
//       }

//       // Safe moment parse (Excel formatted or serial fallback)
//       const rawDate = moment(rawDateVal, "DD-MMM-YY", true).isValid()
//         ? moment.tz(rawDateVal, "DD-MMM-YY", "Asia/Kolkata")
//         : parseExcelSerialDate(rawDateVal);

//       const dueDate = moment(dueDateVal, "DD-MMM-YY", true).isValid()
//         ? moment.tz(dueDateVal, "DD-MMM-YY", "Asia/Kolkata")
//         : parseExcelSerialDate(dueDateVal);

//       const amtRaw = row["Invoice Amt"];
//       const isCredit = typeof amtRaw === "string" && amtRaw.toLowerCase().includes("cr");
//       console.log("isCredit: ", isCredit);
//       console.log("amt row: ", amtRaw)

//       const refRaw = row["Invoice/CN/DN No"];
//       const refStr = typeof refRaw === "string" ? refRaw : refRaw?.toString() || "";
//       const refLower = refStr.toLowerCase();
//       const refUpper = refStr.toUpperCase();

//       const voucherType = (() => {
//         if (refLower.includes("scheme") || refLower.includes("stk")) {
//           return isCredit ? "Credit Note" : "Debit Note";
//         }
//         if (refUpper.startsWith("SZD") || refUpper.startsWith("GT")) {
//           return "Invoice";
//         }
//         return "Debit Note";
//       })();


//       const pendingAmt = parseFloat((row["Pending Amt"] || "").toString().replace(/[^\d.-]/g, "")) || 0;
//       const invoiceAmt = parseFloat((amtRaw || "").toString().replace(/[^\d.-]/g, "")) || 0;
//       const dueDays = parseInt(row["Due Days"]) || 0;
//       const today = moment().startOf("day");

//       let remarks = "Upcoming Dues";
//       if (dueDate) {
//         const diff = dueDate.diff(today, "days");
//         if (diff < 0) remarks = "Overdue";
//         else if (diff === 0) remarks = "Today Due";
//       }

//         cleaned.push({
//         code: row["MDD Code"] || "",
//         name: row["MDD Name"] || "",
//         partyName: row["Party's Name"] || "",
//         voucherName: row["Invoice/CN/DN No"] || "",
//         voucherType,
//         invoiceNumber: row["Invoice/CN/DN No"] || "",
//         date: rawDate?.format("DD-MMM-YY") || rawDateVal,
//         dateISO: rawDate?.toDate() || null,
//         dueDate: dueDate?.format("DD-MMM-YY") || dueDateVal,
//         dueDateISO: dueDate?.toDate() || null,
//         dueDays,
//         invoiceAmount: invoiceAmt,
//         pendingAmount: pendingAmt,
//         isCredit,
//         remarks,
//         overDueDays: dueDays,
//         });

//     }

//     await FinanceVoucher.insertMany(cleaned);
//     return res.status(200).json({ message: "Upload successful", inserted: cleaned.length });
//   } catch (err) {
//     console.error("Upload error:", err);
//     return res.status(500).json({ message: "Server error", error: err.message });
//   }
// };

exports.getFinanceVouchersForAdmin = async (req, res) => {
  try {
    console.log("Vou")
    const { startDate, endDate, page = 1, limit = 100 } = req.query;

    const query = {};

    // Apply date filter if provided
    if (startDate && endDate) {
      const start = moment(startDate, "YYYY-MM-DD").startOf("day").toDate();
      const end = moment(endDate, "YYYY-MM-DD").endOf("day").toDate();
      query.dateISO = { $gte: start, $lte: end };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [total, data] = await Promise.all([
      FinanceVoucher.countDocuments(query),
      FinanceVoucher.find(query)
        .sort({ createdAt: -1 }) // Most recent first
        .skip(skip)
        .limit(parseInt(limit)),
    ]);

    console.log("Data: ", data);

    res.status(200).json({
      success: true,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      data,
    });
  } catch (error) {
    console.error("Fetch error:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

exports.getFinanceSummaryForUser = async (req, res) => {
  try {
    const { code } = req.user;

    if (!code) {
      return res.status(400).json({ success: false, message: "Code is required" });
    }

    const today = moment().startOf("day").toDate();
    const tomorrow = moment().endOf("day").toDate();

    const vouchers = await FinanceVoucher.find({ code });

    let todayTotalOS = 0;
    let todayDue = 0;
    let todayOverdue = 0;
    let totalDueOverdue = 0;

    for (const v of vouchers) {
        if (!v.dueDateISO || !v.pendingAmount || isNaN(v.pendingAmount)) continue;

        const dueDate = moment(v.dueDateISO).startOf("day").toDate();
        const pending = parseFloat(v.pendingAmount);

        // Total OS (sum of all pending)
        todayTotalOS += pending;

        if (dueDate.getTime() === today.getTime()) {
            todayDue += pending;
        } else if (dueDate < today) {
            todayOverdue += pending;
        }
    }

    // Total Due Overdue = todayDue + todayOverdue
    totalDueOverdue = todayDue + todayOverdue;


    res.status(200).json({
      success: true,
      data: {
        todayTotalOS,
        todayDue,
        todayOverdue,
        totalDueOverdue,
      },
    });
  } catch (error) {
    console.error("Summary error:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

exports.getFinanceOutstandingBreakup = async (req, res) => {
  try {
    const { code } = req.user;
    if (!code) return res.status(400).json({ success: false, message: "User code missing" });

    const vouchers = await FinanceVoucher.find({ code }).sort({ dueDateISO: 1 });

    const today = moment().startOf("day");
    const data = [];

    for (const v of vouchers) {
      if (!v.dueDateISO || isNaN(v.pendingAmount)) continue;

      const dueDate = moment(v.dueDateISO).startOf("day");
      const date = v.date || "";
      const odDays = dueDate.diff(today, "days"); // negative if overdue
      const remarks =
        odDays < 0 ? "Overdue" : odDays === 0 ? "Today Due" : "Upcoming Dues";

      const dueOverdue =
        remarks === "Overdue" || remarks === "Today Due" ? v.pendingAmount : 0;

      data.push({
        invoiceNumber: v.invoiceNumber || "",
        date,
        dueDate: v.dueDate || "",
        invoiceAmount: parseFloat(v.invoiceAmount || 0),
        paymentReceived: parseFloat(v.invoiceAmount || 0) - parseFloat(v.pendingAmount || 0),
        pendingAmount: parseFloat(v.pendingAmount || 0),
        tds: "0.0",
        overDueDays: odDays,
        totalDueOverdue: dueOverdue,
        remarks,
      });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Breakup fetch error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};


exports.getCreditNotesForPC = async (req, res) => {
  try {
    const { code } = req.user;
    if (!code) return res.status(400).json({ success: false, message: "User code missing" });

    const vouchers = await FinanceVoucher.find({ code, voucherType: "Credit Note" }).sort({ dueDateISO: 1 });

    const today = moment().startOf("day");
    const data = [];

    for (const v of vouchers) {
      if (!v.dueDateISO || isNaN(v.pendingAmount)) continue;

      const dueDate = moment(v.dueDateISO).startOf("day");
      const date = v.date || "";
      const odDays = dueDate.diff(today, "days"); // negative if overdue
      const remarks =
        odDays < 0 ? "Overdue" : odDays === 0 ? "Today Due" : "Upcoming Dues";

      const dueOverdue =
        remarks === "Overdue" || remarks === "Today Due" ? v.pendingAmount : 0;

      data.push({
        invoiceNumber: v.invoiceNumber || "",
        date,
        dueDate: v.dueDate || "",
        invoiceAmount: parseFloat(v.invoiceAmount || 0),
        paymentReceived: parseFloat(v.invoiceAmount || 0) - parseFloat(v.pendingAmount || 0),
        pendingAmount: parseFloat(v.pendingAmount || 0),
        overDueDays: odDays,
        totalDueOverdue: dueOverdue,
        remarks,
      });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Breakup fetch error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getDebitNotesForPC = async (req, res) => {
  try {
    const { code } = req.user;
    if (!code) return res.status(400).json({ success: false, message: "User code missing" });

    const vouchers = await FinanceVoucher.find({ code, voucherType: "Debit Note" }).sort({ dueDateISO: 1 });

    const today = moment().startOf("day");
    const data = [];

    for (const v of vouchers) {
      if (!v.dueDateISO || isNaN(v.pendingAmount)) continue;

      const dueDate = moment(v.dueDateISO).startOf("day");
      const date = v.date || "";
      const odDays = dueDate.diff(today, "days"); // negative if overdue
      const remarks =
        odDays < 0 ? "Overdue" : odDays === 0 ? "Today Due" : "Upcoming Dues";

      const dueOverdue =
        remarks === "Overdue" || remarks === "Today Due" ? v.pendingAmount : 0;

      data.push({
        invoiceNumber: v.invoiceNumber || "",
        date,
        dueDate: v.dueDate || "",
        invoiceAmount: parseFloat(v.invoiceAmount || 0),
        paymentReceived: parseFloat(v.invoiceAmount || 0) - parseFloat(v.pendingAmount || 0),
        pendingAmount: parseFloat(v.pendingAmount || 0),
        overDueDays: odDays,
        totalDueOverdue: dueOverdue,
        remarks,
      });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Breakup fetch error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getInvoicesForPC = async (req, res) => {
  try {
    const { code } = req.user;
    if (!code) return res.status(400).json({ success: false, message: "User code missing" });

    const vouchers = await FinanceVoucher.find({ code, voucherType: "Invoice" }).sort({ dueDateISO: 1 });

    const today = moment().startOf("day");
    const data = [];

    for (const v of vouchers) {
      if (!v.dueDateISO || isNaN(v.pendingAmount)) continue;

      const dueDate = moment(v.dueDateISO).startOf("day");
      const date = v.date || "";
      const odDays = dueDate.diff(today, "days"); // negative if overdue
      const remarks =
        odDays < 0 ? "Overdue" : odDays === 0 ? "Today Due" : "Upcoming Dues";

      const dueOverdue =
        remarks === "Overdue" || remarks === "Today Due" ? v.pendingAmount : 0;

      data.push({
        invoiceNumber: v.invoiceNumber || "",
        date,
        dueDate: v.dueDate || "",
        invoiceAmount: parseFloat(v.invoiceAmount || 0),
        paymentReceived: parseFloat(v.invoiceAmount || 0) - parseFloat(v.pendingAmount || 0),
        pendingAmount: parseFloat(v.pendingAmount || 0),
        overDueDays: odDays,
        totalDueOverdue: dueOverdue,
        remarks,
      });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Breakup fetch error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
