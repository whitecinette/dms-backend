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

//get sales data to the admin
exports.getSalesDataToAdmin = async (req, res) => {
  try {
    const { startDate, endDate, search, salesType, page = 1, limit = 50 } = req.query;

    const query = {};

    // Handle date range filter
    if (startDate || endDate) {
      query.date = {};  // Changed from createdAt to date
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.date.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    // Handle search filter
    if (search) {
      query.$or = [{ product_code: { $regex: search, $options: "i" } }];
    }

    // Handle salesType filter
    if (salesType) {
      query.sales_type = salesType;
    }


    // Fetch paginated data
    const data = await SalesData.find(query)
      .sort({date: -1})
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));
      

    // Count total matching documents
    const totalRecords = await SalesData.countDocuments(query);

    // Calculate total pages
    const totalPages = Math.ceil(totalRecords / limit);

    // Send response
    res.status(200).json({
      success: true,
      message: "Successfully retrieved all records",
      data,
      totalRecords,
      totalPages,
    });
  } catch (err) {
    console.error("Error getting sales records:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};