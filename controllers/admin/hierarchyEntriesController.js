const csvParser = require("csv-parser");
const { Readable } = require("stream");
const ActorCode = require('../../model/ActorCode');
const HierarchyEntries = require("../../model/HierarchyEntries");
const ActorTypesHierarchy = require("../../model/ActorTypesHierarchy");

// exports.uploadHierarchyEntries = async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ success: false, message: "No file uploaded" });
//     }

//     const { hierarchy_name } = req.body;
//     if (!hierarchy_name) {
//       return res.status(400).json({ success: false, message: "Hierarchy name is required" });
//     }

//     // 🔥 1️⃣ Check if hierarchy_name exists in `actortypeshierarchy`
//     const hierarchyConfig = await ActorTypesHierarchy.findOne({ name: hierarchy_name });
//     if (!hierarchyConfig) {
//       return res.status(400).json({ success: false, message: `Hierarchy '${hierarchy_name}' does not exist.` });
//     }

//     const hierarchyRoles = hierarchyConfig.hierarchy.map(role => role.toLowerCase()); // Keep field names lowercase

//     let results = [];
//     const stream = new Readable();
//     stream.push(req.file.buffer);
//     stream.push(null);

//     let isFirstRow = true;

//     stream
//       .pipe(csvParser())
//       .on("data", (row) => {
//         if (isFirstRow) {
//           const csvHeaders = Object.keys(row).map(h => h.trim().toLowerCase());
//           if (JSON.stringify(csvHeaders) !== JSON.stringify(hierarchyRoles)) {
//             return res.status(400).json({ 
//               success: false, 
//               message: "CSV headers do not match the expected hierarchy.",
//               expectedHeaders: hierarchyRoles,
//               receivedHeaders: csvHeaders
//             });
//           }
//           isFirstRow = false;
//         }

//         let hierarchyEntry = { hierarchy_name };
//         hierarchyRoles.forEach((role, index) => {
//           hierarchyEntry[role] = row[Object.keys(row)[index]].trim().toUpperCase();
//         });

//         results.push(hierarchyEntry);
//       })
//       .on("end", async () => {
//         try {
//           if (results.length === 0) {
//             return res.status(400).json({ success: false, message: "No valid data found in CSV." });
//           }

//           // 🔥 3️⃣ Validate Actor Codes Before Insertion
//           // const allCodes = results.flatMap(entry => Object.values(entry).slice(1)); // Exclude hierarchy_name

//           const allCodes = results.flatMap(entry => Object.values(entry).slice(1).filter(code => code !== ""));

//           const existingCodes = await ActorCode.find({ code: { $in: allCodes } }).select("code");

//           const existingCodesSet = new Set(existingCodes.map(c => c.code));
//           const invalidCodes = allCodes.filter(code => !existingCodesSet.has(code));

//           if (invalidCodes.length > 0) {
//             return res.status(400).json({ success: false, message: "Invalid actor codes found", invalidCodes });
//           }

//           console.log("Valid Entries Before Insert:", results);

//           // 🔥 4️⃣ Attempt to Insert Data
//           try {
//             const insertedDocs = await HierarchyEntries.insertMany(results, { ordered: false });
//             console.log("Inserted Successfully:", insertedDocs.length);
//             return res.status(201).json({ success: true, message: "Hierarchy entries uploaded successfully", totalEntries: insertedDocs.length });
//           } catch (insertErr) {
//             console.error("Error inserting with insertMany:", insertErr);

//             // 🔥 5️⃣ Fallback: Use `updateOne()` for upserts if insertMany fails
//             let insertedCount = 0;
//             for (let entry of results) {
//               try {
//                 const query = hierarchyRoles.reduce((acc, role) => {
//                   acc[role] = entry[role];
//                   return acc;
//                 }, {});

//                 const result = await HierarchyEntries.updateOne(
//                   query, 
//                   { $set: entry }, 
//                   { upsert: true }
//                 );
                
//                 if (result.upsertedCount || result.modifiedCount) insertedCount++;
//               } catch (updateErr) {
//                 console.error("Failed to upsert entry:", entry, updateErr);
//               }
//             }

//             return res.status(201).json({ success: true, message: "Hierarchy entries uploaded with upserts", totalEntries: insertedCount });
//           }
//         } catch (error) {
//           console.error("Error processing hierarchy entries:", error);
//           res.status(500).json({ success: false, message: "Internal server error" });
//         }
//       });

//   } catch (error) {
//     console.error("Error in uploadHierarchyEntries:", error);
//     res.status(500).json({ success: false, message: "Internal server error" });
//   }
// };

exports.uploadHierarchyEntries = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const { hierarchy_name } = req.body;
    if (!hierarchy_name) {
      return res.status(400).json({ success: false, message: "Hierarchy name is required" });
    }

    const hierarchyConfig = await ActorTypesHierarchy.findOne({ name: hierarchy_name });
    if (!hierarchyConfig) {
      return res.status(400).json({ success: false, message: `Hierarchy '${hierarchy_name}' does not exist.` });
    }

    const hierarchyRoles = hierarchyConfig.hierarchy.map(role => role.toLowerCase());

    let results = [];
    const roleToCodesMap = new Map(hierarchyRoles.map(role => [role, new Set()]));
    const stream = new Readable();
    stream.push(req.file.buffer);
    stream.push(null);

    let isFirstRow = true;
    let responseSent = false;

    stream
      .pipe(csvParser())
      .on("data", (row) => {
        if (responseSent) return;

        if (isFirstRow) {
          const csvHeaders = Object.keys(row).map(h => h.trim().toLowerCase());
          if (JSON.stringify(csvHeaders) !== JSON.stringify(hierarchyRoles)) {
            responseSent = true;
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
          const code = row[Object.keys(row)[index]].trim().toUpperCase();
          hierarchyEntry[role] = code;
          if (code) roleToCodesMap.get(role).add(code);
        });

        results.push(hierarchyEntry);
      })
      .on("end", async () => {
        if (responseSent) return;

        try {
          if (results.length === 0) {
            responseSent = true;
            return res.status(400).json({ success: false, message: "No valid data found in CSV." });
          }

          const allCodes = [...new Set([...roleToCodesMap.values()].flatMap(set => [...set]))];
          const existingCodes = await ActorCode.find({ code: { $in: allCodes } }).select("code");
          const existingCodesSet = new Set(existingCodes.map(c => c.code));

          const invalidCodes = [];
          for (const role of hierarchyRoles) {
            const codes = roleToCodesMap.get(role);
            const missingCodes = [...codes].filter(code => !existingCodesSet.has(code));
            if (missingCodes.length > 0) {
              invalidCodes.push({ [role]: missingCodes });
            }
          }

          if (invalidCodes.length > 0) {
            responseSent = true;
            return res.status(400).json({
              success: false,
              message: "Invalid actor codes found",
              invalidCodes
            });
          }

          try {
            const insertedDocs = await HierarchyEntries.insertMany(results, { ordered: false });
            responseSent = true;
            return res.status(201).json({
              success: true,
              message: "Hierarchy entries uploaded successfully",
              totalEntries: insertedDocs.length
            });
          } catch (insertErr) {
            console.error("insertMany error:", insertErr);

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
                console.error("Upsert failed:", entry, updateErr);
              }
            }

            responseSent = true;
            return res.status(201).json({
              success: true,
              message: "Hierarchy entries uploaded with upserts",
              totalEntries: insertedCount
            });
          }
        } catch (error) {
          console.error("Processing error:", error);
          if (!responseSent) {
            responseSent = true;
            res.status(500).json({ success: false, message: "Internal server error" });
          }
        }
      })
      .on("error", (error) => {
        console.error("CSV parsing error:", error);
        if (!responseSent) {
          responseSent = true;
          res.status(400).json({ success: false, message: "Error parsing CSV file" });
        }
      });

  } catch (error) {
    console.error("Unhandled error in uploadHierarchyEntries:", error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "Internal server error" });
    }
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

// update dealers in hierarchy
exports.updateHierarchyEntries = async (req, res) => {
 try {
   const { user } = req.user;
   console.log("User who called API:", user);

   if (!req.file) {
     return res.status(400).json({ success: false, message: "No file uploaded" });
   }

   const { hierarchy_name } = req.body;
   if (!hierarchy_name) {
     return res.status(400).json({ success: false, message: "Hierarchy name is required" });
   }

   const hierarchyConfig = await ActorTypesHierarchy.findOne({ name: hierarchy_name });
   if (!hierarchyConfig) {
     return res.status(400).json({ success: false, message: `Hierarchy '${hierarchy_name}' not found.` });
   }

   const allowedFields = hierarchyConfig.hierarchy.map(field => field.toLowerCase());

   const parseCsv = (buffer) => {
     return new Promise((resolve, reject) => {
       const rows = [];
       let headersValidated = false;

       const stream = new Readable();
       stream.push(buffer);
       stream.push(null);

       stream
         .pipe(csvParser())
         .on("headers", (headers) => {
           const csvHeaders = headers.map(h => h.trim().toLowerCase());
           const fieldsMatched = allowedFields.every(f => csvHeaders.includes(f)) &&
                                 csvHeaders.every(h => allowedFields.includes(h));

           if (!fieldsMatched) {
             reject({
               status: 400,
               message: "CSV headers do not match expected hierarchy fields.",
               expectedFields: allowedFields,
               receivedFields: csvHeaders
             });
           }

           headersValidated = true;
         })
         .on("data", (row) => {
           if (headersValidated) rows.push(row);
         })
         .on("end", () => resolve(rows))
         .on("error", (err) => reject({ status: 500, message: "CSV parsing error", error: err }));
     });
   };

   // Parse CSV
   let csvRows;
   try {
     csvRows = await parseCsv(req.file.buffer);
   } catch (parseErr) {
     console.error("CSV parse error:", parseErr);
     return res.status(parseErr.status || 500).json({ success: false, message: parseErr.message, ...parseErr });
   }

   if (csvRows.length === 0) {
     return res.status(400).json({ success: false, message: "No valid data found in CSV file." });
   }

   // ✅ Step: Validate all actor codes at once
 // Track where each code came from (which field/column)
let codeSourceMap = new Map(); // Map<code, fieldName>

csvRows.forEach(row => {
  for (const field of allowedFields) {
    if (row[field]) {
      const cleanCode = row[field].trim().toUpperCase();
      codeSourceMap.set(cleanCode, field);
    }
  }
});

const allCodesArray = Array.from(codeSourceMap.keys());
const existingActors = await ActorCode.find({ code: { $in: allCodesArray } }).select('code');
const existingCodesSet = new Set(existingActors.map(a => a.code));

// missing codes in actor code 
const missingCodesDetailed = allCodesArray
  .filter(code => !existingCodesSet.has(code))
  .map(code => ({
    code,
    field: codeSourceMap.get(code)
  }));

if (missingCodesDetailed.length > 0) {
  return res.status(400).json({
    success: false,
    message: "One or more actor codes not found in Actors collection.",
    missingCodes: missingCodesDetailed
  });
}


   // ✅ Step: Proceed with processing and updating DB
   let updatedCount = 0;
   let insertedCount = 0;

   for (const row of csvRows) {
     const filter = { hierarchy_name };
     const updateData = {};

     for (const field of allowedFields) {
       if (row[field]) {
         const cleanVal = row[field].trim().toUpperCase();
         filter[field] = cleanVal;
         updateData[field] = cleanVal;
       }
     }

     const existingEntry = await HierarchyEntries.findOne(filter);

     if (existingEntry) {
       let hasChanged = false;
       for (const key of allowedFields) {
         const existingValue = (existingEntry[key] || "").trim().toUpperCase();
         const newValue = (updateData[key] || "").trim().toUpperCase();
         if (existingValue !== newValue) {
           hasChanged = true;
           break;
         }
       }

       if (hasChanged) {
         const result = await HierarchyEntries.updateOne(filter, {
           $set: updateData,
           $setOnInsert: { updatedBy: user?.name || user?.email || user?._id },
         });
         if (result.modifiedCount > 0) updatedCount++;
       }
     } else {
       const newEntry = new HierarchyEntries({
         hierarchy_name,
         ...updateData,
         createdBy: user?.name || user?.email || user?._id,
       });
       await newEntry.save();
       insertedCount++;
     }
   }

   return res.status(200).json({
     success: true,
     message: `${updatedCount} records updated and ${insertedCount} new records added.`,
     updatedBy: user?.name || user?.email || user?._id || "Unknown"
   });

 } catch (error) {
   console.error("Error in updateHierarchyEntries:", error);
   return res.status(500).json({ success: false, message: "Internal server error." });
 }
};
