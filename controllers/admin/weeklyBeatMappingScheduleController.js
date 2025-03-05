const getDistance = require("../../helpers/attendanceHelper");
const csvParser = require("csv-parser");
const { Readable } = require("stream");
const { getCurrentWeekDates } = require("../../helpers/dateHelpers");
const WeeklyBeatMappingSchedule = require("../../model/WeeklyBeatMappingSchedule");
const User = require("../../model/User");
const HierarchyEntries = require("../../model/HierarchyEntries");

// add weekly beat mapping
exports.addWeeklyBeatMappingSchedule = async (req, res) => {
  try {
    const { startDate, endDate, code, schedule } = req.body;

    // Validate input fields
    if (!code || !startDate || !endDate || !schedule) {
      return res
        .status(400)
        .json({
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
      return res
        .status(404)
        .json({
          error:
            "No schedules found for this user within the given date range.",
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
      return res
        .status(400)
        .json({
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
                      latitude: dealer.latitude || 0.0,
                      longitude: dealer.longitude || 0.0,
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
