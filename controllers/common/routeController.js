const fs = require("fs");
const csvParser = require("csv-parser");
const Routes = require("../../model/Routes");

// exports.uploadRoutes = async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ message: "CSV file is required." });
//     }

//     const results = [];
//     const seen = new Map(); // key: code-name, value: Set of towns

//     const filePath = req.file.path;

//     fs.createReadStream(filePath)
//       .pipe(
//         csvParser({
//           mapHeaders: ({ header }) =>
//             header.toLowerCase().trim().replace(/\s+/g, "_"),
//         })
//       )
//       .on("data", (row) => {
//        const code = row.code?.trim().toLowerCase();
//        const name = row.name?.trim();
//        const townRaw = row.town?.trim();

//        if (!code || !name || !townRaw) return;

//        // Normalize town name → "Agra Road", "Bassi"
//        const town = townRaw
//          .toLowerCase()
//          .split(" ")
//          .filter(Boolean)
//          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
//          .join(" ");

//        const key = `${code}-${name.toLowerCase()}`;

//        if (!seen.has(key)) {
//          seen.set(key, new Set());
//        }

//        seen.get(key).add(town);
//      })
//       .on("end", async () => {
//         try {
//           const insertions = [];

//           for (const [key, townsSet] of seen.entries()) {
//             const [code, nameLower] = key.split("-");
//             const name = nameLower.replace(/\b\w/g, (l) => l.toUpperCase()); // Capitalize route name

//             const existing = await Routes.findOne({
//               code: new RegExp(`^${code}$`, "i"),
//               name: new RegExp(`^${name}$`, "i"),
//             });

//             if (existing) {
//               // Avoid inserting towns already there
//               const existingTowns = new Set(
//                 existing.town.map((t) => t.toLowerCase())
//               );

//               const newTowns = [...townsSet].filter(
//                 (t) => !existingTowns.has(t.toLowerCase())
//               );

//               if (newTowns.length > 0) {
//                 existing.town.push(...newTowns);
//                 await existing.save();
//               }
//             } else {
//               insertions.push({
//                 code,
//                 name,
//                 town: [...townsSet],
//               });
//             }
//           }

//           if (insertions.length > 0) {
//             await Routes.insertMany(insertions);
//           }

//           fs.unlinkSync(filePath);

//           res.status(200).json({
//             message: "Dealer routes uploaded successfully.",
//             inserted: insertions.length,
//             updated: seen.size - insertions.length,
//           });
//         } catch (err) {
//           console.error("Insert error:", err);
//           res.status(500).json({ message: "Failed to save dealer routes." });
//         }
//       })
//       .on("error", (err) => {
//         console.error("CSV parse error:", err);
//         res.status(500).json({ message: "CSV parsing failed", error: err.message });
//       });
//   } catch (error) {
//     console.error("Upload error:", error);
//     res.status(500).json({ message: "Something went wrong", error: error.message });
//   }
// };
// skips the NA and blank rown if name is not available and town is available it gives a name unnamed route with the town name
// exports.uploadRoutes = async (req, res) => {
//  try {
//    if (!req.file) {
//      return res.status(400).json({ message: "CSV file is required." });
//    }

//    const seen = new Map(); // key = `${code}-${name}`, value = Set of towns
//    const filePath = req.file.path;

//    fs.createReadStream(filePath)
//      .pipe(
//        csvParser({
//          mapHeaders: ({ header }) =>
//            header.toLowerCase().trim().replace(/\s+/g, "_"),
//        })
//      )
//      .on("data", (row) => {
//       const codeRaw = row.code?.trim();
//       const townRaw = row.town?.trim();
//       let nameRaw = row.name?.trim();

//       if (!codeRaw || !townRaw) return;

//       const code = codeRaw.toUpperCase();
//       const town = townRaw;

//       let name = "Unnamed Route";

//       if (nameRaw && nameRaw !== "") {
//         name = nameRaw;
//       } else {
//         name = `${town
//           .split(" ")
//           .filter(Boolean)
//           .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
//           .join("-")}-Unknown-Route`;
//       }

//       const key = `${code}-${name}`;

//       if (!seen.has(key)) {
//         seen.set(key, new Set());
//       }

//       seen.get(key).add(town);
//     })

//      .on("end", async () => {
//        try {
//          const insertions = [];

//          for (const [key, townsSet] of seen.entries()) {
//            const [code, ...nameParts] = key.split("-");
//            const name = nameParts.join("-");

//            const existing = await Routes.findOne({
//              code,
//              name,
//            });

//            if (existing) {
//              const existingTowns = new Set(existing.town);
//              const newTowns = [...townsSet].filter(
//                (t) => !existingTowns.has(t)
//              );

//              if (newTowns.length > 0) {
//                existing.town.push(...newTowns);
//                await existing.save();
//              }
//            } else {
//              insertions.push({
//                code,
//                name,
//                town: [...townsSet],
//              });
//            }
//          }

//          if (insertions.length > 0) {
//            await Routes.insertMany(insertions);
//          }

//          fs.unlinkSync(filePath);

//          res.status(200).json({
//            message: "Dealer routes uploaded successfully.",
//            inserted: insertions.length,
//            updated: seen.size - insertions.length,
//          });
//        } catch (err) {
//          console.error("Insert error:", err);
//          res
//            .status(500)
//            .json({ message: "Failed to save dealer routes.", error: err.message });
//        }
//      })
//      .on("error", (err) => {
//        console.error("CSV parse error:", err);
//        res.status(500).json({ message: "CSV parsing failed", error: err.message });
//      });
//  } catch (error) {
//    console.error("Upload error:", error);
//    res
//      .status(500)
//      .json({ message: "Something went wrong", error: error.message });
//  }
// };
// Split the route name like bassi-kanota
// exports.uploadRoutes = async (req, res) => {
//  try {
//    if (!req.file) {
//      return res.status(400).json({ message: "CSV file is required." });
//    }

//    const seen = new Map(); // key: CODE-NAME, value: Set of towns
//    const filePath = req.file.path;

//    fs.createReadStream(filePath)
//      .pipe(
//        csvParser({
//          mapHeaders: ({ header }) =>
//            header.toLowerCase().trim().replace(/\s+/g, "_"),
//        })
//      )
//      .on("data", (row) => {
//        const codeRaw = row.code?.trim();
//        const townRaw = row.town?.trim();
//        let nameRaw = row.name?.trim();

//        // ✅ Skip rows missing code or town
//        if (!codeRaw || !townRaw) return;

//        const code = codeRaw.toUpperCase();

//        // ✅ Format town (capitalize each word)
//        const town = townRaw
//          .toLowerCase()
//          .split(" ")
//          .filter(Boolean)
//          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
//          .join(" ");

//        let name = "Unnamed Route";

//        // ✅ If name is provided, use it
//        if (nameRaw && nameRaw !== "") {
//          name = nameRaw
//            .toLowerCase()
//            .split(" ")
//            .filter(Boolean)
//            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
//            .join(" ");
//        } else {
//          // ✅ If name is blank → check if any existing name matches town
//          const townMatch = Array.from(seen.keys()).find((key) => {
//           const separatorIndex = key.indexOf("-");
//           const kCode = key.substring(0, separatorIndex);
//           const kName = key.substring(separatorIndex + 1);

//           return (
//             kCode.toUpperCase() === code &&
//             kName.toLowerCase() === town.toLowerCase()
//           );
//         });
//          if (townMatch) {
//            // ✅ Use town as route name if found in existing entries
//            name = town;
//          } else {
//            // ✅ Else, create a fallback name from town
//            name = `${town}-Unknown-Route`;
//          }
//        }

//        const key = `${code}-${name}`;

//        if (!seen.has(key)) {
//          seen.set(key, new Set());
//        }

//        seen.get(key).add(town);
//      })
//      .on("end", async () => {
//        try {
//          const insertions = [];

//          for (const [key, townsSet] of seen.entries()) {
//           const separatorIndex = key.indexOf("-");
//           const code = key.substring(0, separatorIndex);
//           const name = key.substring(separatorIndex + 1);

//            const existing = await Routes.findOne({
//              code: new RegExp(`^${code}$`, "i"),
//              name: new RegExp(`^${name}$`, "i"),
//            });

//            if (existing) {
//              // ✅ Avoid duplicating towns already in DB
//              const existingTowns = new Set(
//                existing.town.map((t) => t.toLowerCase())
//              );

//              const newTowns = [...townsSet].filter(
//                (t) => !existingTowns.has(t.toLowerCase())
//              );

//              if (newTowns.length > 0) {
//                existing.town.push(...newTowns);
//                await existing.save();
//              }
//            } else {
//              insertions.push({
//                code,
//                name,
//                town: [...townsSet],
//              });
//            }
//          }

//          // ✅ Bulk insert new route docs
//          if (insertions.length > 0) {
//            await Routes.insertMany(insertions);
//          }

//          // ✅ Cleanup file
//          fs.unlinkSync(filePath);

//          res.status(200).json({
//            message: "User routes uploaded successfully.",
//            inserted: insertions.length,
//            updated: seen.size - insertions.length,
//          });
//        } catch (err) {
//          console.error("Insert error:", err);
//          res
//            .status(500)
//            .json({ message: "Failed to save user routes." });
//        }
//      })
//      .on("error", (err) => {
//        console.error("CSV parse error:", err);
//        res.status(500).json({
//          message: "CSV parsing failed",
//          error: err.message,
//        });
//      });
//  } catch (error) {
//    console.error("Upload error:", error);
//    res.status(500).json({
//      message: "Something went wrong",
//      error: error.message,
//    });
//  }
// };


exports.uploadRoutes = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "CSV file is required." });
    }

    const seen = new Map(); // key: CODE|NAME → Set of towns
    const skippedRows = [];
    const duplicateTowns = [];
    const filePath = req.file.path;

    fs.createReadStream(filePath)
      .pipe(
        csvParser({
          mapHeaders: ({ header }) =>
            header.toLowerCase().trim().replace(/\s+/g, "_"),
        })
      )
      .on("data", (row) => {
        const rawCode = row.code?.trim();
        const rawTown = row.town?.trim();
        const rawName = row.name?.trim();

        // ❌ Skip if code missing or both name and town are missing/NA
        if (
          !rawCode ||
          ((!rawTown || rawTown.toLowerCase() === "na") &&
            (!rawName || rawName.toLowerCase() === "na"))
        ) {
          skippedRows.push(row);
          return;
        }

        const code = rawCode.toUpperCase();

        // 🧹 Clean and normalize name (required now!)
        const name = rawName
          ?.toLowerCase()
          .split(" ")
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ")
          .trim();

        if (!name) {
          skippedRows.push(row);
          return;
        }

        // 🧹 Normalize town
        let town = "";
        if (rawTown && rawTown.toLowerCase() !== "na") {
          town = rawTown
            .toLowerCase()
            .split(" ")
            .filter(Boolean)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ")
            .trim();
        }

        const key = `${code}|${name}`;

        if (!seen.has(key)) {
          seen.set(key, new Set());
        }

        if (town) {
          seen.get(key).add(town);
        }
      })
      .on("end", async () => {
        try {
          const insertions = [];

          for (const [key, townsSet] of seen.entries()) {
            const [code, name] = key.split("|");

            const existing = await Routes.findOne({
              code: new RegExp(`^${code}$`, "i"),
              name: new RegExp(`^${name}$`, "i"),
            });

            if (existing) {
              const existingTowns = new Set(
                (existing.town || []).map((t) => t.toLowerCase())
              );

              const newTowns = [...townsSet].filter(
                (t) => !existingTowns.has(t.toLowerCase())
              );

              if (newTowns.length > 0) {
                existing.town.push(...newTowns);
                await existing.save();
              } else {
                duplicateTowns.push({ code, name });
              }
            } else {
              insertions.push({
                code,
                name,
                town: [...townsSet],
              });
            }
          }

          if (insertions.length > 0) {
            await Routes.insertMany(insertions);
          }

          fs.unlinkSync(filePath);

          return res.status(200).json({
            message: "Routes uploaded successfully.",
            inserted: insertions.length,
            updated: seen.size - insertions.length,
            skipped: skippedRows.length,
            duplicates: duplicateTowns.length,
            skippedRows,
            duplicateTowns,
          });
        } catch (err) {
          console.error("Insert error:", err);
          return res.status(500).json({ message: "Failed to save routes." });
        }
      })
      .on("error", (err) => {
        console.error("CSV parse error:", err);
        return res.status(500).json({ message: "CSV parsing failed", error: err.message });
      });
  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({ message: "Something went wrong", error: error.message });
  }
};
