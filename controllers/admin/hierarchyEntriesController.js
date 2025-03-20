const csvParser = require("csv-parser");
const { Readable } = require("stream");
const ActorCode = require('../../model/ActorCode');
const HierarchyEntries = require("../../model/HierarchyEntries");
const ActorTypesHierarchy = require("../../model/ActorTypesHierarchy");

exports.uploadHierarchyEntries = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const { hierarchy_name } = req.body;
    if (!hierarchy_name) {
      return res.status(400).json({ success: false, message: "Hierarchy name is required" });
    }

    // 🔥 1️⃣ Check if hierarchy_name exists in `actortypeshierarchy`
    const hierarchyConfig = await ActorTypesHierarchy.findOne({ name: hierarchy_name });
    if (!hierarchyConfig) {
      return res.status(400).json({ success: false, message: `Hierarchy '${hierarchy_name}' does not exist.` });
    }

    const hierarchyRoles = hierarchyConfig.hierarchy.map(role => role.toLowerCase()); // Keep field names lowercase

    let results = [];
    const stream = new Readable();
    stream.push(req.file.buffer);
    stream.push(null);

    let isFirstRow = true;

    stream
      .pipe(csvParser())
      .on("data", (row) => {
        if (isFirstRow) {
          const csvHeaders = Object.keys(row).map(h => h.trim().toLowerCase());
          if (JSON.stringify(csvHeaders) !== JSON.stringify(hierarchyRoles)) {
            return res.status(400).json({ 
              success: false, 
              message: "CSV headers do not match the expected hierarchy.",
              expectedHeaders: hierarchyRoles,
              receivedHeaders: csvHeaders
            });
          }
          isFirstRow = false;
        }

        let hierarchyEntry = { hierarchy_name };
        hierarchyRoles.forEach((role, index) => {
          hierarchyEntry[role] = row[Object.keys(row)[index]].trim().toUpperCase();
        });

        results.push(hierarchyEntry);
      })
      .on("end", async () => {
        try {
          if (results.length === 0) {
            return res.status(400).json({ success: false, message: "No valid data found in CSV." });
          }

          // 🔥 3️⃣ Validate Actor Codes Before Insertion
          const allCodes = results.flatMap(entry => Object.values(entry).slice(1)); // Exclude hierarchy_name
          const existingCodes = await ActorCode.find({ code: { $in: allCodes } }).select("code");

          const existingCodesSet = new Set(existingCodes.map(c => c.code));
          const invalidCodes = allCodes.filter(code => !existingCodesSet.has(code));

          if (invalidCodes.length > 0) {
            return res.status(400).json({ success: false, message: "Invalid actor codes found", invalidCodes });
          }

          console.log("Valid Entries Before Insert:", results);

          // 🔥 4️⃣ Attempt to Insert Data
          try {
            const insertedDocs = await HierarchyEntries.insertMany(results, { ordered: false });
            console.log("Inserted Successfully:", insertedDocs.length);
            return res.status(201).json({ success: true, message: "Hierarchy entries uploaded successfully", totalEntries: insertedDocs.length });
          } catch (insertErr) {
            console.error("Error inserting with insertMany:", insertErr);

            // 🔥 5️⃣ Fallback: Use `updateOne()` for upserts if insertMany fails
            let insertedCount = 0;
            for (let entry of results) {
              try {
                const query = hierarchyRoles.reduce((acc, role) => {
                  acc[role] = entry[role];
                  return acc;
                }, {});

                const result = await HierarchyEntries.updateOne(
                  query, 
                  { $set: entry }, 
                  { upsert: true }
                );
                
                if (result.upsertedCount || result.modifiedCount) insertedCount++;
              } catch (updateErr) {
                console.error("Failed to upsert entry:", entry, updateErr);
              }
            }

            return res.status(201).json({ success: true, message: "Hierarchy entries uploaded with upserts", totalEntries: insertedCount });
          }
        } catch (error) {
          console.error("Error processing hierarchy entries:", error);
          res.status(500).json({ success: false, message: "Internal server error" });
        }
      });

  } catch (error) {
    console.error("Error in uploadHierarchyEntries:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

//get hierarch Entries for admin
exports.getHierarchEntriesForAdmin = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      hierarchy_name = "",
    } = req.query;
    const filters = {};
    if (hierarchy_name) {
      filters.$or = [{ hierarchy_name: { $regex: hierarchy_name, $options: "i" } }];
    }
    const actorTypesHierarchy = await HierarchyEntries.find(filters)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const totalRecords = await HierarchyEntries.countDocuments(filters);
    res.status(200).json({
      message: "All users fetched successfully",
      data: actorTypesHierarchy,
      currentPage: page,
      totalRecords,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Edit Hierarchy Entries by Admin
exports.editHierarchEntriesByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const update = req.body;

    if (!id) {
      return res.status(400).json({ message: "Id is required" });
    }

    const updatedData = await HierarchyEntries.findByIdAndUpdate(id, update, { new: true });

    if (!updatedData) {
      return res.status(404).json({ message: "Data not found" });
    }

    return res.status(200).json({
      message: "Successfully Updated Data",
      data: updatedData
    });

  } catch (error) {
    console.error("Error updating Hierarchy Entries:", error);
    return res.status(500).json({ message: "Internal server Error" });
  }
};

// Delete Hierarchy Entries by Admin
exports.deleteHierarchEntriesByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: "Id is required" });
    }

    const deletedData = await HierarchyEntries.findByIdAndDelete(id);

    if (!deletedData) {
      return res.status(404).json({ message: "Data not found" });
    } 

    return res.status(200).json({ 
      message: "Successfully Deleted Data",
      data: deletedData
    });
  } catch (error) {
    console.error("Error deleting Hierarchy Entries:", error);
    return res.status(500).json({ message: "Internal server Error" });
  }
};

// add hierarchy entries by admin
exports.addHierarchEntriesByAdmin = async (req, res) => {
  try {
    const { hierarchy_name } = req.body;
    if (!hierarchy_name) {
      return res.status(400).json({ message: "Hierarchy name is required" });
    }

    const newHierarchyEntry = new HierarchyEntries(req.body);
    await newHierarchyEntry.save();

    return res.status(201).json({
      message: "Successfully Added Hierarchy Entries",
      data: newHierarchyEntry
    });
  } catch (error) {
    console.error("Error adding Hierarchy Entries:", error);
    return res.status(500).json({ message: "Internal server Error" });
  }
};  
