const csvParser = require("csv-parser");
const { Readable } = require("stream");
const SalesData = require("../../model/SalesData");

exports.uploadSalesDataThroughCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    let results = [];
    const stream = new Readable();
    stream.push(req.file.buffer);
    stream.push(null);

    let isFirstRow = true;
    let cleanedHeaders = [];

    stream
      .pipe(csvParser())
      .on("data", (row) => {
        if (isFirstRow) {
          cleanedHeaders = Object.keys(row).map(cleanHeader);
          console.log("Headers: ", cleanedHeaders);
          isFirstRow = false;
        }

        let salesEntry = {};

        cleanedHeaders.forEach((header, index) => {
          const originalKey = Object.keys(row)[index];
          let value = row[originalKey].trim();

          // Convert numeric fields if applicable
          if (["quantity", "month", "year"].includes(header)) {
            value = parseInt(value) || 0;
          } else if (header === "date") {
            value = new Date(value);
          }

          salesEntry[header] = value;
        });

        results.push(salesEntry);
      })
      .on("end", async () => {
        try {
          if (results.length === 0) {
            return res.status(400).json({ success: false, message: "No valid data found in CSV." });
          }

          // Bulk insert sales data
          await SalesData.insertMany(results, { ordered: false });

          return res.status(201).json({ 
            success: true, 
            message: "Sales data uploaded successfully", 
            totalEntries: results.length 
          });
        } catch (error) {
          console.error("Error inserting sales data:", error);
          res.status(500).json({ success: false, message: "Internal server error" });
        }
      });
  } catch (error) {
    console.error("Error in uploadSalesDataThroughCSV:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Utility function to clean headers
const cleanHeader = (header) => {
  return header.trim().toLowerCase().replace(/\s+/g, "_");
};
