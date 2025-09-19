const fs = require("fs");
const csv = require("csv-parser");
const mddWiseTarget = require("../../model/mddWiseTarget");

function cleanHeader(header) {
  return header
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_") // spaces -> underscores
    .replace(/[^a-z0-9_]/g, ""); // remove invalid chars
}

exports.uploadMddWiseTargets = async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
  
      if (!req.file.originalname.endsWith(".csv")) {
        return res.status(400).json({ error: "Invalid file type. Only CSV allowed" });
      }
  
      const results = [];
      const errors = [];
  
      fs.createReadStream(req.file.path)
        .pipe(csv({ mapHeaders: ({ header }) => cleanHeader(header) }))
        .on("data", (row) => results.push(row))
        .on("end", async () => {
          try {
            if (results.length === 0) {
              return res.status(400).json({ error: "CSV is empty" });
            }
  
            const validDocs = [];
  
            for (let i = 0; i < results.length; i++) {
              const row = results[i];
  
              const mdd_code = row.mdd_code?.trim()?.toUpperCase();
              const model_code = row.model_code?.trim()?.toUpperCase();
              const vol_tgt = row.vol_tgt ? Number(row.vol_tgt) : null;
              const month = row.month ? Number(row.month) : null;
              const year = row.year ? Number(row.year) : null;
  
              // ✅ Mandatory fields check
              if (!mdd_code || !model_code || !vol_tgt || !month || !year) {
                errors.push(`Row ${i + 1}: Missing required fields`);
                continue;
              }
  
              if (isNaN(vol_tgt) || isNaN(month) || isNaN(year)) {
                errors.push(`Row ${i + 1}: vol_tgt, month, year must be numbers`);
                continue;
              }
  
              if (month < 1 || month > 12) {
                errors.push(`Row ${i + 1}: Invalid month ${month}`);
                continue;
              }
  
              // ⚡ No duplicate check in CSV
              // ⚡ No duplicate check in DB
  
              // ✅ Prepare doc (include extra fields automatically)
              row.mdd_code = mdd_code;
              row.model_code = model_code;
              row.vol_tgt = vol_tgt;
              row.month = month;
              row.year = year;
              row.uploaded_by = req.user?.code || "UNKNOWN";
  
              validDocs.push(row);
            }
  
            if (errors.length > 0) {
              return res.status(400).json({ errors });
            }
  
            await mddWiseTarget.insertMany(validDocs);
  
            res.status(200).json({
              message: `${validDocs.length} records uploaded successfully`,
            });
          } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Error processing CSV" });
          } finally {
            fs.unlinkSync(req.file.path);
          }
        });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  };
  

  exports.getMddWiseTargets = async (req, res) => {
    try {
        console.log("GIC")
      const { month, year } = req.query;
      const code = req.user?.code;
  
      if (!code) {
        return res.status(401).json({ error: "Unauthorized: no user code" });
      }
      if (!month || !year) {
        return res.status(400).json({ error: "Month and year are required" });
      }
  
      const targets = await mddWiseTarget.find({ month: Number(month), year: Number(year) });
      res.status(200).json({ data: targets });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error fetching targets" });
    }
  };
  

