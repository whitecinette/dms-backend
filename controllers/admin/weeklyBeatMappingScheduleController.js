const getDistance = require("../../helpers/attendanceHelper");
const csvParser = require("csv-parser");
const { Readable } = require("stream");
const { getCurrentWeekDates } = require("../../helpers/dateHelpers");
const WeeklyBeatMappingSchedule = require("../../model/WeeklyBeatMappingSchedule");
const User = require("../../model/User");
const HierarchyEntries = require("../../model/HierarchyEntries");
const ActorCode = require("../../model/ActorCode");
const mongoose = require("mongoose");
const DeletedData = require("../../model/DeletedData");
const bcrypt = require("bcrypt");

const moment = require("moment-timezone");
const RoutePlan = require("../../model/RoutePlan");

// add weekly beat mapping
exports.addWeeklyBeatMappingSchedule = async (req, res) => {
  try {
    const { startDate, endDate, code, schedule } = req.body;

    // Validate input fields
    if (!code || !startDate || !endDate || !schedule) {
      return res.status(400).json({
        error: "code, startDate, endDate, and schedule are required fields.",
      });
    }

    // Count total dealers in the schedule
    let total = 0;
    let done = 0;
    let pending = 0;

    Object.values(schedule).forEach((daySchedule) => {
      total += daySchedule.length;
      daySchedule.forEach((dealer) => {
        if (dealer.status === "done") done++;
        else if (dealer.status === "pending") pending++;
      });
    });

    // Create new schedule entry
    const newSchedule = new WeeklyBeatMappingSchedule({
      startDate,
      endDate,
      code,
      schedule,
      total,
      done,
      pending,
    });

    // Save to database
    await newSchedule.save();

    return res.status(201).json({
      message: "Weekly Beat Mapping Schedule added successfully.",
      data: newSchedule,
    });
  } catch (error) {
    console.error("Error adding Weekly Beat Mapping Schedule:", error);
    return res.status(500).json({ error: "Internal server error!!!" });
  }
};

// get weekly beat mapping schedule
exports.getWeeklyBeatMappingSchedule = async (req, res) => {
  try {
    const code = req.user?.code || null; // Ensure it's extracting the correct value
    // console.log("code is :", code)
    let { startDate, endDate } = req.query; // Optional date range

    // Validate code
    if (!code) {
      return res.status(400).json({ error: "User code is required." });
    }

    // If startDate and endDate are not provided, fetch schedules for the current week (Monday to Sunday)
    if (!startDate || !endDate) {
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0 (Sunday) - 6 (Saturday)

      // Calculate Monday of the current week
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

      // Calculate Sunday of the current week
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      startDate = monday.toISOString().split("T")[0]; // Format YYYY-MM-DD
      endDate = sunday.toISOString().split("T")[0];
    }

    // Convert to Date objects
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // console.log("Start Date:", start, "End Date:", end);

    // Fetch schedules within the date range
    const schedules = await WeeklyBeatMappingSchedule.find({
      code: code,
      startDate: { $lte: end },
      endDate: { $gte: start },
    });
    // console.log("schedule dealer:" ,schedules)
    if (!schedules || schedules.length === 0) {
      return res.status(404).json({
        error: "No schedules found for this user within the given date range.",
      });
    }

    return res.status(200).json({
      message: "Weekly Beat Mapping Schedules retrieved successfully!",
      data: schedules,
    });
  } catch (error) {
    console.error("Error fetching Weekly Beat Mapping Schedule:", error);
    return res.status(500).json({ error: "Internal server error!" });
  }
};

exports.updateWeeklyBeatMappingStatus = async (req, res) => {
  try {
    const { scheduleId, dealerCode } = req.params;
    const { day, status } = req.body;

    // Validate input
    if (!day || !status) {
      return res
        .status(400)
        .json({ error: "day and status are required in the request body." });
    }

    // Find the schedule entry
    const schedule = await WeeklyBeatMappingSchedule.findById(scheduleId);
    if (!schedule) {
      return res.status(404).json({ error: "Schedule not found." });
    }

    // Check if the day exists in the schedule
    if (!schedule.schedule[day]) {
      return res.status(400).json({ error: "Invalid day provided." });
    }

    // Find the dealer in the specified day's schedule
    const dealer = schedule.schedule[day].find((d) => d.code === dealerCode);
    if (!dealer) {
      return res
        .status(404)
        .json({ error: "Dealer not found in the specified day." });
    }

    // Update the status
    dealer.status = status;

    // Recalculate total, done, and pending counts
    let total = 0,
      done = 0,
      pending = 0;
    Object.values(schedule.schedule).forEach((daySchedule) => {
      total += daySchedule.length;
      daySchedule.forEach((dealer) => {
        if (dealer.status === "done") done++;
        else if (dealer.status === "pending") pending++;
      });
    });

    schedule.total = total;
    schedule.done = done;
    schedule.pending = pending;

    // Save the updated schedule
    await schedule.save();

    return res.status(200).json({
      message: "Dealer status updated successfully.",
      data: schedule,
    });
  } catch (error) {
    console.error("Error updating Weekly Beat Mapping status:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};
// update dealer status with proximity
exports.updateWeeklyBeatMappingStatusWithProximity = async (req, res) => {
  try {
    const { scheduleId, code } = req.params;

    const { status, employeeLat, employeeLong } = req.body;
    const allowedRadius = 100; // Allowed proximity range in meters

    if (!status || !employeeLat || !employeeLong) {
      return res.status(400).json({
        error:
          "status, employeeLat, and employeeLong are required in the request body.",
      });
    }

    // Find the schedule entry
    const schedule = await WeeklyBeatMappingSchedule.findById(scheduleId);
    if (!schedule) {
      return res.status(404).json({ error: "Schedule not found." });
    }

    // Find the dealer in the entire schedule
    let dealer;
    for (const daySchedule of Object.values(schedule.schedule)) {
      dealer = daySchedule.find((d) => d.code === code);
      if (dealer) break;
    }

    if (!dealer) {
      return res
        .status(404)
        .json({ error: "Dealer not found in the schedule." });
    }

    // Calculate distance between employee and dealer
    const dealerLat = parseFloat(dealer.lat);
    const dealerLong = parseFloat(dealer.long);
    const distance = getDistance(
      employeeLat,
      employeeLong,
      dealerLat,
      dealerLong
    ); // Using the given function

    if (distance > allowedRadius) {
      return res.status(403).json({
        error: "You are too far from the dealer's location.",
        distanceFromDealer: `${distance.toFixed(2)} meters`,
      });
    }

    // Update the status if the employee is within the allowed radius
    dealer.status = "done";
    dealer.distance = `${distance.toFixed(2)} meters`;

    // Recalculate total, done, and pending counts
    let total = 0,
      done = 0,
      pending = 0;
    Object.values(schedule.schedule).forEach((daySchedule) => {
      total += daySchedule.length;
      daySchedule.forEach((dealer) => {
        if (dealer.status === "done") done++;
        else if (dealer.status === "pending") pending++;
      });
    });

    schedule.total = total;
    schedule.done = done;
    schedule.pending = pending;

    // Save the updated schedule
    await schedule.save();

    return res.status(200).json({
      message: "Dealer status updated successfully.",
      updatedDistance: `${distance.toFixed(2)} meters`,
      data: schedule,
    });
  } catch (error) {
    console.error("Error updating Weekly Beat Mapping status:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};

// Add beat mapping using csv

exports.addWeeklyBeatMappingUsingCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    let results = [];
    const stream = new Readable();
    stream.push(req.file.buffer);
    stream.push(null);

    stream
      .pipe(csvParser())
      .on("data", (data) => {
        results.push(data);
      })
      .on("end", async () => {
        try {
          let schedules = [];

          for (let row of results) {
            const asmCode = row["code"];
            console.log("asmCode:", asmCode);
            const dealerCodes = row["Dealer Codes(All)"]
              ? row["Dealer Codes(All)"].split(" ")
              : [];

            if (!asmCode) continue;

            // Fetch dealer details from User collection
            const dealerRecords = await User.find({
              code: { $in: dealerCodes },
              role: "dealer",
            });
            let schedule = {
              Mon: [],
              Tue: [],
              Wed: [],
              Thu: [],
              Fri: [],
              Sat: [],
              Sun: [],
            };

            for (const day of [
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
              "Sunday",
            ]) {
              if (row[day]) {
                const dayDealerCodes = row[day]
                  .split(" ")
                  .filter((code) => code);
                for (const dealerCode of dayDealerCodes) {
                  const dealer = dealerRecords.find(
                    (d) => d.code === dealerCode
                  );
                  if (dealer) {
                    schedule[day.substring(0, 3)].push({
                      code: dealerCode,
                      name: dealer.name,
                      latitude: dealer.latitude
                        ? Number(dealer.latitude)
                        : null,
                      longitude: dealer.longitude
                        ? Number(dealer.longitude)
                        : null,
                      status: "pending",
                      distance: null,
                    });
                  }
                }
              }
            }

            let { startDate, endDate } = req.body;
            if (!startDate || !endDate) {
              ({ startDate, endDate } = getCurrentWeekDates());
            }

            let total = Object.values(schedule).reduce(
              (sum, dealers) => sum + dealers.length,
              0
            );

            schedules.push({
              startDate: new Date(startDate),
              endDate: new Date(endDate),
              code: asmCode,
              schedule,
              total,
              done: 0,
              pending: total,
            });
          }

          await WeeklyBeatMappingSchedule.insertMany(schedules);

          return res.status(201).json({
            message: "Weekly Beat Mapping Schedules added successfully.",
            totalSchedules: schedules.length,
          });
        } catch (error) {
          console.error("Error processing CSV:", error);
          return res
            .status(500)
            .json({ error: "Internal server error while processing CSV" });
        }
      });
  } catch (error) {
    console.error("Error handling CSV upload:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

//get weekly beat mapping for admin
// exports.getWeeklyBeatMappingScheduleForAdmin = async (req, res) => {
//   try {
//     const {
//       startDate,
//       endDate,
//       search,
//       status,
//       page = 1,
//       limit = 20,
//     } = req.query;

//     if (!startDate || !endDate) {
//       return res.status(400).json({
//         success: false,
//         message: "Start date and end date are required.",
//       });
//     }

//     // Ensure full day coverage
//     const start = new Date(startDate);
//     start.setHours(0, 0, 0, 0);

//     const end = new Date(endDate);
//     end.setHours(23, 59, 59, 999);

//     const query = {
//       startDate: { $gte: start },
//       endDate: { $lte: end },
//     };

//     const skip = (parseInt(page) - 1) * parseInt(limit);

//     // Fetch employees
//     const employees = await User.find(
//       { role: { $in: ["admin", "employee"] } },
//       "code name"
//     ).lean();

//     const employeeMap = employees.reduce((acc, emp) => {
//       acc[emp.code.trim().toLowerCase()] = emp.name;
//       return acc;
//     }, {});

//     const schedules = await WeeklyBeatMappingSchedule.find(query)
//       .skip(skip)
//       .limit(parseInt(limit))
//       .lean();

//     // Fetch route plans for the date range
//     const routePlans = await RoutePlan.find({
//       startDate: { $lte: end },
//       endDate: { $gte: start },
//     }).lean();

//     const formattedSchedules = schedules.map((schedule) => {
//       let dealers = schedule.schedule || [];

//       if (status) {
//         dealers = dealers.filter((dealer) => dealer.status === status);
//       }

//       const normalizedCode = schedule.code?.trim().toLowerCase();
//       const employeeName = employeeMap[normalizedCode] || "Unknown";

//       // Find all matching routes
//       const matchingRoutes = routePlans.filter((route) => {
//         const routeStartStr = new Date(route.startDate)
//           .toISOString()
//           .split("T")[0];
//         const routeEndStr = new Date(route.endDate).toISOString().split("T")[0];
//         const scheduleStartStr = new Date(schedule.startDate)
//           .toISOString()
//           .split("T")[0];
//         const scheduleEndStr = new Date(schedule.endDate)
//           .toISOString()
//           .split("T")[0];

//         return (
//           route.code === schedule.code &&
//           routeStartStr === scheduleStartStr &&
//           routeEndStr === scheduleEndStr
//         );
//       });

//       // Format routes with their details
//       const routes = matchingRoutes.map((route) => ({
//         name: route.name,
//         id: route._id,
//         status: route.status,
//         itinerary: {

//           zones: route.itinerary?.zone || [],
//           districts: route.itinerary?.district || [],
//           talukas: route.itinerary?.taluka || [],
//         },
//       }));

//       return {
//         _id: schedule._id,
//         code: schedule.code,
//         name: employeeName,
//         startDate: schedule.startDate,
//         endDate: schedule.endDate,
//         total: schedule.total,
//         done: schedule.done,
//         pending: schedule.pending,
//         schedule: dealers,
//         routes: routes,
//       };
//     });

//     // Apply search (code or name)
//     let filteredSchedules = formattedSchedules;
//     if (search) {
//       const searchRegex = new RegExp(search, "i");
//       filteredSchedules = formattedSchedules.filter(
//         (schedule) =>
//           searchRegex.test(schedule.code) ||
//           searchRegex.test(schedule.name) ||
//           searchRegex.test(schedule.routes.map((r) => r.name).join(" "))
//       );
//     }

//     const totalCount = await WeeklyBeatMappingSchedule.countDocuments(query);

//     return res.status(200).json({
//       success: true,
//       data: filteredSchedules,
//       total: totalCount,
//       page: parseInt(page),
//       limit: parseInt(limit),
//       totalPages: Math.ceil(totalCount / limit),
//     });
//   } catch (error) {
//     console.error("❌ Error fetching schedules:", error);
//     res.status(500).json({
//       success: false,
//       message: "Internal server error",
//       error: error.message,
//     });
//   }
// };

// Edit beat mapping for admin
exports.editWeeklyBeatMappingScheduleByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { day } = req.query;
    const { schedule: updateData, code, name } = req.body;

    const schedule = await WeeklyBeatMappingSchedule.findById(id);
    if (!schedule) {
      return res.status(404).json({ message: "Schedule not found" });
    }

    schedule.name = name;
    schedule.code = code;

    const calculateStats = (schedule) => {
      let total = 0,
        done = 0;

      Object.keys(schedule).forEach((dayKey) => {
        if (Array.isArray(schedule[dayKey])) {
          total += schedule[dayKey].length;
          done += schedule[dayKey].filter(
            (dealer) => dealer.status === "done"
          ).length;
        }
      });

      return { total, done, pending: total - done };
    };

    // Add default values for latitude and longitude
    const addDefaultValues = (dealer) => ({
      ...dealer,
      latitude: dealer.latitude || "0.0",
      longitude: dealer.longitude || "0.0",
    });

    // If a specific day is provided, update that day's schedule
    if (
      day &&
      ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].includes(day)
    ) {
      const existingDealersMap = new Map(
        schedule.schedule[day].map((dealer) => [dealer._id.toString(), dealer])
      );

      const updatedSchedule = Array.isArray(updateData[day])
        ? updateData[day].map((dealer) =>
            existingDealersMap.has(dealer._id)
              ? addDefaultValues({
                  ...existingDealersMap.get(dealer._id),
                  ...dealer,
                })
              : addDefaultValues(dealer)
          )
        : [];

      schedule.schedule[day] = updatedSchedule;
    } else {
      // If no specific day is provided, update the entire schedule
      Object.keys(updateData).forEach((dayKey) => {
        if (schedule.schedule[dayKey]) {
          const existingDealersMap = new Map(
            schedule.schedule[dayKey].map((dealer) => [
              dealer._id.toString(),
              dealer,
            ])
          );

          const updatedSchedule = Array.isArray(updateData[dayKey])
            ? updateData[dayKey].map((dealer) =>
                existingDealersMap.has(dealer._id)
                  ? addDefaultValues({
                      ...existingDealersMap.get(dealer._id),
                      ...dealer,
                    })
                  : addDefaultValues(dealer)
              )
            : [];

          schedule.schedule[dayKey] = updatedSchedule;
        }
      });
    }

    // ✅ Automatically update total, pending, and done
    const { total, done, pending } = calculateStats(schedule.schedule);
    schedule.total = total;
    schedule.done = done;
    schedule.pending = pending;

    await schedule.save();

    res
      .status(200)
      .json({ message: "Schedule updated successfully", schedule });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.getAllWeeklyBeatMapping = async (req, res) => {
  try {
    const { status, search = "", page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = {};

    // Step 1: Filter matching employee codes by name/code (if search is provided)
    if (search) {
      const matchedActors = await ActorCode.find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { code: { $regex: search, $options: "i" } },
        ],
      }).lean();

      const matchedCodes = matchedActors.map((actor) => actor.code);
      if (matchedCodes.length === 0) {
        return res.status(200).json({
          success: true,
          message: "No results found",
          data: [],
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit),
        });
      }
      query.code = { $in: matchedCodes };
    }

    // Step 2: Count total before pagination
    const totalCount = await WeeklyBeatMappingSchedule.countDocuments(query);

    // Step 3: Fetch paginated beat mappings
    const mappings = await WeeklyBeatMappingSchedule.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select("code schedule done pending createdAt updatedAt")
      .lean();

    // Step 4: Get names for all unique codes
    const codes = [...new Set(mappings.map((m) => m.code))];
    const actorDocs = await ActorCode.find({ code: { $in: codes } }).lean();
    const actorMap = {};
    actorDocs.forEach((actor) => {
      actorMap[actor.code] = actor.name;
    });

    // Step 5: Group data
    const groupedResult = {};

    for (const mapping of mappings) {
      const empCode = mapping.code;
      const empName = actorMap[empCode] || "Unknown";

      // Filter schedule by status if needed
      let filteredSchedule = mapping.schedule;

      if (status === "done" || status === "pending") {
        filteredSchedule = {};
        for (const [day, dealers] of Object.entries(mapping.schedule)) {
          const filtered = dealers.filter((d) => d.status === status);
          if (filtered.length > 0) {
            filteredSchedule[day] = filtered;
          }
        }
        if (Object.keys(filteredSchedule).length === 0) continue;
      }

      if (!groupedResult[empCode]) {
        groupedResult[empCode] = {
          code: empCode,
          employeeName: empName,
          totalDone: mapping.done || 0,
          totalPending: mapping.pending || 0,
          beatMappings: [],
        };
      }

      groupedResult[empCode].beatMappings.push({
        ...mapping,
        schedule: filteredSchedule,
      });
    }

    const groupedArray = Object.values(groupedResult);

    res.status(200).json({
      success: true,
      message: `Weekly Beat Mappings${
        status ? ` with status "${status}"` : ""
      }`,
      data: groupedArray,
      total: totalCount,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error("Error fetching weekly beat mappings:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// Rakshita new
const parseLatLong = (val) => {
  if (!val) return 0.0;

  // If Decimal128 object (from Mongo or Mongoose)
  if (typeof val === "object" && val.$numberDecimal) {
    return parseFloat(val.$numberDecimal);
  }

  // If Mongoose Decimal128 instance
  if (typeof val.toString === "function") {
    return parseFloat(val.toString());
  }

  // If plain number
  if (typeof val === "number") {
    return val;
  }

  // Fallback
  return 0.0;
};

exports.addDailyBeatMapping = async (req, res) => {
  try {
    const IST_START = moment().tz("Asia/Kolkata").startOf("day").toDate(); // 12:00 AM IST
    const IST_END = moment().tz("Asia/Kolkata").endOf("day").toDate(); // 11:59 PM IST

    const hierarchy = await HierarchyEntries.find({
      hierarchy_name: "default_sales_flow",
    });

    // Step 1: Map ASM to all dealers & MDDs under them
    const asmMap = {}; // { asmCode: { dealers: Set, mdds: Set } }

    hierarchy.forEach((entry) => {
      const asm = entry.asm;
      if (!asmMap[asm]) {
        asmMap[asm] = { dealers: new Set(), mdds: new Set() };
      }
      if (entry.dealer) asmMap[asm].dealers.add(entry.dealer);
      if (entry.mdd) asmMap[asm].mdds.add(entry.mdd);
    });

    let insertedCount = 0;

    for (const asmCode in asmMap) {
      const exists = await WeeklyBeatMappingSchedule.findOne({
        code: asmCode,
        startDate: IST_START,
        endDate: IST_END,
      });
      if (exists) continue; // Skip if already created

      const dealerCodes = Array.from(asmMap[asmCode].dealers);
      const mddCodes = Array.from(asmMap[asmCode].mdds);

      const users = await User.find({
        code: { $in: [...dealerCodes, ...mddCodes] },
        position: { $in: ["dealer", "mdd"] },
      });

      const schedule = users.map((user) => ({
        code: user.code,
        name: user.name,
        latitude: user.latitude || 0.0,
        longitude: user.longitude || 0.0,
        status: "pending",
        distance: null,
        district: user.district || "",
        taluka: user.taluka || "",
        zone: user.zone || "",
        position: user.position || "",
      }));

      const total = schedule.length;

      await WeeklyBeatMappingSchedule.create({
        startDate: IST_START,
        endDate: IST_END,
        code: asmCode,
        schedule,
        total,
        done: 0,
        pending: total,
      });

      insertedCount++;
    }
    if (insertedCount === 0)
      return res.status(200).json({
        success: true,
        message: "Beat mapping already created for today.",
        totalMappedASMs: 0,
      });

    return res.status(201).json({
      success: true,
      message: `${insertedCount} beat mapping created successfully.`,
      totalMappedASMs: insertedCount,
    });
  } catch (error) {
    console.error("Error in daily beat mapping:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.getBeatMappingReport = async (req, res) => {
  try {
    let {
      startDate,
      endDate,
      status = [],
      zone = [],
      district = [],
      taluka = [],
      town = [],
      travel = [],
      code, // only for admin
      routes
    } = req.body;

    console.log("Routesss: ", routes, code);

    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Start and End date are required" });
    }

    startDate = moment.tz(startDate, "Asia/Kolkata").startOf("day").toDate();
    endDate = moment.tz(endDate, "Asia/Kolkata").endOf("day").toDate();

    const userCode = req.user.role === "admin" ? code : req.user.code;

    if (!userCode) {
      return res.status(400).json({ error: "User code is missing" });
    }

    // Fetch all schedules in date range
    const schedules = await WeeklyBeatMappingSchedule.find({
      code: userCode,
      startDate: { $gte: startDate },
      endDate: { $lte: endDate },
    });

    const dealerMap = {}; // key: code

    // Consolidate data
    for (const entry of schedules) {
      for (const dealer of entry.schedule) {
        const dCode = dealer.code;

        if (!dealerMap[dCode]) {
          dealerMap[dCode] = {
            code: dCode,
            name: dealer.name,
            zone: dealer.zone || "Unknown",
            district: dealer.district || "Unknown",
            taluka: dealer.taluka || "Unknown",
            town: dealer.town || "Unknown",
            position: dealer.position || "dealer",
            visits: 0,
            doneCount: 0,
            totalAppearances: 0,
            latitude: parseLatLong(dealer.latitude),
            longitude: parseLatLong(dealer.longitude),
          };
        }

        dealerMap[dCode].totalAppearances += 1;
        if (dealer.status === "done") {
          dealerMap[dCode].doneCount += 1;
        }
      }
    }

    // Prepare response
    const result = Object.values(dealerMap).map((d) => {
      const isDone = d.doneCount > 0;
      return {
        code: d.code,
        name: d.name,
        zone: d.zone,
        district: d.district,
        taluka: d.taluka,
        town: d.town,
        position: d.position,
        status: isDone ? "done" : "pending",
        visits: isDone ? d.doneCount : 0,
        latitude: d.latitude,
        longitude: d.longitude,
      };
    });

    // Apply filters (if any)
    const filtered = result.filter((entry) => {
      const matchStatus = !status.length || status.includes(entry.status);
      const matchZone = !zone.length || zone.includes(entry.zone);
      const matchDistrict =
        !district.length || district.includes(entry.district);
      const matchTaluka = !taluka.length || taluka.includes(entry.taluka);
      const matchTown = !town.length || town.includes(entry.town);
      // Travel filter can be added here later if defined
      return (
        matchStatus && matchZone && matchDistrict && matchTaluka && matchTown
      );
    });

    // Count summary
    const total = filtered.length;
    const done = filtered.filter((d) => d.status === "done").length;
    const pending = total - done;

        // ===== Overall (current month) counts =====
    const firstDayOfMonth = moment().tz("Asia/Kolkata").startOf("month").startOf("day").toDate();
    const lastDayOfMonth = moment().tz("Asia/Kolkata").endOf("month").endOf("day").toDate();

    const overallSchedules = await WeeklyBeatMappingSchedule.find({
      code: userCode,
      startDate: { $gte: firstDayOfMonth },
      endDate: { $lte: lastDayOfMonth },
    });

    const overallDealerMap = {};

    for (const entry of overallSchedules) {
      for (const dealer of entry.schedule) {
        const dCode = dealer.code;

        if (!overallDealerMap[dCode]) {
          overallDealerMap[dCode] = {
            code: dCode,
            name: dealer.name,
            status: "pending",
            doneCount: 0,
          };
        }

        if (dealer.status === "done") {
          overallDealerMap[dCode].doneCount += 1;
          overallDealerMap[dCode].status = "done";
        }
      }
    }

    const overallResult = Object.values(overallDealerMap);

    const ovTotal = overallResult.length;
    const ovDone = overallResult.filter((d) => d.status === "done").length;
    const ovPending = ovTotal - ovDone;


    return res.status(200).json({
      total,
      done,
      pending,
      ovTotal,
      ovDone,
      ovPending,
      data: filtered,
    });
  } catch (error) {
    console.error("Error in getBeatMappingReport:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// exports.getBeatMappingReport = async (req, res) => {
//   try {
//     let {
//       startDate,
//       endDate,
//       status = [],
//       zone = [],
//       district = [],
//       taluka = [],
//       town = [],
//       travel = [],
//       code, // only for admin
//       routes
//     } = req.body;

//     console.log("Routesss: ", routes);

//     if (!startDate || !endDate) {
//       return res.status(400).json({ error: "Start and End date are required" });
//     }

//     startDate = moment.tz(startDate, "Asia/Kolkata").startOf("day").toDate();
//     endDate = moment.tz(endDate, "Asia/Kolkata").endOf("day").toDate();

//     const userCode = req.user.role === "admin" ? code : req.user.code;

//     if (!userCode) {
//       return res.status(400).json({ error: "User code is missing" });
//     }

//     // Fetch all schedules in date range
//     const schedules = await WeeklyBeatMappingSchedule.find({
//       code: userCode,
//       startDate: { $gte: startDate },
//       endDate: { $lte: endDate },
//     });

//     const dealerMap = {}; // key: code

//     // Consolidate data
//     for (const entry of schedules) {
//       for (const dealer of entry.schedule) {
//         const dCode = dealer.code;

//         if (!dealerMap[dCode]) {
//           dealerMap[dCode] = {
//             code: dCode,
//             name: dealer.name,
//             zone: dealer.zone || "Unknown",
//             district: dealer.district || "Unknown",
//             taluka: dealer.taluka || "Unknown",
//             town: dealer.town || "Unknown",
//             position: dealer.position || "dealer",
//             visits: 0,
//             doneCount: 0,
//             totalAppearances: 0,
//             latitude: parseLatLong(dealer.latitude),
//             longitude: parseLatLong(dealer.longitude),
//           };
//         }

//         dealerMap[dCode].totalAppearances += 1;
//         if (dealer.status === "done") {
//           dealerMap[dCode].doneCount += 1;
//         }
//       }
//     }

//     // Prepare response
//     const result = Object.values(dealerMap).map((d) => {
//       const isDone = d.doneCount > 0;
//       return {
//         code: d.code,
//         name: d.name,
//         zone: d.zone,
//         district: d.district,
//         taluka: d.taluka,
//         town: d.town,
//         position: d.position,
//         status: isDone ? "done" : "pending",
//         visits: isDone ? d.doneCount : 0,
//         latitude: d.latitude,
//         longitude: d.longitude,
//       };
//     });

//     // Apply filters (if any)
//     const filtered = result.filter((entry) => {
//       const matchStatus = !status.length || status.includes(entry.status);
//       const matchZone = !zone.length || zone.includes(entry.zone);
//       const matchDistrict =
//         !district.length || district.includes(entry.district);
//       const matchTaluka = !taluka.length || taluka.includes(entry.taluka);
//       const matchTown = !town.length || town.includes(entry.town);
//       // Travel filter can be added here later if defined
//       return (
//         matchStatus && matchZone && matchDistrict && matchTaluka && matchTown
//       );
//     });

//     // Count summary
//     const total = filtered.length;
//     const done = filtered.filter((d) => d.status === "done").length;
//     const pending = total - done;

//     return res.status(200).json({
//       total,
//       done,
//       pending,
//       data: filtered,
//     });
//   } catch (error) {
//     console.error("Error in getBeatMappingReport:", error);
//     return res.status(500).json({ error: "Internal Server Error" });
//   }
// };

exports.getDropdownValuesForBeatMappingFilters = async (req, res) => {
  try {
    const { field } = req.query;

    if (!field) {
      return res.status(400).json({ error: "Field query param is required." });
    }

    // Static dropdown
    if (field === "status") {
      return res.status(200).json({ values: ["done", "pending"] });
    }

    // Allowed dynamic fields
    const allowedFields = ["zone", "district", "taluka"];
    if (!allowedFields.includes(field)) {
      return res
        .status(400)
        .json({ error: "Invalid dropdown field requested." });
    }

    // Get distinct values from User model
    const values = await User.distinct(field, {
      position: { $in: ["dealer", "mdd"] },
    });

    return res.status(200).json({ values: values.filter(Boolean).sort() }); // remove nulls/empties
  } catch (error) {
    console.error("Error in getDropdownValuesForBeatMappingFilters:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// exports.markDealerDone = async (req, res) => {
//   try {
//     console.log("Done rach")
//     const { dealerCode, distance } = req.body;
//     const userCode = req.user.code;

//     if (!dealerCode || distance === undefined) {
//       return res.status(400).json({ message: "dealerCode and distance are required " });
//     }

//     // ✅ Distance check: should not be more than 0.2 km (200 meters)
//     if (distance > 0.2) {
//       return res
//         .status(400)
//         .json({ message: "You are more than 200 meters away from the dealer" });
//     }

//     const nowIST = moment().tz("Asia/Kolkata");

//     const scheduleDoc = await WeeklyBeatMappingSchedule.findOne({
//       code: userCode,
//       startDate: { $lte: nowIST.toDate() },
//       endDate: { $gte: nowIST.toDate() },
//     });

//     if (!scheduleDoc) {
//       return res.status(404).json({ message: "No active schedule found" });
//     }

//     const dealer = scheduleDoc.schedule.find(d => d.code === dealerCode);

//     if (!dealer) {
//       return res.status(404).json({ message: "Dealer not found in schedule" });
//     }

//     if (dealer.status === "done") {
//       return res.status(200).json({ message: "Already marked as done" });
//     }

//     dealer.status = "done";
//     dealer.distance = distance;

//     scheduleDoc.done += 1;
//     scheduleDoc.pending -= 1;

//     await scheduleDoc.save();

//     return res
//       .status(200)
//       .json({ message: "Dealer marked as done successfully" });
//   } catch (error) {
//     console.error("Error in markDealerDone:", error);
//     return res.status(500).json({ message: "Internal Server Error" });
//   }
// };

exports.markDealerDone = async (req, res) => {
  try {
    console.log("Done rach");
    const { dealerCode, distance } = req.body;
    const {userLat, userLng, dealerLat, dealerLng} = req.body;
    console.log("COORDS: ", userLat, userLng, dealerLat, dealerLng)
    const userCode = req.user.code;
    console.log("Distance: ", distance);

    if (!dealerCode || distance === undefined) {
      return res
        .status(400)
        .json({ message: "dealerCode and distance are required" });
    }

    // ✅ Distance check: should not be more than 0.2 km (200 meters)
    if (distance > 0.2) {
      return res
        .status(400)
        .json({ message: `You are more than 200 meters (${distance}m) away from the dealer` });
    }

    const nowIST = moment().tz("Asia/Kolkata");

    const scheduleDoc = await WeeklyBeatMappingSchedule.findOne({
      code: userCode,
      startDate: { $lte: nowIST.toDate() },
      endDate: { $gte: nowIST.toDate() },
    });

    if (!scheduleDoc) {
      return res.status(404).json({ message: "No active schedule found" });
    }

    const dealer = scheduleDoc.schedule.find((d) => d.code === dealerCode);

    if (!dealer) {
      return res.status(404).json({ message: "Dealer not found in schedule" });
    }

    if (dealer.status === "done") {
      return res.status(200).json({ message: "Already marked as done" });
    }

    dealer.status = "done";
    dealer.distance = distance;

    scheduleDoc.done += 1;
    scheduleDoc.pending -= 1;

    await scheduleDoc.save();

    return res
      .status(200)
      .json({ message: "Dealer marked as done successfully" });
  } catch (error) {
    console.error("Error in markDealerDone:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

//get Employee schedules by code
exports.getEmployeeSchedulesByCode = async (req, res) => {
  const { code } = req.query || (req.user && req.user.code);
  let { startDate, endDate, status, search } = req.query; // Use query params for GET request

  try {
    if (!code) {
      return res.status(400).json({ error: "Employee code is required." });
    }

    // Build Mongo filter
    const scheduleFilters = { code };

    if (startDate && endDate) {
      const start = new Date(new Date(startDate).setUTCHours(0, 0, 0, 0));
      const end = new Date(new Date(endDate).setUTCHours(23, 59, 59, 999));

      scheduleFilters.$or = [
        {
          startDate: { $lte: end },
          endDate: { $gte: start },
        },
      ];
    }

    const employeeData = await WeeklyBeatMappingSchedule.find(scheduleFilters)
      .sort({ createdAt: -1 }) // descending: latest first
      .lean();

    if (!employeeData) {
      return res.status(404).json({ message: "Employee not found." });
    }

    const totalCounts = [];
    let total = 0;
    let totalDone = 0;
    let totalPending = 0;
    for (const emp of employeeData) {
      totalDone += emp.done;
      totalPending += emp.pending;
    }

    total = totalDone + totalPending;

    totalCounts.push({
      total,
      done: totalDone,
      pending: totalPending,
    });

    // console.log("→ Mongo filter:", JSON.stringify(scheduleFilters));

    // Fetch all matching beat schedules
    const beatMappings = await WeeklyBeatMappingSchedule.find(scheduleFilters)
      .sort({ startDate: -1 }) // descending: latest first
      .lean();

    // console.log("→ beatMappings found:", beatMappings.length);

    if (beatMappings.length === 0) {
      return res
        .status(404)
        .json({ message: "No schedules found for this employee." });
    }

    // Flatten dealer entries from each beatMapping schedule
    let allDealers = [];
    beatMappings.forEach((bm, idx) => {
      // console.log(`  • mapping[${idx}] _id=${bm._id}, dates=${bm.startDate.toISOString()}→${bm.endDate.toISOString()}`);
      bm.schedule.forEach((dealer) => {
        allDealers.push({
          scheduleId: bm._id,
          dealerId: dealer._id,
          code: dealer.code,
          name: dealer.name,
          latitude: Number(
            dealer.latitude?.$numberDecimal || dealer.latitude || 0
          ),
          longitude: Number(
            dealer.longitude?.$numberDecimal || dealer.longitude || 0
          ),
          position: dealer.position || "",
          district: dealer.district || "",
          taluka: dealer.taluka || "",
          zone: dealer.zone || "",
          status: dealer.status,
          distance: dealer.distance || null,
          startDate: bm.startDate,
          endDate: bm.endDate,
        });
      });
    });
    // console.log("→ total dealer entries flattened:", allDealers.length);

    // Apply status / search filters if present
    if (status) {
      allDealers = allDealers.filter((d) => d.status === status);
    }
    if (search) {
      const re = new RegExp(search, "i");
      allDealers = allDealers.filter(
        (d) =>
          re.test(d.code) ||
          re.test(d.name) ||
          re.test(d.district) ||
          re.test(d.taluka) ||
          re.test(d.zone)
      );
    }

    // Fetch the employee record
    const employee = await ActorCode.findOne({ code }).lean();

    // Return everything
    return res.status(200).json({
      totalCounts,
      employee,
      dealers: allDealers,
    });
  } catch (err) {
    console.error("Error fetching employee schedules:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

//edit employee schedules
exports.editEmployeeSchedulesByCode = async (req, res) => {
  const { code } = req.params;
  const schedule = req.body;

  try {
    if (!code || !schedule || !schedule.id) {
      return res
        .status(400)
        .json({ error: "Employee code and schedule.id are required." });
    }

    // Step 1: Find the document and the dealer
    const scheduleDoc = await WeeklyBeatMappingSchedule.findOne({
      code,
      "schedule._id": schedule.id,
    });

    if (!scheduleDoc) {
      return res.status(404).json({ message: "Dealer schedule not found." });
    }

    const dealerIndex = scheduleDoc.schedule.findIndex(
      (d) => d._id.toString() === schedule.id
    );
    if (dealerIndex === -1) {
      return res.status(404).json({ message: "Dealer not found in schedule." });
    }

    const currentDealer = scheduleDoc.schedule[dealerIndex];
    const oldStatus = currentDealer.status;

    // Step 2: If name is changed, update fields from master
    if (schedule.code && schedule.code !== currentDealer.code) {
      const masterDealer = await User.findOne({ code: schedule.code });
      if (!masterDealer) {
        return res
          .status(404)
          .json({ error: "No matching dealer found in master records." });
      }

      // Replace key fields from master record + provided status/distance if included
      scheduleDoc.schedule[dealerIndex] = {
        ...currentDealer.toObject(),
        code: masterDealer.code,
        name: masterDealer.name,
        latitude: masterDealer.latitude,
        longitude: masterDealer.longitude,
        district: masterDealer.district,
        taluka: masterDealer.taluka,
        zone: masterDealer.zone,
        position: masterDealer.position,
        status: schedule.status || currentDealer.status,
        distance: schedule.distance || currentDealer.distance,
      };
    } else if (schedule.status && schedule.status !== oldStatus) {
      // Step 3: Only allow status change if name is same
      scheduleDoc.schedule[dealerIndex].status = schedule.status;
    }

    // Step 4: Update done/pending count if status was changed
    if (schedule.status && schedule.status !== oldStatus) {
      let doneCount = 0,
        pendingCount = 0;
      scheduleDoc.schedule.forEach((dealer) => {
        if (dealer.status === "done") doneCount++;
        else if (dealer.status === "pending") pendingCount++;
      });

      scheduleDoc.done = doneCount;
      scheduleDoc.pending = pendingCount;
    }

    // Step 5: Save the update
    await scheduleDoc.save();

    return res.status(200).json({
      message: "Dealer schedule updated successfully.",
      updatedDealer: scheduleDoc.schedule[dealerIndex],
      totalDone: scheduleDoc.totalDone,
      totalPending: scheduleDoc.totalPending,
    });
  } catch (err) {
    console.error("Error updating employee schedules:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.getFilteredBeatMapping = async (req, res) => {
  try {
    console.log("Hereee");
    let {
      startDate,
      endDate,
      status = [],
      zone = [],
      district = [],
      taluka = [],
      dealers = [],
      routes = [],
      code, // for admin
    } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Start and End date are required" });
    }

    startDate = moment.tz(startDate, "Asia/Kolkata").startOf("day").toDate();
    endDate = moment.tz(endDate, "Asia/Kolkata").endOf("day").toDate();

    const userCode = req.user.role === "admin" ? code : req.user.code;
    if (!userCode)
      return res.status(400).json({ error: "User code is missing" });

    // Fetch beat mappings
    const schedules = await WeeklyBeatMappingSchedule.find({
      code: userCode,
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    });

    // Get all route plans if route filters are provided (by _id or name)
    let routeItineraryFilters = [];
    if (routes.length > 0) {
      const routeQuery = {
        code: userCode,
        startDate: { $lte: endDate },
        endDate: { $gte: startDate },
        $or: [
          {
            _id: {
              $in: routes.filter((id) => mongoose.Types.ObjectId.isValid(id)),
            },
          },
          { name: { $in: routes } },
        ],
      };

      const routePlans = await RoutePlan.find(routeQuery);

      for (const route of routePlans) {
        const { itinerary } = route;
        const filter = {};
        if (itinerary.zone?.length) filter.zone = itinerary.zone;
        if (itinerary.district?.length) filter.district = itinerary.district;
        if (itinerary.taluka?.length) filter.taluka = itinerary.taluka;
        routeItineraryFilters.push(filter);
      }
    }

    const dealerMap = {}; // key: code

    for (const entry of schedules) {
      for (const dealer of entry.schedule) {
        const dCode = dealer.code;

        if (!dealerMap[dCode]) {
          dealerMap[dCode] = {
            code: dCode,
            name: dealer.name,
            zone: dealer.zone || "Unknown",
            district: dealer.district || "Unknown",
            taluka: dealer.taluka || "Unknown",
            position: dealer.position || "dealer",
            visits: 0,
            doneCount: 0,
            totalAppearances: 0,
            latitude: dealer.latitude || null,
            longitude: dealer.longitude || null,
            status: dealer.status || "pending",
          };
        }

        dealerMap[dCode].totalAppearances += 1;
        if (dealer.status === "done") {
          dealerMap[dCode].doneCount += 1;
        }
      }
    }

    const result = Object.values(dealerMap).map((d) => {
      const isDone = d.doneCount > 0;
      return {
        code: d.code,
        name: d.name,
        zone: d.zone,
        district: d.district,
        taluka: d.taluka,
        position: d.position,
        status: isDone ? "done" : "pending",
        visits: isDone ? d.doneCount : 0,
        latitude: d.latitude,
        longitude: d.longitude,
      };
    });

    // Apply all filters
    const filtered = result.filter((entry) => {
      const matchStatus = !status.length || status.includes(entry.status);
      const matchZone = !zone.length || zone.includes(entry.zone);
      const matchDistrict =
        !district.length || district.includes(entry.district);
      const matchTaluka = !taluka.length || taluka.includes(entry.taluka);
      const matchDealer = !dealers.length || dealers.includes(entry.code);

      let matchRoute = true;
      if (routeItineraryFilters.length > 0) {
        matchRoute = routeItineraryFilters.some((f) => {
          return (
            (!f.zone || f.zone.includes(entry.zone)) &&
            (!f.district || f.district.includes(entry.district)) &&
            (!f.taluka || f.taluka.includes(entry.taluka))
          );
        });
      }

      return (
        matchStatus &&
        matchZone &&
        matchDistrict &&
        matchTaluka &&
        matchDealer &&
        matchRoute
      );
    });

    const total = filtered.length;
    const done = filtered.filter((d) => d.status === "done").length;
    const pending = total - done;

    return res.status(200).json({
      total,
      done,
      pending,
      data: filtered,
    });
  } catch (error) {
    console.error("Error in getFilteredBeatMapping:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

//delete weekly beat mapping schedule
exports.deleteDealerFromSchedule = async (req, res) => {
  try {
    const securityKey = req.query.securityKey;
    if (!securityKey) {
      return res
        .status(400)
        .json({ success: false, message: "Security key is required" });
    }
    //check the security key of admin and super admin
    const isMatch = await bcrypt.compare(securityKey, req.user.securityKey);
    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, message: "Security key is incorrect" });
    }
    const { scheduleId, dealerID } = req.params;
    const deletedBy = {
      name: req.user?.name || "unknown",
      code: req.user?.code || "unknown",
    };

    if (!scheduleId || !dealerID) {
      return res.status(400).json({
        success: false,
        message: "Schedule ID and dealer code are required",
      });
    }

    const schedule = await WeeklyBeatMappingSchedule.findById(scheduleId);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found",
      });
    }

    const dealerDoc = schedule.schedule.find(
      (d) => d._id.toString() === dealerID
    );

    if (!dealerDoc) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found in schedule",
      });
    }

    // Attach beat mapping ID for DeletedData logging
    const dealerData = {
      ...dealerDoc.toObject(),
      BeatMappingID: schedule._id,
    };

    // ✅ ACTUAL DELETE
    schedule.schedule = schedule.schedule.filter(
      (d) => d._id.toString() !== dealerID
    );

    // Update counts
    schedule.total = schedule.schedule.length;
    schedule.done = schedule.schedule.filter((d) => d.status === "done").length;
    schedule.pending = schedule.total - schedule.done;

    await schedule.save();

    await DeletedData.create({
      collectionName: "DealerSchedule",
      data: dealerData,
      deletedBy,
    });

    return res.status(200).json({
      success: true,
      message: "Dealer deleted successfully",
      data: {
        scheduleId: schedule._id,
        deletedDealer: dealerDoc,
        updatedCounts: {
          total: schedule.total,
          done: schedule.done,
          pending: schedule.pending,
        },
      },
    });
  } catch (error) {
    console.error("Error deleting dealer from schedule:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.getWeeklyBeatMappingScheduleForAdmin = async (req, res) => {
  try {
    const { startDate, endDate, search } = req.query;

    // Validate date formats (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!startDate) {
      return res.status(400).json({
        success: false,
        message: "startDate is required.",
      });
    }
    if (!dateRegex.test(startDate)) {
      return res.status(400).json({
        success: false,
        message: "Invalid startDate format. Use YYYY-MM-DD.",
      });
    }
    if (endDate && !dateRegex.test(endDate)) {
      return res.status(400).json({
        success: false,
        message: "Invalid endDate format. Use YYYY-MM-DD.",
      });
    }

    // Set start and end dates
    let start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    let end = endDate ? new Date(endDate) : new Date(start);
    end.setHours(23, 59, 59, 999);

    // Query for schedules that overlap with the date range
    let query = {
      startDate: { $lte: end },
      endDate: { $gte: start },
    };

    // Fetch employees
    const employees = await User.find(
      { role: { $in: ["admin", "employee"] } },
      "code name"
    ).lean();

    const employeeMap = employees.reduce((acc, emp) => {
      acc[emp.code.trim().toLowerCase()] = emp.name;
      return acc;
    }, {});

    // Fetch all schedules
    const schedules = await WeeklyBeatMappingSchedule.find(query).lean();

    // Fetch route plans for the date range
    const routePlans = await RoutePlan.find({
      startDate: { $lte: end },
      endDate: { $gte: start },
    }).lean();

    // Group schedules by employee code
    const scheduleMap = new Map();

    for (const schedule of schedules) {
      const normalizedCode = schedule.code?.trim().toLowerCase();
      if (!normalizedCode) continue;

      if (!scheduleMap.has(normalizedCode)) {
        scheduleMap.set(normalizedCode, {
          code: schedule.code,
          name: employeeMap[normalizedCode] || "Unknown",
          startDate: schedule.startDate,
          endDate: schedule.endDate,
          dealersMap: new Map(),
          routes: [],
          _id: schedule._id,
        });
      }

      for (const dealer of schedule.schedule || []) {
        const dealerCode = dealer.code || dealer._id || JSON.stringify(dealer);
        const dealerStatus = dealer.status || "pending";
        const key = dealerCode;

        const existing = scheduleMap.get(normalizedCode).dealersMap.get(key);

        if (!existing) {
          scheduleMap.get(normalizedCode).dealersMap.set(key, {
            ...dealer,
            status: dealerStatus,
            visited: dealerStatus === "done" ? 1 : 0,
          });
        } else if (dealerStatus === "done") {
          scheduleMap.get(normalizedCode).dealersMap.set(key, {
            ...dealer,
            status: dealerStatus,
            visited: (existing.visited || 0) + 1,
          });
        }
      }

      // Match routes using UTC date comparison
      const matchingRoutes = routePlans.filter((route) => {
        const routeStart = new Date(route.startDate).setUTCHours(0, 0, 0, 0);
        const routeEnd = new Date(route.endDate).setUTCHours(0, 0, 0, 0);
        const scheduleStart = new Date(schedule.startDate).setUTCHours(0, 0, 0, 0);
        const scheduleEnd = new Date(schedule.endDate).setUTCHours(0, 0, 0, 0);

        return (
          route.code === schedule.code &&
          routeStart === scheduleStart &&
          routeEnd === scheduleEnd
        );
      });

      const routeDetails = matchingRoutes.map((route) => ({
        name: route.name,
        id: route._id,
        status: route.status,
        itinerary: {
          zones: route.itinerary?.zone || [],
          districts: route.itinerary?.district || [],
          talukas: route.itinerary?.taluka || [],
          town: route.itinerary?.town || []
        },
      }));

      scheduleMap.get(normalizedCode).routes.push(...routeDetails);
    }

    // Build final formatted results
    let formattedSchedules = Array.from(scheduleMap.values()).map((entry) => {
      const dealers = Array.from(entry.dealersMap.values());

      const total = dealers.length;
      const done = dealers.filter((d) => d.status === "done").length;
      const pending = dealers.filter((d) => d.status === "pending").length;
      const visited = dealers.reduce((acc, d) => acc + (d.visited || 0), 0);

      return {
        _id: entry._id,
        code: entry.code,
        name: entry.name,
        total,
        done,
        pending,
        visited,
        schedule: dealers,
        routes: entry.routes,
      };
    });

    // Apply search filter
    if (search) {
      const searchRegex = new RegExp(search, "i");
      formattedSchedules = formattedSchedules.filter(
        (schedule) =>
          searchRegex.test(schedule.code) ||
          searchRegex.test(schedule.name) ||
          searchRegex.test(schedule.routes.map((r) => r.name).join(" "))
      );
    }

    // Sort schedules by "done" count
    formattedSchedules.sort((a, b) => b.done - a.done);

    return res.status(200).json({
      success: true,
      data: formattedSchedules,
      total: formattedSchedules.length,
    });
  } catch (error) {
    console.error("❌ Error fetching schedules:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


// exports.getBeatMappingOverviewForAdminApp = async (req, res) => {
//   try {
//     let { startDate, endDate, positions = [] } = req.body;

//     if (!startDate || !endDate) {
//       return res.status(400).json({ error: "Start and End date are required" });
//     }

//     positions = positions.length ? positions : ['asm'];

//     endDate = moment.tz(endDate, "Asia/Kolkata").endOf("day").toDate();
//     const firstDayOfMonth = moment().tz("Asia/Kolkata").startOf("month").startOf("day").toDate();
//     const lastDayOfMonth = moment().tz("Asia/Kolkata").endOf("month").endOf("day").toDate();

//     // Get users by position
//     const users = await User.find({ position: { $in: positions } });
//     const userCodes = users.map(u => u.code);

//     // 🔹 Fetch schedules using only endDate logic
//     const allSchedules = await WeeklyBeatMappingSchedule.find({
//       code: { $in: userCodes },
//       endDate: { $lte: endDate }
//     });

//     const allMonthSchedules = await WeeklyBeatMappingSchedule.find({
//       code: { $in: userCodes },
//       endDate: { $lte: lastDayOfMonth }
//     });

//     const result = [];

//     for (const user of users) {
//       const userCode = user.code;

//       // Filter schedules for this user
//       const userSchedules = allSchedules.filter(s => s.code === userCode);
//       const userMonthSchedules = allMonthSchedules.filter(s => s.code === userCode);

//       // === Current Range Count ===
//       const dealerMap = {};
//       for (const entry of userSchedules) {
//         for (const dealer of entry.schedule) {
//           const dCode = dealer.code;
//           if (!dealerMap[dCode]) {
//             dealerMap[dCode] = { done: dealer.status === 'done' };
//           } else if (dealer.status === 'done') {
//             dealerMap[dCode].done = true;
//           }
//         }
//       }

//       const total = Object.keys(dealerMap).length;
//       const done = Object.values(dealerMap).filter(d => d.done).length;

//       // === Overview (Monthly) Count ===
//       const ovDealerMap = {};
//       for (const entry of userMonthSchedules) {
//         for (const dealer of entry.schedule) {
//           const dCode = dealer.code;
//           if (!ovDealerMap[dCode]) {
//             ovDealerMap[dCode] = { done: dealer.status === 'done' };
//           } else if (dealer.status === 'done') {
//             ovDealerMap[dCode].done = true;
//           }
//         }
//       }

//       const ovTotal = Object.keys(ovDealerMap).length;
//       const ovDone = Object.values(ovDealerMap).filter(d => d.done).length;

//       result.push({
//         code: user.code,
//         name: user.name,
//         position: user.position,
//         total,
//         done,
//         pending: total - done,
//         ovTotal,
//         ovDone,
//         ovPending: ovTotal - ovDone,
//       });
//     }

//     return res.status(200).json({ data: result });

//   } catch (error) {
//     console.error("Error in getBeatMappingOverviewForAdminApp:", error);
//     return res.status(500).json({ error: "Internal Server Error" });
//   }
// };


exports.getBeatMappingOverviewForAdminApp = async (req, res) => {
  try {
    let { startDate, endDate, positions = [] } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Start and End date are required" });
    }

    positions = positions.length ? positions : ['asm'];

    // Parse and set range
    const start = moment.tz(startDate, "Asia/Kolkata").startOf("day").toDate();
    const end = moment.tz(endDate, "Asia/Kolkata").endOf("day").toDate();
    const monthStart = moment(start).startOf("month").startOf("day").toDate();
    const monthEnd = moment(start).endOf("month").endOf("day").toDate();

    // 🔹 Step 1: Get users
    const users = await User.find({ position: { $in: positions } }).lean();
    const userCodes = users.map(u => u.code);

    // 🔹 Step 2: Fetch schedules in parallel
    const [rangeSchedules, monthSchedules] = await Promise.all([
      WeeklyBeatMappingSchedule.find({
        code: { $in: userCodes },
        endDate: { $gte: start, $lte: end }
      }).lean(),

      WeeklyBeatMappingSchedule.find({
        code: { $in: userCodes },
        endDate: { $gte: monthStart, $lte: monthEnd }
      }).lean(),
    ]);

    const result = [];

    for (const user of users) {
      const userCode = user.code;

      // Filter for this user
      const userSchedules = rangeSchedules.filter(s => s.code === userCode);
      const userMonthSchedules = monthSchedules.filter(s => s.code === userCode);

      // 🔸 Date-range dealers (Today)
      const dealerMap = new Map();
      for (const entry of userSchedules) {
        for (const dealer of entry.schedule) {
          if (!dealerMap.has(dealer.code)) {
            dealerMap.set(dealer.code, dealer.status === 'done');
          } else if (dealer.status === 'done') {
            dealerMap.set(dealer.code, true);
          }
        }
      }
      const total = dealerMap.size;
      const done = [...dealerMap.values()].filter(Boolean).length;

      // 🔸 Month overview dealers
      const ovDealerMap = new Map();
      for (const entry of userMonthSchedules) {
        for (const dealer of entry.schedule) {
          if (!ovDealerMap.has(dealer.code)) {
            ovDealerMap.set(dealer.code, dealer.status === 'done');
          } else if (dealer.status === 'done') {
            ovDealerMap.set(dealer.code, true);
          }
        }
      }
      const ovTotal = ovDealerMap.size;
      const ovDone = [...ovDealerMap.values()].filter(Boolean).length;

      result.push({
        code: user.code,
        name: user.name,
        position: user.position,
        total,
        done,
        pending: total - done,
        ovTotal,
        ovDone,
        ovPending: ovTotal - ovDone,
      });
    }

    return res.status(200).json({ data: result });

  } catch (error) {
    console.error("Error in getBeatMappingOverviewForAdminApp:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};





