const fs = require("fs");
const csvParser = require("csv-parser");
const Routes = require("../../model/Routes");
const moment = require('moment-timezone');
const RoutePlan = require("../../model/RoutePlan");
const HierarchyEntries = require("../../model/HierarchyEntries");
const WeeklyBeatMappingSchedule = require("../../model/WeeklyBeatMappingSchedule");
const User = require("../../model/User");
const Notification = require("../../model/Notification");

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

exports.getRouteByUser = async (req, res) => {
 try {
   const { code } = req.user;

   // 🔒 Validate user code
   if (!code) {
     return res.status(401).json({ message: "Unauthorized: User code missing" });
   }

   // 🔍 Fetch all routes for this user
   const userRoutes = await Routes.find({ code: code.toUpperCase() }).sort({ createdAt: -1 });

   // 📦 Return response
   return res.status(200).json({
     success: true,
     total: userRoutes.length,
     data: userRoutes,
   });
 } catch (error) {
   console.error("Error fetching routes for user:", error);
   return res.status(500).json({
     success: false,
     message: "Server error while fetching user routes",
   });
 }
};
// itenary by taluka
// exports.addRoutePlanFromSelectedRoutes = async (req, res) => {
//  try {
//    const { routes = [] } = req.body;
//    const { code } = req.user;

//    if (!routes.length) {
//      return res.status(400).json({ message: "Please provide selected route names." });
//    }

//    // 🔍 Step 1: Fetch matching routes for the user
//    const routeDocs = await Routes.find({
//      code: code.toUpperCase(),
//      name: { $in: routes }
//    });

//    if (!routeDocs.length) {
//      return res.status(404).json({ message: "No matching routes found." });
//    }

//    // 🧱 Step 2: Collect towns from matched routes
//    const allTowns = routeDocs.flatMap(route => route.town || []);
//    const uniqueTowns = [...new Set(allTowns)];

//    // 🧩 Step 3: Prepare the itinerary
//    const itinerary = {
//      district: [],
//      zone: [],
//      taluka: uniqueTowns, // ✅ putting towns into taluka
//    };

//    // 📆 Step 4: Dates
//    const today = moment().tz("Asia/Kolkata");
//    const startDate = today.clone().startOf("day").toDate();
//    const endDate = today.clone().endOf("day").toDate();

//    // 🏷️ Step 5: Name = selected route names joined with "-"
//    const name = routes.join("-").toLowerCase();

//    // 📌 Step 6: Save the RoutePlan
//    const newPlan = await RoutePlan.create({
//      startDate,
//      endDate,
//      code,
//      name,
//      itinerary,
//      status: "active",
//      approved: true
//    });

//    return res.status(201).json({
//      success: true,
//      message: "Route plan created successfully from selected routes.",
//      data: newPlan
//    });

//  } catch (err) {
//    console.error("Error in addRoutePlanFromSelectedRoutes:", err);
//    return res.status(500).json({ message: "Internal Server Error" });
//  }
// };
// itenary by town 
// exports.addRoutePlanFromSelectedRoutes = async (req, res) => {
//  console.log("tryingg to add route ");
//  try {
//    const { routes = [] } = req.body;
//    const { code } = req.user;

//    if (!routes.length) {
//      return res.status(400).json({ message: "Please provide selected route names." });
//    }

//    // 🔍 Step 1: Fetch matching routes for the user
//    const routeDocs = await Routes.find({
//      code: code.toUpperCase(),
//      name: { $in: routes }
//    });

//    if (!routeDocs.length) {
//      return res.status(404).json({ message: "No matching routes found." });
//    }

//    // 🧱 Step 2: Collect towns from matched routes
//    const allTowns = routeDocs.flatMap(route => route.town || []);
//    const uniqueTowns = [...new Set(allTowns)];

//    // 🧩 Step 3: Prepare the itinerary
//    const itinerary = {
//      district: [],
//      zone: [],
//      taluka: [],
//      town: uniqueTowns // ✅ putting towns into taluka
//    };

//    // 📆 Step 4: Dates
//    const today = moment().tz("Asia/Kolkata");
//    const startDate = today.clone().startOf("day").toDate();
//    const endDate = today.clone().endOf("day").toDate();

//    // 🏷️ Step 5: Name = selected route names joined with "-"
//    const name = routes.join("-").toLowerCase();

//    // 📌 Step 6: Save the RoutePlan
//    const newPlan = await RoutePlan.create({
//      startDate,
//      endDate,
//      code,
//      name,
//      itinerary,
//      status: "inactive",
//      approved: false,
//    });

//    return res.status(201).json({
//      success: true,
//      message: "Route plan created successfully from selected routes.",
//      data: newPlan
//    });

//  } catch (err) {
//    console.error("Error in addRoutePlanFromSelectedRoutes:", err);
//    return res.status(500).json({ message: "Internal Server Error" });
//  }
// };
// Just addign the route logic in exisiting logic
// exports.addRoutePlanFromSelectedRoutes = async (req, res) => {
//  try {
//   const {
//     routes = [], // optional
//     itinerary = {}, // optional if using routes
//     status = "inactive",
//     approved = false,
//     startDate: inputStart,
//     endDate: inputEnd,
//   } = req.body;

//   const { code: userCode, position } = req.user;

//   // 📆 Set startDate and endDate
//   const todayIST = moment().tz("Asia/Kolkata");
//   const startDate = inputStart
//     ? moment.tz(inputStart, "Asia/Kolkata").startOf("day").toDate()
//     : todayIST.clone().startOf("day").toDate();

//   const endDate = inputEnd
//     ? moment.tz(inputEnd, "Asia/Kolkata").endOf("day").toDate()
//     : todayIST.clone().endOf("day").toDate();

//   let finalItinerary = { ...itinerary };

//   // 🔍 If routes provided, fetch towns from Routes collection
//   if (routes.length) {
//     const routeDocs = await Routes.find({
//       code: userCode.toUpperCase(),
//       name: { $in: routes },
//     });

//     if (!routeDocs.length) {
//       return res.status(404).json({ message: "No matching routes found." });
//     }

//     const allTowns = routeDocs.flatMap((r) => r.town || []);
//     finalItinerary.town = [...new Set(allTowns)];
//   }

//   // 🏷️ Route name from available fields
//   const locationFields = ["district", "taluka", "zone", "town"];
//   const nameParts = locationFields
//     .filter(
//       (field) => Array.isArray(finalItinerary[field]) && finalItinerary[field].length > 0
//     )
//     .flatMap((field) => finalItinerary[field]);

//   const name = (routes.length ? routes.join("-") : nameParts.join("-")).toLowerCase() || "unnamed-route";

//   // 📌 Save Route Plan
//   const newRoute = await RoutePlan.create({
//     startDate,
//     endDate,
//     code: userCode,
//     name,
//     itinerary: finalItinerary,
//     status,
//     approved,
//   });

//   // 📅 Date breakdown
//   const start = moment(startDate).tz("Asia/Kolkata").startOf("day");
//   const end = moment(endDate).tz("Asia/Kolkata").endOf("day");
//   const days = [];
//   for (let m = moment(start); m.isSameOrBefore(end); m.add(1, "days")) {
//     days.push({
//       start: m.clone().startOf("day").toDate(),
//       end: m.clone().endOf("day").toDate(),
//     });
//   }

//   // 📊 Hierarchy mapping
//   const hierarchy = await HierarchyEntries.find({
//     hierarchy_name: "default_sales_flow",
//     [position]: userCode,
//   });

//   const dealerCodes = [...new Set(hierarchy.map((h) => h.dealer))];
//   const mddCodes = [...new Set(hierarchy.map((h) => h.mdd))];

//   for (const { start, end } of days) {
//     const existingSchedule = await WeeklyBeatMappingSchedule.findOne({
//       code: userCode,
//       startDate: { $lte: start },
//       endDate: { $gte: start },
//     });

//     const baseQuery = {
//       code: { $in: [...dealerCodes, ...mddCodes] },
//       ...(finalItinerary.district?.length && {
//         district: { $in: finalItinerary.district },
//       }),
//       ...(finalItinerary.zone?.length && { zone: { $in: finalItinerary.zone } }),
//       ...(finalItinerary.taluka?.length && { taluka: { $in: finalItinerary.taluka } }),
//       ...(finalItinerary.town?.length && { town: { $in: finalItinerary.town } }),
//     };

//     const filteredUsers = await User.find(baseQuery);

//     const entries = filteredUsers.map((user) => ({
//       code: user.code,
//       name: user.name,
//       latitude: user.latitude || 0,
//       longitude: user.longitude || 0,
//       status: "pending",
//       distance: null,
//       district: user.district || "",
//       taluka: user.taluka || "",
//       town: user.town || "",
//       zone: user.zone || "",
//       position: user.position || "",
//     }));

//     if (existingSchedule) {
//       const existingCodes = new Set(existingSchedule.schedule.map((d) => d.code));
//       const newEntries = entries.filter((e) => !existingCodes.has(e.code));
//       existingSchedule.schedule.push(...newEntries);
//       existingSchedule.total += newEntries.length;
//       existingSchedule.pending += newEntries.length;
//       await existingSchedule.save();
//     } else {
//       await WeeklyBeatMappingSchedule.create({
//         startDate: start,
//         endDate: end,
//         code: userCode,
//         schedule: entries,
//         total: entries.length,
//         done: 0,
//         pending: entries.length,
//       });
//     }
//   }

//   // 🔔 Notification
//   await Notification.create({
//     title: "Route Plan",
//     message: `The user with code ${userCode} created ${name} routes from ${formatDate(
//       startDate
//     )} to ${formatDate(endDate)}.`,
//     filters: [name, startDate, endDate],
//     targetRole: ["admin", "super_admin"],
//   });

//   return res.status(201).json({
//     message: "Route Plan created successfully.",
//     route: newRoute,
//   });
// } catch (err) {
//   console.error("Error in addRoutePlan:", err);
//   return res.status(500).json({ message: "Internal Server Error" });
// }
// };
 

const formatDate = (date) =>
 new Date(date).toLocaleDateString("en-GB", {
   day: "2-digit",
   month: "short",
   year: "numeric",
 });

// route selected logic only
exports.addRoutePlanFromSelectedRoutes = async (req, res) => {
 console.log("trying to add route ");
 try {
   const { routes = [],
     startDate: inputStart, endDate: inputEnd } = req.body;
   const { code, position } = req.user;

   if (!routes.length) {
     return res.status(400).json({ message: "Please provide selected route names." });
   }

   // 🔍 Step 1: Fetch matching routes for the user
   const routeDocs = await Routes.find({
     code: code.toUpperCase(),
     name: { $in: routes }
   });

   if (!routeDocs.length) {
     return res.status(404).json({ message: "No matching routes found." });
   }

   // 🧱 Step 2: Collect towns from matched routes
   const allTowns = routeDocs.flatMap(route => route.town || []);
   const uniqueTowns = [...new Set(allTowns)];

   // 🧩 Step 3: Prepare the itinerary
   const itinerary = {
     district: [],
     zone: [],
     taluka: [],
     town: uniqueTowns
   };

   // 📆 Step 4: Handle start and end date
   const todayIST = moment().tz("Asia/Kolkata");

   const startDate = inputStart
     ? moment.tz(inputStart, "Asia/Kolkata").startOf("day").toDate()
     : todayIST.clone().startOf("day").toDate();
   
   const endDate = inputEnd
     ? moment.tz(inputEnd, "Asia/Kolkata").endOf("day").toDate()
     : todayIST.clone().endOf("day").toDate();
   
   console.log("✅ Final Start & End Dates (IST):", startDate, endDate);
   
   // 🏷️ Step 5: Name = selected route names joined with "-"
   const name = routes.join("-").toLowerCase();

   // 📌 Step 6: Save the RoutePlan
   const newPlan = await RoutePlan.create({
     startDate,
     endDate,
     code,
     name,
     itinerary,
     status: "inactive",
     approved: false,
   });

   // 🔁 Step 7: Breakdown per day
   const start = moment(startDate).tz("Asia/Kolkata").startOf("day");
   const end = moment(endDate).tz("Asia/Kolkata").endOf("day");
   const days = [];
   for (let m = moment(start); m.isSameOrBefore(end); m.add(1, "days")) {
     days.push({
       start: m.clone().startOf("day").toDate(),
       end: m.clone().endOf("day").toDate(),
     });
   }

   // 📚 Step 8: Get hierarchy entries
   const hierarchy = await HierarchyEntries.find({
     hierarchy_name: "default_sales_flow",
     [position]: code,
   });

   const dealerCodes = [...new Set(hierarchy.map((h) => h.dealer))];
   const mddCodes = [...new Set(hierarchy.map((h) => h.mdd))];

   // 📦 Step 9: Loop through days & update schedules
   for (const { start, end } of days) {
     const existingSchedule = await WeeklyBeatMappingSchedule.findOne({
       code,
       startDate: { $lte: start },
       endDate: { $gte: start },
     });

     const baseQuery = {
       code: { $in: [...dealerCodes, ...mddCodes] },
       ...(itinerary.town?.length && { town: { $in: itinerary.town } }),
     };

     const filteredUsers = await User.find(baseQuery);

     const entries = filteredUsers.map((user) => ({
       code: user.code,
       name: user.name,
       latitude: user.latitude || 0,
       longitude: user.longitude || 0,
       status: "pending",
       distance: null,
       district: user.district || "",
       taluka: user.taluka || "",
       town: user.town || "",
       zone: user.zone || "",
       position: user.position || "",
     }));

     if (existingSchedule) {
       const existingCodes = new Set(
         existingSchedule.schedule.map((d) => d.code)
       );
       const newEntries = entries.filter((e) => !existingCodes.has(e.code));
       existingSchedule.schedule.push(...newEntries);
       existingSchedule.total += newEntries.length;
       existingSchedule.pending += newEntries.length;
       await existingSchedule.save();
     } else {
       await WeeklyBeatMappingSchedule.create({
         startDate: start,
         endDate: end,
         code,
         schedule: entries,
         total: entries.length,
         done: 0,
         pending: entries.length,
       });
     }
   }

   // 🔔 Step 10: Create notification
   await Notification.create({
     title: "Route Plan",
     message: `The user with code ${code} created ${name} routes from ${formatDate(startDate)} to ${formatDate(endDate)}.`,
     filters: [name, startDate, endDate],
     targetRole: ["admin", "super_admin"],
   });

   return res.status(201).json({
     success: true,
     message: "Route plan created successfully from selected routes.",
     data: newPlan
   });

 } catch (err) {
   console.error("Error in addRoutePlanFromSelectedRoutes:", err);
   return res.status(500).json({ message: "Internal Server Error" });
 }
};
