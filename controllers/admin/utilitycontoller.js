const fs = require("fs");
const path = require("path");
const csvParser = require("csv-parser");
const { Parser } = require("json2csv");
const dayjs = require("dayjs");

// Utility
function getDaysLeftInMonth() {
  const today = dayjs();
  const endOfMonth = today.endOf("month");
  return endOfMonth.date() - today.date() + 1;
}

function formatSP10(spTarget, spAch, spAchPercent, spRequiredAds) {
  return `Target: ${spTarget} | Achievement: ${spAch} | Achievement %: ${spAchPercent}% | Required ADS: ${spRequiredAds}`;
}

function formatBlackBox(bbTarget, bbAch, bbAchPercent, bbRequiredAds) {
  return `Target: ${bbTarget} | Achievement: ${bbAch} | Achievement %: ${bbAchPercent}% | Required ADS: ${bbRequiredAds}`;
}

function generateRow(original, daysLeft) {
  const spTarget = Number(original["10k SP Target"] || 0);
  const spAch = Number(original["10k SP Ach"] || 0);
  const bbTarget = Number(original["Black Box Target"] || 0);
  const bbAch = Number(original["Black Box Ach"] || 0);

  const spAchPercent = spTarget ? ((spAch / spTarget) * 100).toFixed(2) : "0.00";
  const spRequiredAds = spTarget - spAch > 0 ? ((spTarget - spAch) / daysLeft).toFixed(0) : "0";

  const bbAchPercent = bbTarget ? ((bbAch / bbTarget) * 100).toFixed(1) : "0.0";
  const bbRequiredAds = bbTarget - bbAch > 0 ? ((bbTarget - bbAch) / daysLeft).toFixed(0) : "0";

  return {
    Name: original["DEALER Name"] || original["Dealer Name"],
    "Phone Number": original["Phone Number"] || "",
    "Country Code": original["Country Code"] || "91",
    Email: original["Email"] || "",
    "WhatsApp Opted": original["WhatsApp Opted"] || "TRUE",
    "User Id": original["User Id"] || "",
    City: original["City"] || "",
    Area: original["Area"] || "",
    SP10: formatSP10(spTarget, spAch, spAchPercent, spRequiredAds),
    Blackbox: formatBlackBox(bbTarget, bbAch, bbAchPercent, bbRequiredAds),
  };
}


// Controller
exports.AlphaMessages = async (req, res) => {
  const filePath = req.file.path;
  const daysLeft = getDaysLeftInMonth();
  const formattedRows = [];

  let headersValidated = false;
  let headerErrorSent = false;

  const requiredHeaders = [
    "Dealer Code",
    "Dealer Name",
    "10k SP Target",
    "10k SP Ach",
    "Black Box Target",
    "Black Box Ach",
    "Phone Number"
  ];

  fs.createReadStream(filePath)
    .pipe(csvParser())
    .on("headers", (headers) => {
      const normalizedHeaders = headers.map((h) => h.trim().toLowerCase());
      const missingHeaders = requiredHeaders.filter(
        (required) => !normalizedHeaders.includes(required.toLowerCase())
      );
    
      if (missingHeaders.length > 0) {
        headerErrorSent = true;
        res.status(400).json({
          message: `Invalid format: Missing required headers - ${missingHeaders.join(", ")}`,
        });
      } else {
        headersValidated = true;
      }
    })
    
    .on("data", (data) => {
      if (headersValidated) {
        const row = generateRow(data, daysLeft);
        formattedRows.push(row);
      }
    })
    .on("end", () => {
      if (headerErrorSent) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        return;
      }

      const outputDir = path.join(__dirname, "../../output");
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      const outputPath = path.join(outputDir, `formatted_dealers_${Date.now()}.csv`);
      const fields = [
        "Name", "Phone Number", "Country Code", "Email",
        "WhatsApp Opted", "User Id", "City", "Area", "SP10", "Blackbox"
      ];
      const json2csvParser = new Parser({ fields });
      const csv = json2csvParser.parse(formattedRows);

      fs.writeFileSync(outputPath, csv);

      res.download(outputPath, "formatted_dealer_messages.csv", (err) => {
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (cleanupErr) {
          console.error("Cleanup error:", cleanupErr);
        }

        if (err) {
          console.error("Download error:", err);
          res.status(500).send("Failed to download file.");
        }
      });
    });
};

