const fs = require("fs");
const path = require("path");
const csvParser = require("csv-parser");
const { Parser } = require("json2csv");
const dayjs = require("dayjs");

// Utility
function getDaysLeftInMonth() {
  const today = dayjs().subtract(1, 'day');
  const endOfMonth = today.endOf("month");
  return endOfMonth.date() - today.date() + 1;
}

function getCurrentPeriod() {
  const date = dayjs().subtract(1, 'day');
  return {
    month: date.format('MMM'),
    year: date.format('YY'),
    fullDate: date.format('DD-MM-YYYY')
  };
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
  const { month, year } = getCurrentPeriod();

  // Get values directly from column names
  const data = {
    sp: {
      current: {
        target: Number(original[`10k SP Tgt ${currentMonth} ${year}`] || 0),
        achievement: Number(original[`10k SP Ach ${currentMonth} ${year}`] || 0)
      },
      q2: {
        target: Number(original[`10k SP Tgt Q2 ${year}`] || 0),
        achievement: Number(original[`10k SP Ach Q2 ${year}`] || 0)
      }
    },
    bb: {
      current: {
        target: Number(original[`Black Box Tgt ${currentMonth} ${year}`] || 0),
        achievement: Number(original[`Black Box Ach ${currentMonth} ${year}`] || 0)
      },
      q2: {
        target: Number(original[`Black Box Tgt Q2 ${year}`] || 0),
        achievement: Number(original[`Black Box Ach Q2 ${year}`] || 0)
      }
    }
  };

  // Calculate metrics
  const metrics = {
    current: {
      sp: CalculateSP10(data.sp.current.target, data.sp.current.achievement, daysLeft),
      bb: CalculateBlackBox(data.bb.current.target, data.bb.current.achievement, daysLeft)
    },
    q2: {
      sp: CalculateSP10(data.sp.q2.target, data.sp.q2.achievement, daysLeft),
      bb: CalculateBlackBox(data.bb.q2.target, data.bb.q2.achievement, daysLeft)
    }
  };

  // Return formatted data
  return {
    Name: original["DEALER Name"] || original["Dealer Name"] || "",
    "Phone Number": original["Phone Number"] || "",
    "Country Code": original["Country Code"] || "91",
    Email: original["Email"] || "",
    "WhatsApp Opted": original["WhatsApp Opted"] || "TRUE",
    "User Id": original["User Id"] || "",
    City: original["City"] || "",
    Area: original["Area"] || "",
    [`SP10 ${currentMonth} ${year}`]: formatSP10(
      data.sp.current.target,
      data.sp.current.achievement,
      metrics.current.sp.spAchPercent,
      metrics.current.sp.spRequiredAds,
      currentMonth
    ),
    [`Blackbox ${currentMonth} ${year}`]: formatBlackBox(
      data.bb.current.target,
      data.bb.current.achievement,
      metrics.current.bb.bbAchPercent,
      metrics.current.bb.bbRequiredAds,
      currentMonth
    ),
    [`SP10 Q2 ${year}`]: formatSP10Q(
      data.sp.q2.target,
      data.sp.q2.achievement,
      metrics.q2.sp.spAchPercent,
      metrics.q2.sp.spRequiredAds
    ),
    [`Blackbox Q2 ${year}`]: formatBlackBoxQ(
      data.bb.q2.target,
      data.bb.q2.achievement,
      metrics.q2.bb.bbAchPercent,
      metrics.q2.bb.bbRequiredAds
    )
  };
}

// Controller
exports.AlphaMessages = async (req, res) => {
  const filePath = req.file.path;
  const daysLeft = getDaysLeftInMonth();
  const formattedRows = [];

  const currentMonth = dayjs().subtract(1).format("MMM"); // Get current month
  const currentYear = dayjs().subtract(1).format("YY"); // Get current year
  const currentDate = dayjs().subtract(1).format("DD-MM-YYYY");

  let headersValidated = false;
  let headerErrorSent = false;

  const requiredHeaders = [
    "Dealer Code",
    "Dealer Name",
    "Phone Number",
    `10k SP Tgt ${currentMonth} ${currentYear}`,
    `10k SP Ach ${currentMonth} ${currentYear}`,
    `Black Box Tgt ${currentMonth} ${currentYear}`,
    `Black Box Ach ${currentMonth} ${currentYear}`,
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
        `SP10 ${currentMonth} ${currentYear}`,
        `Blackbox ${currentMonth} ${currentYear}`,
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
