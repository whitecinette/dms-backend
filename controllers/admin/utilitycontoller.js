const fs = require("fs");
const path = require("path");
const csvParser = require("csv-parser");
const { Parser } = require("json2csv");
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

// Utility functions
function getDaysLeftInMonth(inputDate) {
  const IST_TIMEZONE = "Asia/Kolkata";
  let today = inputDate
    ? dayjs.tz(inputDate, IST_TIMEZONE)
    : dayjs().tz(IST_TIMEZONE);

  if (today.date() === 1) {
    today = today.subtract(1, "month").endOf("month");
  }

  const endOfMonth = today.endOf("month");
  return endOfMonth.date() - today.date() + 1;
}

function getCurrentPeriod() {
  const date = dayjs().tz("Asia/Kolkata");
  return {
    month: date.format("MMM"),
    year: date.format("YY"),
    fullDate: date.format("DD-MM-YYYY"),
  };
}

function formatSP10(spTarget, spAch, spAchPercent, spRequiredAds, currentMonth) {
  return `Target J  un: ${spTarget} | Achievement: ${spAch} | Achievement %: ${spAchPercent}% | Required ADS: ${spRequiredAds}`;
}

function formatBlackBox(bbTarget, bbAch, bbAchPercent, bbRequiredAds, currentMonth) {
  return `Target J  un: ${bbTarget} | Achievement: ${bbAch} | Achievement %: ${bbAchPercent}% | Required ADS: ${bbRequiredAds}`;
}

function formatSP10Q(spTarget, spAch, spAchPercent, spRequiredAds) {
  return `Target Q2'25: ${spTarget} | Achievement: ${spAch} | Achievement %: ${spAchPercent}% | Required ADS: ${spRequiredAds}`;
}

function formatBlackBoxQ(bbTarget, bbAch, bbAchPercent, bbRequiredAds) {
  return `Target Q2'25: ${bbTarget} | Achievement: ${bbAch} | Achievement %: ${bbAchPercent}% | Required ADS: ${bbRequiredAds}`;
}

function CalculateSP10(spTarget, spAch, daysLeft) {
  const spAchPercent = spTarget ? ((spAch / spTarget) * 100).toFixed(2) : "0.00";
  const spRequiredAds = spTarget - spAch > 0 ? ((spTarget - spAch) / daysLeft).toFixed(1) : "0.0";
  return { spAchPercent, spRequiredAds };
}

function CalculateBlackBox(bbTarget, bbAch, daysLeft) {
  const bbAchPercent = bbTarget ? ((bbAch / bbTarget) * 100).toFixed(1) : "0.0";
  const bbRequiredAds = bbTarget - bbAch > 0 ? ((bbTarget - bbAch) / daysLeft).toFixed(1) : "0.0";
  return { bbAchPercent, bbRequiredAds };
}

function generateRow(original, daysLeft, currentMonth, currentYear) {
  const data = {
    sp: {
      current: {
        target: Number(original[`10k SP Tgt J un ${currentYear}`] || 0),
        achievement: Number(original[`10k SP Ach J  un ${currentYear}`] || 0),
      },
      q2: {
        target: Number(original[`10k SP Tgt Q2 ${currentYear}`] || 0),
        achievement: Number(original[`10k SP Ach Q2 ${currentYear}`] || 0),
      },
    },
    bb: {
      current: {
        target: Number(original[`Black Box Tgt J  un ${currentYear}`] || 0),
        achievement: Number(original[`Black Box Ach J un ${currentYear}`] || 0),
      },
      q2: {
        target: Number(original[`Black Box Tgt Q2 ${currentYear}`] || 0),
        achievement: Number(original[`Black Box Ach Q2 ${currentYear}`] || 0),
      },
    },
  };

  const metrics = {
    current: {
      sp: CalculateSP10(data.sp.current.target, data.sp.current.achievement, daysLeft),
      bb: CalculateBlackBox(data.bb.current.target, data.bb.current.achievement, daysLeft),
    },
    q2: {
      sp: CalculateSP10(data.sp.q2.target, data.sp.q2.achievement, daysLeft),
      bb: CalculateBlackBox(data.bb.q2.target, data.bb.q2.achievement, daysLeft),
    },
  };

  return {
    Name: original["DEALER Name"] || original["Dealer Name"] || "",
    "Phone Number": original["Phone Number"] || "",
    "Country Code": original["Country Code"] || "91",
    Email: original["Email"] || "",
    "WhatsApp Opted": original["WhatsApp Opted"] || "TRUE",
    "User Id": original["User Id"] || "",
    City: original["City"] || "",
    Area: original["Area"] || "",
    [`SP10 J  un ${currentYear}`]: formatSP10(
      data.sp.current.target,
      data.sp.current.achievement,
      metrics.current.sp.spAchPercent,
      metrics.current.sp.spRequiredAds,
      currentMonth
    ),
    [`Blackbox J  un ${currentYear}`]: formatBlackBox(
      data.bb.current.target,
      data.bb.current.achievement,
      metrics.current.bb.bbAchPercent,
      metrics.current.bb.bbRequiredAds,
      currentMonth
    ),
    [`SP10 Q2 ${currentYear}`]: formatSP10Q(
      data.sp.q2.target,
      data.sp.q2.achievement,
      metrics.q2.sp.spAchPercent,
      metrics.q2.sp.spRequiredAds
    ),
    [`Blackbox Q2 ${currentYear}`]: formatBlackBoxQ(
      data.bb.q2.target,
      data.bb.q2.achievement,
      metrics.q2.bb.bbAchPercent,
      metrics.q2.bb.bbRequiredAds
    ),
  };
}

// Controller
exports.AlphaMessages = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const filePath = req.file.path;
  const daysLeft = getDaysLeftInMonth();
  const { month: currentMonth, year: currentYear } = getCurrentPeriod();
  const formattedRows = [];

  let headersValidated = false;
  let headerErrorSent = false;

  const requiredHeaders = [
    "Dealer Code",
    "Dealer Name",
    "Phone Number",
    `10k SP Tgt J un ${currentYear}`,
    `10k SP Ach J un ${currentYear}`,
    `Black Box Tgt J  un ${currentYear}`,
    `Black Box Ach J  un ${currentYear}`,
    `10k SP Tgt Q2 ${currentYear}`,
    `10k SP Ach Q2 ${currentYear}`,
    `Black Box Tgt Q2 ${currentYear}`,
    `Black Box Ach Q2 ${currentYear}`,
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
        const row = generateRow(data, daysLeft, currentMonth, currentYear);
        formattedRows.push(row);
      }
    })
    .on("end", () => {
      if (headerErrorSent) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        return;
      }

      const outputDir = path.join(__dirname, "../../output");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const outputPath = path.join(outputDir, `formatted_dealers_${Date.now()}.csv`);
      const fields = [
        "Name",
        "Phone Number",
        "Country Code",
        "Email",
        "WhatsApp Opted",
        "User Id",
        "City",
        "Area",
        `SP10 J un ${currentYear}`,
        `Blackbox J un ${currentYear}`,
        `SP10 Q2 ${currentYear}`,
        `Blackbox Q2 ${currentYear}`,
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