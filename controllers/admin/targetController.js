const Entity = require("../../model/Entity");
const Target = require("../../model/Target");
const fs = require("fs");
const csvParser = require("csv-parser");
const { Readable } = require("stream");



exports.uploadTotalSegmentChannelTargetsThroughCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    // Fetch segments and channels dynamically
    const segmentsEntity = await Entity.findOne({ name: "segments" });
    const channelsEntity = await Entity.findOne({ name: "channels" });

    if (!segmentsEntity || !channelsEntity) {
      return res.status(400).json({ success: false, message: "Segments or Channels not found in the database" });
    }

    const segments = segmentsEntity.value || [];
    const channels = channelsEntity.value || [];

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

        let targetEntry = {};
        cleanedHeaders.forEach((header, index) => {
          const originalKey = Object.keys(row)[index];
          targetEntry[header] = row[originalKey].trim();
        });

        const entity = targetEntry.entity;
        const status = "active"; // Always active
        const expiry = new Date("2025-03-31T23:59:59.999Z");

        // Build dynamic value structure
        const value = {
          val: {
            total: parseFloat(targetEntry.total_value) || 0,
            segment: {},
            channel: {}
          },
          vol: {
            total: parseFloat(targetEntry.total_volume) || 0,
            segment: {},
            channel: {}
          }
        };

        // Populate segment values dynamically
        segments.forEach(segment => {
            value.val.segment[segment] = parseFloat(targetEntry[`seg_${segment}_val`] || 0);
            value.vol.segment[segment] = parseFloat(targetEntry[`seg_${segment}_vol`] || 0);
        });
        
        // Populate channel values dynamically
        channels.forEach(channel => {
            value.val.channel[channel] = parseFloat(targetEntry[`${channel}_val`] || 0);
            value.vol.channel[channel] = parseFloat(targetEntry[`${channel}_vol`] || 0);
            console.log("Channel: ", channel)
        });
        
        
        

        results.push({ entity, value, expiry, status });
      })
      .on("end", async () => {
        try {
          if (results.length === 0) {
            return res.status(400).json({ success: false, message: "No valid data found in CSV." });
          }

          // Insert all targets without checking for existing ones
          await Target.insertMany(results, { ordered: false });

          return res.status(201).json({ 
            success: true, 
            message: "Targets uploaded successfully", 
            totalEntries: results.length 
          });
        } catch (error) {
          console.error("Error processing target entries:", error);
          res.status(500).json({ success: false, message: "Internal server error" });
        }
      });
  } catch (error) {
    console.error("Error in uploadTotalSegmentChannelTargetsThroughCSV:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Helper function to clean headers
const cleanHeader = (header) => {
  return header;
};

