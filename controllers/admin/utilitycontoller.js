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
        // console.warn("Timezone 'Asia/Kolkata' not supported, using UTC:", err.message);
        today = dayjs().utc();
    }
    let targetDate = today;
    if (month !== undefined) {
        targetDate = dayjs(today).month(month).startOf("month");
    }
    const endOfMonth = targetDate.endOf("month");
    return endOfMonth.diff(today, "day") + 1; // Include today
}

function getTotalDaysLeftInQ3() {
    let today;
    try {
        today = dayjs.tz("Asia/Kolkata");
    } catch (err) {
        console.warn("Timezone 'Asia/Kolkata' not supported, using UTC:", err.message);
        today = dayjs().utc();
    }
    const currentMonth = today.month(); // 0-based (June=5, July=6, August=7, September=8)

    let totalDays = 0;
    if (currentMonth <= 8) {
        totalDays += getDaysLeftInMonth();
        if (currentMonth < 6) totalDays += dayjs().month(6).endOf("month").date(); // July
        if (currentMonth < 7) totalDays += dayjs().month(7).endOf("month").date(); // August
        if (currentMonth < 8) totalDays += dayjs().month(8).endOf("month").date(); // September
    }
    return Math.max(totalDays, 1); // Avoid division by zero
}

function getDaysLeftForMonth(month) {
    let today;
    try {
        today = dayjs.tz("Asia/Kolkata");
    } catch (err) {
        // console.warn("Timezone 'Asia/Kolkata' not supported, using UTC:", err.message);
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
        // console.warn("Timezone 'Asia/Kolkata' not supported, falling back to UTC:", err.message);
        date = dayjs().utc();
    }
    return {
        month: date.format("MMM"),
        year: date.format("YY"),
        fullDate: date.format("DD-MM-YYYY"),
    };
}

function formatQ3(q3Target, q3Ach, q3AchPercent, q3RequiredAds) {
    return `Target Q3'25: ${q3Target} | Achievement: ${q3Ach} | Achievement %: ${q3AchPercent}% | Required ADS: ${q3RequiredAds}`;
}

function calculateMetrics(target, achievement, daysLeft) {
    const achPercent = target ? ((achievement / target) * 100).toFixed(2) : "0.00";
    const requiredAds = daysLeft > 0 && target > achievement ? ((target - achievement) / daysLeft).toFixed(1) : "0.0";
    return { achPercent, requiredAds };
}

function sanitizeCsvField(value) {
    if (typeof value === "string" && /^[+=@-]/.test(value)) {
        return `'${value}`; // Escape CSV injection
    }
    return value;
}

function generateRow(original, currentMonth, currentDate) {
    // Validate numeric fields
    const numericFields = ["Jul Tgt", "Aug Tgt", "Sep Tgt", "Q3'25 Tgt", "Jul Ach", "Aug Ach", "Sep Ach", "Q3'25 Ach"];
    const data = {};
    numericFields.forEach((field) => {
        const value = Number(original[field]);
        data[field] = isNaN(value) ? 0 : value;
    });

    const rowData = {
        jul: {
            target: data["Jul Tgt"],
            achievement: data["Jul Ach"],
            daysLeft: getDaysLeftForMonth(6),
        },
        aug: {
            target: data["Aug Tgt"],
            achievement: data["Aug Ach"],
            daysLeft: getDaysLeftForMonth(7),
        },
        sep: {
            target: data["Sep Tgt"],
            achievement: data["Sep Ach"],
            daysLeft: getDaysLeftForMonth(8),
        },
        q3: {
            target: data["Q3'25 Tgt"],
            achievement: data["Q3'25 Ach"],
            daysLeft: getTotalDaysLeftInQ3(),
        },
    };

    // Calculate metrics
    const julMetrics = calculateMetrics(rowData.jul.target, rowData.jul.achievement, rowData.jul.daysLeft);
    const augMetrics = calculateMetrics(rowData.aug.target, rowData.aug.achievement, rowData.aug.daysLeft);
    const sepMetrics = calculateMetrics(rowData.sep.target, rowData.sep.achievement, rowData.sep.daysLeft);
    const q3Metrics = calculateMetrics(rowData.q3.target, rowData.q3.achievement, rowData.q3.daysLeft);

    // Return formatted row
    return {
        Name: sanitizeCsvField(original["DEALER Name"] || original["Dealer Name"] || ""),
        "Phone Number": sanitizeCsvField(original["Phone Number"] || ""),
        "Country Code": sanitizeCsvField(original["Country Code"] || "91"),
        Email: sanitizeCsvField(original["Email"] || ""),
        "WhatsApp Opted": sanitizeCsvField(original["WhatsApp Opted"] || "TRUE"),
        "User Id": sanitizeCsvField(original["User Id"] || ""),
        City: sanitizeCsvField(original["City"] || ""),
        Area: sanitizeCsvField(original["Area"] || ""),
        Jul: formatQ3(rowData.jul.target, rowData.jul.achievement, julMetrics.achPercent, julMetrics.requiredAds),
        Aug: formatQ3(rowData.aug.target, rowData.aug.achievement, augMetrics.achPercent, augMetrics.requiredAds),
        Sep: formatQ3(rowData.sep.target, rowData.sep.achievement, sepMetrics.achPercent, sepMetrics.requiredAds),
        "Q325": formatQ3(rowData.q3.target, rowData.q3.achievement, q3Metrics.achPercent, q3Metrics.requiredAds),
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
        "Jul Tgt",
        "Aug Tgt",
        "Sep Tgt",
        "Q3'25 Tgt",
        "Jul Ach",
        "Aug Ach",
        "Sep Ach",
        "Q3'25 Ach",
    ];

    const stream = fs.createReadStream(filePath).pipe(csvParser());

    stream
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
                stream.destroy();
            } else {
                headersValidated = true;
                // console.log("Headers validated successfully:", headers);
            }
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
                "Jul",
                "Aug",
                "Sep",
                "Q325",
            ];
            try {
                const json2csvParser = new Parser({ fields });
                const csv = json2csvParser.parse(formattedRows);
                fs.writeFileSync(outputPath, csv);
                // console.log("Output CSV written to:", outputPath);

                res.download(outputPath, "formatted_dealer_messages.csv", (err) => {
                    try {
                        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                    } catch (cleanupErr) {
                        // console.error("Cleanup error:", cleanupErr);
                    }

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