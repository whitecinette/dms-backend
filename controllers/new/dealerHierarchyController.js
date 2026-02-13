const csvParser = require("csv-parser");
const XLSX = require("xlsx");
const { Readable } = require("stream");
const DealerHierarchy = require("../../model/DealerHierarchy");


const cleanHeader = (header) =>
  header
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "");

exports.uploadDealerHierarchy = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded ",
      });
    }

    let rows = [];
    console .log("Reaching..??")
    // ==============================
    // Detect File Type
    // ==============================
    if (
      req.file.mimetype.includes("spreadsheet") ||
      req.file.originalname.endsWith(".xlsx")
    ) {
      // Excel Handling
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    } else {
      // CSV Handling
      const stream = new Readable();
      stream.push(req.file.buffer);
      stream.push(null);

      rows = await new Promise((resolve, reject) => {
        const results = [];
        stream
          .pipe(csvParser())
          .on("data", (data) => results.push(data))
          .on("end", () => resolve(results))
          .on("error", reject);
      });
    }

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: "No data found in file.",
      });
    }

    // ==============================
    // Clean Headers
    // ==============================
    const cleanedHeaders = Object.keys(rows[0]).map(cleanHeader);

    const requiredHeaders = [
      "dealer_code",
      "dealer_name",
      "dealer_category",
      "beat_code",
      "beat_name",
      "master_latitude",
      "master_longitude",
    ];

    const missing = requiredHeaders.filter(
      (h) => !cleanedHeaders.includes(h)
    );

    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: `Missing required columns: ${missing.join(", ")}`,
      });
    }

    // ==============================
    // Transform Data
    // ==============================
    const bulkOps = rows.map((row) => {
      let doc = {};

      Object.keys(row).forEach((key) => {
        const cleaned = cleanHeader(key);
        let value = row[key]?.toString().trim() || "";

        doc[cleaned] = value;
      });

      // GeoJSON location
      const lat = parseFloat(doc.master_latitude);
      const lng = parseFloat(doc.master_longitude);

      if (!isNaN(lat) && !isNaN(lng)) {
        doc.master_latitude = lat;
        doc.master_longitude = lng;

        doc.location = {
          type: "Point",
          coordinates: [lng, lat],
        };
      } else {
        // IMPORTANT: remove invalid location
        delete doc.location;
        doc.master_latitude = null;
        doc.master_longitude = null;
      }


      return {
        updateOne: {
          filter: { dealer_code: doc.dealer_code },
          update: { $set: doc },
          upsert: true,
        },
      };
    });

    // ==============================
    // Bulk Upsert
    // ==============================
    const result = await DealerHierarchy.bulkWrite(bulkOps);

    return res.status(200).json({
      success: true,
      message: "Dealer hierarchy uploaded successfully",
      matched: result.matchedCount,
      modified: result.modifiedCount,
      upserted: result.upsertedCount,
      totalProcessed: rows.length,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.downloadDealerHierarchyFormat = async (req, res) => {
  try {
    const headers = [
      "Dealer_Code",
      "Dealer_Name",
      "Dealer_Category",
      "Beat_Code",
      "Beat_Name",
      "MDD_Code",
      "MDD_Name",
      "TSE_Code",
      "TSE_Name",
      "SO_Code",
      "SO_Name",
      "SMD_Code",
      "SMD_Name",
      "ASM_Code",
      "ASM_Name",
      "ACC_ASM_Code",
      "ACC_ASM_Name",
      "ZM_Code",
      "ZM_Name",
      "ACC_ZM_Code",
      "ACC_ZM_Name",
      "SH_Code",
      "SH_Name",
      "BM_Code",
      "BM_Name",
      "ABM_Code",
      "ABM_Name",
      "ZSM_Code",
      "ZSM_Name",
      "ASE_Code",
      "ASE_Name",
      "ZSE_Code",
      "ZSE_Name",
      "RM_Code",
      "RM_Name",
      "RSM_Code",
      "RSM_Name",
      "RSO_Code",
      "RSO_Name",
      "DAM_CODE",
      "DAM_NAME",
      "SSS_CODE",
      "SSS_NAME",
      "RASM_CODE",
      "RASM_NAME",
      "Master_Latitude",
      "Master_Longitude"
    ];

    const csvContent = headers.join(",") + "\n";

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=dealer_hierarchy_format.csv"
    );

    return res.status(200).send(csvContent);
  } catch (error) {
    console.error("Download format error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


exports.getDealerHierarchy = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 50 } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { dealer_code: { $regex: search, $options: "i" } },
        { dealer_name: { $regex: search, $options: "i" } },
        { asm_code: { $regex: search, $options: "i" } },
        { tse_code: { $regex: search, $options: "i" } },
        { beat_code: { $regex: search, $options: "i" } },
      ];
    }

    const data = await DealerHierarchy.find(query)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await DealerHierarchy.countDocuments(query);

    res.status(200).json({
      success: true,
      data,
      total,
    });
  } catch (error) {
    console.error("Get DealerHierarchy error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
