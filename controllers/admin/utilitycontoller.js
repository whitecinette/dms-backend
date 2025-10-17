const fs = require("fs");
const path = require("path");
const csvParser = require("csv-parser");
const { Parser } = require("json2csv");
const dayjs = require("dayjs");
const timezone = require("dayjs/plugin/timezone");
const utc = require("dayjs/plugin/utc");

dayjs.extend(utc);
dayjs.extend(timezone);

// Utility Functions
function getDaysLeftInMonth(month) {
    let today;
    try {
        today = dayjs.tz("Asia/Kolkata");
    } catch (err) {
        today = dayjs().utc();
    }
    let targetDate = today;
    if (month !== undefined) {
        targetDate = dayjs(today).month(month).startOf("month");
    }
    const endOfMonth = targetDate.endOf("month");
    return endOfMonth.diff(today, "day") + 1; // Include today
}

function getTotalDaysLeftInQ4() {
    let today;
    try {
        today = dayjs.tz("Asia/Kolkata");
    } catch (err) {
        today = dayjs().utc();
    }
    const currentMonth = today.month(); // 0-based (Oct=9, Nov=10, Dec=11)
    let totalDays = 0;
    if (currentMonth <= 11) {
        totalDays += getDaysLeftInMonth();
        if (currentMonth < 9) totalDays += dayjs().month(9).endOf("month").date(); // Oct
        if (currentMonth < 10) totalDays += dayjs().month(10).endOf("month").date(); // Nov
        if (currentMonth < 11) totalDays += dayjs().month(11).endOf("month").date(); // Dec
    }
    return Math.max(totalDays, 1);
}

function getDaysLeftForMonth(month) {
    let today;
    try {
        today = dayjs.tz("Asia/Kolkata");
    } catch (err) {
        today = dayjs().utc();
    }
    const currentMonth = today.month();
    const monthIndex = typeof month === "number" ? month : dayjs().month(month).month();

    if (monthIndex === currentMonth) {
        return getDaysLeftInMonth(monthIndex);
    }
    return 0;
}

function getCurrentPeriod() {
    let date;
    try {
        date = dayjs.tz("Asia/Kolkata");
    } catch (err) {
        date = dayjs().utc();
    }
    return {
        month: date.format("MMM"),
        year: date.format("YY"),
        fullDate: date.format("DD-MM-YYYY"),
    };
}

function formatQ4(target, ach, achPercent, requiredAds, name) {
    return `Target ${name}: ${target} | Achievement: ${ach} | Achievement %: ${achPercent}% | Required ADS: ${requiredAds}`;
}

function calculateMetrics(target, achievement, daysLeft) {
    const achPercent = target ? ((achievement / target) * 100).toFixed(2) : "0.00";
    const requiredAds = daysLeft > 0 && target > achievement ? ((target - achievement) / daysLeft).toFixed(1) : "0.0";
    return { achPercent, requiredAds };
}

function sanitizeCsvField(value) {
    if (typeof value === "string" && /^[+=@-]/.test(value)) {
        return `'${value}`;
    }
    return value;
}

function generateRow(original, currentMonth, currentDate) {
    // Validate numeric fields
    const numericFields = [
        "Oct Tgt", "Nov Tgt", "Dec Tgt", "Q4'25 Tgt",
        "Oct Ach", "Nov Ach", "Dec Ach", "Q4'25 Ach"
    ];
    const data = {};
    numericFields.forEach((field) => {
        const value = Number(original[field]);
        data[field] = isNaN(value) ? 0 : value;
    });

    // Fallback logic: auto-sum Oct–Dec if Q4 fields are missing or zero
    const q4Target = data["Q4'25 Tgt"] > 0
        ? data["Q4'25 Tgt"]
        : data["Oct Tgt"] + data["Nov Tgt"] + data["Dec Tgt"];

    const q4Ach = data["Q4'25 Ach"] > 0
        ? data["Q4'25 Ach"]
        : data["Oct Ach"] + data["Nov Ach"] + data["Dec Ach"];

    const rowData = {
        oct: {
            target: data["Oct Tgt"],
            achievement: data["Oct Ach"],
            daysLeft: getDaysLeftForMonth(9),
        },
        nov: {
            target: data["Nov Tgt"],
            achievement: data["Nov Ach"],
            daysLeft: getDaysLeftForMonth(10),
        },
        dec: {
            target: data["Dec Tgt"],
            achievement: data["Dec Ach"],
            daysLeft: getDaysLeftForMonth(11),
        },
        q4: {
            target: q4Target,
            achievement: q4Ach,
            daysLeft: getTotalDaysLeftInQ4(),
        },
    };

    // Calculate metrics
    const octMetrics = calculateMetrics(rowData.oct.target, rowData.oct.achievement, rowData.oct.daysLeft);
    const novMetrics = calculateMetrics(rowData.nov.target, rowData.nov.achievement, rowData.nov.daysLeft);
    const decMetrics = calculateMetrics(rowData.dec.target, rowData.dec.achievement, rowData.dec.daysLeft);
    const q4Metrics = calculateMetrics(rowData.q4.target, rowData.q4.achievement, rowData.q4.daysLeft);

    return {
        Name: sanitizeCsvField(original["DEALER Name"] || original["Dealer Name"] || ""),
        "Phone Number": sanitizeCsvField(original["Phone Number"] || ""),
        "Country Code": sanitizeCsvField(original["Country Code"] || "91"),
        Email: sanitizeCsvField(original["Email"] || ""),
        "WhatsApp Opted": sanitizeCsvField(original["WhatsApp Opted"] || "TRUE"),
        "User Id": sanitizeCsvField(original["User Id"] || ""),
        City: sanitizeCsvField(original["City"] || ""),
        Area: sanitizeCsvField(original["Area"] || ""),
        Oct: formatQ4(rowData.oct.target, rowData.oct.achievement, octMetrics.achPercent, octMetrics.requiredAds, "Oct"),
        Nov: formatQ4(rowData.nov.target, rowData.nov.achievement, novMetrics.achPercent, novMetrics.requiredAds, "Nov"),
        Dec: formatQ4(rowData.dec.target, rowData.dec.achievement, decMetrics.achPercent, decMetrics.requiredAds, "Dec"),
        "Q425": formatQ4(rowData.q4.target, rowData.q4.achievement, q4Metrics.achPercent, q4Metrics.requiredAds, "Q4'25"),
    };
}

// Controller
exports.AlphaMessages = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
    }

    const filePath = req.file.path;
    const formattedRows = [];
    let headersValidated = false;
    let headerErrorSent = false;

    const requiredHeaders = [
        "Dealer Code",
        "Dealer Name",
        "Phone Number",
        "Oct Tgt",
        "Nov Tgt",
        "Dec Tgt",
        "Q4'25 Tgt",
        "Oct Ach",
        "Nov Ach",
        "Dec Ach",
        "Q4'25 Ach",
    ];

    const stream = fs.createReadStream(filePath).pipe(csvParser());

    stream
        .on("headers", (headers) => {
            const normalizedHeaders = headers.map((h) => h.trim().toLowerCase());
            const missingHeaders = requiredHeaders.filter(
                (required) => !normalizedHeaders.includes(required.toLowerCase())
            );
            if (missingHeaders.length > 0) {
                console.warn("⚠️ Missing headers (will skip validation if not critical):", missingHeaders.join(", "));
            }
            headersValidated = true;
        })
        .on("data", (data) => {
            if (headersValidated) {
                const { month, fullDate } = getCurrentPeriod();
                try {
                    const row = generateRow(data, month, fullDate);
                    formattedRows.push(row);
                } catch (err) {
                    console.error("Error processing row:", err.message);
                }
            }
        })
        .on("end", () => {
            if (headerErrorSent) {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                return;
            }

            const outputDir = path.join(__dirname, "../output");
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
                "Oct",
                "Nov",
                "Dec",
                "Q425",
            ];

            try {
                const json2csvParser = new Parser({ fields });
                const csv = json2csvParser.parse(formattedRows);
                fs.writeFileSync(outputPath, csv);

                res.download(outputPath, "formatted_dealer_messages.csv", (err) => {
                    try {
                        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                    } catch (cleanupErr) {}

                    if (err) {
                        console.error("Download error:", err);
                        res.status(500).json({ message: "Failed to download file", error: err.message });
                    }
                });
            } catch (err) {
                console.error("Error generating CSV:", err);
                res.status(500).json({ message: "Failed to generate CSV", error: err.message });
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }
        })
        .on("error", (err) => {
            console.error("CSV parsing error:", err);
            res.status(500).json({ message: "Failed to process CSV file", error: err.message });
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        });
};
