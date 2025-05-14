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

function formatSP10(
  spTarget,
  spAch,
  spAchPercent,
  spRequiredAds,
  currentMonth
) {
  return `Target ${currentMonth}: ${spTarget} | Achievement: ${spAch} | Achievement %: ${spAchPercent}% | Required ADS: ${spRequiredAds}`;
}

function formatBlackBox(
  bbTarget,
  bbAch,
  bbAchPercent,
  bbRequiredAds,
  currentMonth
) {
  return `Target ${currentMonth}: ${bbTarget} | Achievement: ${bbAch} | Achievement %: ${bbAchPercent}% | Required ADS: ${bbRequiredAds}`;
}
function formatSP10Q(
  spTarget,
  spAch,
  spAchPercent,
  spRequiredAds,
  currentMonth
) {
  return `Target Q2'25: ${spTarget} | Achievement: ${spAch} | Achievement %: ${spAchPercent}% | Required ADS: ${spRequiredAds}`;
}

function formatBlackBoxQ(
  bbTarget,
  bbAch,
  bbAchPercent,
  bbRequiredAds,
  currentMonth
) {
  return `Target Q2'25: ${bbTarget} | Achievement: ${bbAch} | Achievement %: ${bbAchPercent}% | Required ADS: ${bbRequiredAds}`;
}

function CalculateSP10(spTarget, spAch, daysLeft) {
  const spAchPercent = spTarget
    ? ((spAch / spTarget) * 100).toFixed(2)
    : "0.00";
  const spRequiredAds =
    spTarget - spAch > 0 ? ((spTarget - spAch) / daysLeft).toFixed(1) : "0.0";
  return {
    spAchPercent,
    spRequiredAds,
  };
}

function CalculateBlackBox(bbTarget, bbAch, daysLeft) {
  const bbAchPercent = bbTarget ? ((bbAch / bbTarget) * 100).toFixed(1) : "0.0";
  const bbRequiredAds =
    bbTarget - bbAch > 0 ? ((bbTarget - bbAch) / daysLeft).toFixed(1) : "0.0";
  return {
    bbAchPercent,
    bbRequiredAds,
  };
}

function generateRow(original, daysLeft, currentMonth, currentDate) {
  const spTargetMay = Number(original["10k SP Tgt May 25"] || 0);
  const spAchMay = Number(original["10k SP Ach May 25"] || 0);
  const bbTargetMay = Number(original["Black Box Tgt May 25"] || 0);
  const bbAchMay = Number(original["Black Box Ach May 25"] || 0);
  const spTargetQ2 = Number(original["10k SP Tgt Q2 25"] || 0);
  const spAchQ2 = Number(original["10k SP Ach Q2 25"] || 0);
  const bbTargetQ2 = Number(original["Black Box Tgt Q2 25"] || 0);
  const bbAchQ2 = Number(original["Black Box Ach Q2 25"] || 0);

  // Calculate percentages and required ADS for May
  const { spAchPercent: spAchPercentMay, spRequiredAds: spRequiredAdsMay } =
    CalculateSP10(spTargetMay, spAchMay, daysLeft);
  const { bbAchPercent: bbAchPercentMay, bbRequiredAds: bbRequiredAdsMay } =
    CalculateBlackBox(bbTargetMay, bbAchMay, daysLeft);

  const { spAchPercent: spAchPercentQ2, spRequiredAds: spRequiredAdsQ2 } =
    CalculateSP10(spTargetQ2, spAchQ2, daysLeft);
  const { bbAchPercent: bbAchPercentQ2, bbRequiredAds: bbRequiredAdsQ2 } =
    CalculateBlackBox(bbTargetQ2, bbAchQ2, daysLeft);

  return {
    Name: original["DEALER Name"] || original["Dealer Name"] || "",
    "Phone Number": original["Phone Number"] || "",
    "Country Code": original["Country Code"] || "91",
    Email: original["Email"] || "",
    "WhatsApp Opted": original["WhatsApp Opted"] || "TRUE",
    "User Id": original["User Id"] || "",
    City: original["City"] || "",
    Area: original["Area"] || "",
    "SP10 May 25": formatSP10(
      spTargetMay,
      spAchMay,
      spAchPercentMay,
      spRequiredAdsMay,
      currentMonth
    ),
    "Blackbox May 25": formatBlackBox(
      bbTargetMay,
      bbAchMay,
      bbAchPercentMay,
      bbRequiredAdsMay,
      currentMonth
    ),
    "SP10 Q2 25": formatSP10Q(
      spTargetQ2,
      spAchQ2,
      spAchPercentQ2,
      spRequiredAdsQ2,
      currentMonth
    ),
    "Blackbox Q2 25": formatBlackBoxQ(
      bbTargetQ2,
      bbAchQ2,
      bbAchPercentQ2,
      bbRequiredAdsQ2,
      currentMonth
    ),
  };
}

// Controller
exports.AlphaMessages = async (req, res) => {
  const filePath = req.file.path;
  const daysLeft = getDaysLeftInMonth();
  const formattedRows = [];

  const currentMonth = dayjs().format("MMM'YY"); // Example: May'25
  const currentDate = dayjs().format("DD-MM-YYYY");

  let headersValidated = false;
  let headerErrorSent = false;

  const requiredHeaders = [
    "Dealer Code",
    "Dealer Name",
    "Phone Number",
    "10k SP Tgt May 25",
    "10k SP Ach May 25",
    "Black Box Tgt May 25",
    "Black Box Ach May 25",
    "10k SP Tgt Q2 25",
    "10k SP Ach Q2 25",
    "Black Box Tgt Q2 25",
    "Black Box Ach Q2 25",
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
          message: `Invalid format: Missing required headers - ${missingHeaders.join(
            ", "
          )}`,
        });
      } else {
        headersValidated = true;
      }
    })
    .on("data", (data) => {
      if (headersValidated) {
        const row = generateRow(data, daysLeft, currentMonth, currentDate);
        formattedRows.push(row);
      }
    })
    .on("end", () => {
      if (headerErrorSent) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        return;
      }

      const outputDir = path.join(__dirname, "../../output");
      if (!fs.existsSync(outputDir))
        fs.mkdirSync(outputDir, { recursive: true });

      const outputPath = path.join(
        outputDir,
        `formatted_dealers_${Date.now()}.csv`
      );
      const fields = [
        "Name",
        "Phone Number",
        "Country Code",
        "Email",
        "WhatsApp Opted",
        "User Id",
        "City",
        "Area", // Added to fields
        "SP10 May 25",
        "Blackbox May 25",
        "SP10 Q2 25",
        "Blackbox Q2 25",
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
    })
    .on("error", (err) => {
      console.error("CSV parsing error:", err);
      res.status(500).send("Failed to process CSV file.");
    });
};
