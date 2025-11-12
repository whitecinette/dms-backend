// controllers/common/metaDataController.js
const csvParser = require('csv-parser');
const fs = require('fs');
const moment = require('moment'); // or use native Date
const MetaData = require('../../model/MetaData');
const Attendance = require('../../model/Attendance');
const Firm = require('../../model/Firm');
const ActorCodes = require('../../model/ActorCode');
const { Parser } = require("json2csv");

exports.uploadMetadata = async (req, res) => {
 try {
   if (!req.file) {
     return res.status(400).json({ message: "CSV file is required" });
   }

   const results = [];
   const duplicatesInCSV = [];
   const conflictingEntries = [];
   const seenCodes = new Map();

   const filePath = req.file.path;

   fs.createReadStream(filePath)
     .pipe(
       csvParser({
         mapHeaders: ({ header }) =>
           header.toLowerCase().trim().replace(/\s+/g, "_"),
       })
     )
     .on("data", (row) => {
       const processedRow = {};

       for (const key in row) {
         let value = row[key]?.trim();

         if (value && value.toLowerCase() === "true") {
           processedRow[key] = true;
         } else if (!value) {
           processedRow[key] = false;
         } else {
           processedRow[key] = value;
         }
       }

       const code = processedRow.code?.toLowerCase();

       if (!code) return;

       // Check if already seen in this upload
       if (seenCodes.has(code)) {
         const existing = seenCodes.get(code);

         // Check if data differs → conflict
         const keys = Object.keys(processedRow);
         let isDifferent = false;

         for (const key of keys) {
           if (processedRow[key] !== existing[key]) {
             isDifferent = true;
             break;
           }
         }

         if (isDifferent) {
           conflictingEntries.push({
             code,
             entry1: existing,
             entry2: processedRow,
           });
         } else {
           duplicatesInCSV.push(code);
         }
       } else {
         seenCodes.set(code, processedRow);
         results.push(processedRow);
       }
     })
     .on("end", async () => {
       try {
         const codes = results.map((r) => r.code);
         const existingMeta = await MetaData.find({ code: { $in: codes } });
         const existingCodes = new Set(existingMeta.map((r) => r.code.toLowerCase()));

         const filteredResults = results.filter(
           (r) => !existingCodes.has(r.code.toLowerCase())
         );

         await MetaData.insertMany(filteredResults);
         fs.unlinkSync(filePath); // Cleanup file

         res.status(200).json({
           message: "Metadata uploaded successfully",
           insertedCount: filteredResults.length,
           skippedDueToDuplicates: results.length - filteredResults.length,
           duplicatesInCSV: [...new Set(duplicatesInCSV)],
           conflictingEntries,
         });
       } catch (err) {
         console.error("Insert error:", err);
         res.status(500).json({ message: "Failed to save metadata." });
       }
     })
     .on("error", (err) => {
       console.error("CSV parse error:", err);
       res.status(500).json({ message: "CSV parsing failed", error: err.message });
     });
 } catch (error) {
   console.error("Upload error:", error);
   res.status(500).json({ message: "Something went wrong", error: error.message });
 }
};

exports.getEmployeesForAttendanceCount = async (req, res) => {
 try {
   const moment = require("moment");

   // 1. Get all employees eligible for attendance
   const eligibleEmployees = await MetaData.find({ attendance: true });
   const employeeCodes = eligibleEmployees.map((emp) => emp.code);

   // 2. Determine date range (weekly fallback)
   let startDate, endDate;

   if (req.query.startDate && req.query.endDate) {
     startDate = moment(req.query.startDate, 'YYYY-MM-DD').startOf('day');
     endDate = moment(req.query.endDate, 'YYYY-MM-DD').endOf('day');
   } else {
     const today = moment(); // fallback to this week
     startDate = today.clone().startOf('isoWeek').startOf('day'); // Monday
     endDate = today.clone().endOf('isoWeek').endOf('day');       // Sunday
   }

   // 3. Fetch attendance in this date range
   const attendanceRecords = await Attendance.find({
     code: { $in: employeeCodes },
     date: { $gte: startDate.toDate(), $lte: endDate.toDate() },
   });

   // 4. Prepare daily summary
   const dailyMap = {};

   attendanceRecords.forEach((record) => {
     const dateStr = moment(record.date).format('YYYY-MM-DD');
     if (!dailyMap[dateStr]) {
       dailyMap[dateStr] = {
         date: dateStr,
         Present: 0,
         Leave: 0,
         'Half Day': 0,
         Pending: 0,
       };
     }
     const status = record.status;
     if (dailyMap[dateStr][status] !== undefined) {
       dailyMap[dateStr][status]++;
     }
   });

   // 5. Fill in missing days and calculate Absent
   const current = startDate.clone();
   const weeklyChartData = [];

   while (current.isSameOrBefore(endDate)) {
     const dateStr = current.format('YYYY-MM-DD');
     const dayData = dailyMap[dateStr] || {
       date: dateStr,
       Present: 0,
       Leave: 0,
       'Half Day': 0,
       Pending: 0,
     };

     const totalMarked = dayData.Present + dayData.Leave + dayData['Half Day'] + dayData.Pending;
     dayData.Absent = employeeCodes.length - totalMarked;

     weeklyChartData.push(dayData);
     current.add(1, 'day');
   }

   // 6. Count today's summary (optional if date passed)
   const selectedDate = req.query.date
     ? moment(req.query.date, 'YYYY-MM-DD')
     : moment();

   const startOfDay = selectedDate.clone().startOf('day').toDate();
   const endOfDay = selectedDate.clone().endOf('day').toDate();

   const todayAttendance = await Attendance.find({
     code: { $in: employeeCodes },
     date: { $gte: startOfDay, $lte: endOfDay },
   });

   const attendanceMap = {};
   todayAttendance.forEach((record) => {
     attendanceMap[record.code] = record.status;
   });

   let presentCount = 0;
   let absentCount = 0;
   let leaveCount = 0;
   let halfDayCount = 0;
   let pendingCount = 0;
   const allEmployees = [];

   for (const emp of eligibleEmployees) {
     const status = attendanceMap[emp.code] || 'Absent';
     if (status === "Present") presentCount++;
     else if (status === "Leave") leaveCount++;
     else if (status === "Half Day") halfDayCount++;
     else if (status === "Pending") pendingCount++;
     else absentCount++;

     allEmployees.push({ ...emp._doc, status });
   }

   // ✅ Final Response
   res.status(200).json({
     success: true,
     total: allEmployees.length,
     presentCount,
     absentCount,
     leaveCount,
     halfDayCount,
     pendingCount,
     weeklyChart: weeklyChartData,
     data: allEmployees,
   });

 } catch (error) {
   console.error("Fetch error:", error);
   res.status(500).json({
     success: false,
     message: 'Failed to fetch employees for attendance',
     error: error.message,
   });
 }
};

exports.listMetadata = async (req, res) => {
  try {
    const { search, position, role, page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    const match = {};

    // 🔎 Universal search across code, name, firm_code
    if (search) {
      const regex = { $regex: search, $options: "i" };
      match.$or = [{ code: regex }, { name: regex }, { firm_code: regex }];
    }

    const pipeline = [
      { $match: match },

      // Lookup ActorCodes
      {
        $lookup: {
          from: "actorcodes",
          localField: "code",
          foreignField: "code",
          as: "actorInfo",
        },
      },
      { $unwind: { path: "$actorInfo", preserveNullAndEmptyArrays: true } },

      // Lookup Firms
      {
        $lookup: {
          from: "firms",
          localField: "firm_code",
          foreignField: "code",
          as: "firmInfo",
        },
      },
      { $unwind: { path: "$firmInfo", preserveNullAndEmptyArrays: true } },
    ];

    // Apply filters
    if (role) pipeline.push({ $match: { "actorInfo.role": role } });
    if (position) pipeline.push({ $match: { "actorInfo.position": position } });

    // Pagination
    pipeline.push({ $skip: parseInt(skip) });
    pipeline.push({ $limit: parseInt(limit) });

    // Project clean response
    pipeline.push({
      $project: {
        _id: 1,
        code: 1,
        name: 1,
        firm_code: 1,
        firm_name: "$firmInfo.name",
        attendance: 1,
        createdAt: 1,
        updatedAt: 1,
        role: "$actorInfo.role",
        position: "$actorInfo.position",
      },
    });

    const data = await MetaData.aggregate(pipeline);

    const totalCount = await MetaData.countDocuments(match);

    res.status(200).json({
      success: true,
      page: parseInt(page),
      limit: parseInt(limit),
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit),
      data,
    });
  } catch (error) {
    console.error("❌ Error listing metadata:", error);
    res.status(500).json({
      success: false,
      message: "Failed to list metadata",
      error: error.message,
    });
  }
};

exports.bulkUpsertMetadata = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "CSV file is required" });
    }

    const results = [];
    const seenCodes = new Set();
    const conflicts = [];
    const filePath = req.file.path;

    // 🚫 Reserved fields that should never come from CSV
    const reservedFields = ["_id", "__v", "createdat", "updatedat", "createdAt", "updatedAt"];

    fs.createReadStream(filePath)
      .pipe(
        csvParser({
          mapHeaders: ({ header }) =>
            header.toLowerCase().trim().replace(/\s+/g, "_"),
        })
      )
      .on("data", (row) => {
        const processedRow = {};

        for (const key in row) {
          const normalizedKey = key.toLowerCase();
          if (reservedFields.includes(normalizedKey)) continue; // 🚫 skip reserved fields

          let value = row[key]?.trim();
          if (value && value.toLowerCase() === "true") {
            processedRow[key] = true;
          } else if (value && value.toLowerCase() === "false") {
            processedRow[key] = false;
          } else if (value) {
            processedRow[key] = value;
          }
        }

        const code = processedRow.code?.toLowerCase();
        if (!code) return;

        if (seenCodes.has(code)) {
          conflicts.push(processedRow);
        } else {
          seenCodes.add(code);
          results.push(processedRow);
        }
      })
      .on("end", async () => {
        try {
          const codes = results.map((r) => r.code);
          const existingDocs = await MetaData.find({ code: { $in: codes } }).lean();
          const existingMap = new Map(
            existingDocs.map((doc) => [doc.code.toLowerCase(), doc])
          );

          const bulkOps = [];
          let trulyUpdatedCount = 0;

          for (const row of results) {
            const existing = existingMap.get(row.code.toLowerCase());

            if (!existing) {
              // New doc
              bulkOps.push({ insertOne: { document: row } });
            } else {
              // Compare fields for changes
              let hasChanges = false;
              for (const key of Object.keys(row)) {
                if (row[key] != existing[key]) {
                  hasChanges = true;
                  break;
                }
              }

              if (hasChanges) {
                bulkOps.push({
                  updateOne: {
                    filter: { code: row.code },
                    update: { $set: row },
                  },
                });
                trulyUpdatedCount++;
              }
            }
          }

          if (bulkOps.length > 0) {
            await MetaData.bulkWrite(bulkOps);
          }

          fs.unlinkSync(filePath);

          res.status(200).json({
            success: true,
            message: "Bulk upsert completed",
            inserted: bulkOps.filter((op) => op.insertOne).length,
            modified: trulyUpdatedCount, // ✅ only count *real* updates
            conflicts,
          });
        } catch (err) {
          console.error("❌ Bulk upsert error:", err);
          res.status(500).json({
            success: false,
            message: "Failed to upsert metadata",
          });
        }
      })
      .on("error", (err) => {
        console.error("CSV parse error:", err);
        res.status(500).json({
          success: false,
          message: "CSV parsing failed",
          error: err.message,
        });
      });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};





exports.downloadMetadata = async (req, res) => {
  try {
    const data = await MetaData.find().lean();

    if (!data.length) {
      return res.status(404).json({ message: "No metadata found" });
    }

    const parser = new Parser();
    const csv = parser.parse(data);

    res.header("Content-Type", "text/csv");
    res.attachment("metadata_export.csv");
    return res.send(csv);
  } catch (error) {
    console.error("❌ CSV export error:", error);
    res.status(500).json({ message: "Failed to export metadata" });
  }
};

//do not touch
exports.cleanExtraTimestamps = async (req, res) => {
  try {
    const result = await MetaData.updateMany(
      {},
      { $unset: { createdat: "", updatedat: "" } } // 🚀 remove these fields
    );

    res.status(200).json({
      success: true,
      message: "Extra fields cleaned successfully",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("❌ Error cleaning metadata:", error);
    res.status(500).json({
      success: false,
      message: "Failed to clean metadata",
      error: error.message,
    });
  }
};


exports.bulkUpdateLeavesConfig = async (req, res) => {
  try {
    const { updates } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Updates array is required"
      });
    }

    // Build bulk operations
    const bulkOps = updates.map((u) => {
      let setFields = {};
      if (u.allowed_leaves !== undefined) setFields.allowed_leaves = u.allowed_leaves;
      if (u.leaves_balance !== undefined) setFields.leaves_balance = u.leaves_balance;

      return {
        updateOne: {
          filter: { code: u.code },
          update: { $set: setFields }
        }
      };
    });

    const result = await MetaData.bulkWrite(bulkOps);

    res.json({
      success: true,
      message: "Leaves configuration updated for multiple employees",
      result
    });
  } catch (error) {
    console.error("❌ bulkUpdateLeavesConfig error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};


//new

// Get all active firms with code and organization
exports.getActiveFirms = async (req, res) => {
  try {
    const firms = await Firm.find(
      { status: 'Active' },
      { code: 1, orgName: 1, name: 1, _id: 0 }
    ).sort({ name: 1 });

    res.status(200).json({
      success: true,
      message: "Active firms fetched successfully",
      count: firms.length,
      data: firms,
    });
  } catch (error) {
    console.error("❌ getActiveFirms error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching active firms",
      error: error.message,
    });
  }
};

// controllers/sidebar.controller.js
exports.getSidebar = async (req, res) => {
  try {
    const userCode = req.user.code;
    if (!userCode)
      return res.status(400).json({ error: "User code missing" });

    // 🟢 Get actor first (for position and role)
    const actor = await ActorCodes.findOne({ code: userCode });
    const position = actor?.position?.toLowerCase() || "employee";
    const role = actor?.role?.toLowerCase() || "employee";

    // 🟢 Try to get metadata — but don't fail if missing
    const metadata = await MetaData.findOne({ code: userCode }).lean();
    const firm = metadata?.firm_code || "UNKNOWN_FIRM";

    console.log("Sidebar → position:", position, "| role:", role, "| firm:", firm);

    // 🧩 Sidebar container
    let sidebar = [];

    // ✅ 1️⃣ Super admin override
    if (role === "super_admin" || position === "super_admin") {
      sidebar = adminSidebar(); // or a separate superAdminSidebar() if you have one
    }

    // ✅ 2️⃣ Admin override — irrespective of firm
    else if (role === "admin" || position === "admin") {
      sidebar = adminSidebar();
    }

    // ✅ 3️⃣ HR override
    else if (role === "hr" || position === "hr") {
      sidebar = hrSidebar ? hrSidebar() : restSidebar(); // use HR-specific if defined
    }

    // ✅ 4️⃣ MDD override
    else if (position === "mdd") {
      sidebar = mddSidebar();
    }

    // ✅ 5️⃣ Otherwise, use firm-based logic
    else if (firm === "SiddhaCorp_01") {
      if (position === "zsm") sidebar = zsmSidebar();
      else if (["asm", "tse"].includes(position)) sidebar = asmTseSidebar();
      else sidebar = restSidebar();
    } 
    
    // ✅ 6️⃣ Fallback for others / unknown firms
    else {
      sidebar = restSidebar();
    }

    // ✅ Send response even if metadata missing
    return res.json({
      success: true,
      firm,
      position,
      role,
      sidebar,
    });
  } catch (err) {
    console.error("❌ Sidebar API Error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};



// ------------------------------
// 🧱 Sidebar Configurations start
// ------------------------------
const adminSidebar = () => [
  { name: "Dashboard", route: "dashboard", icon: "layoutDashboard" },
  { name: "Sales Dashboard", route: "sales_dashboard", icon: "barChart2" },
  {
    name: "Extraction",
    icon: "database",
    children: [
      { name: "Add Data", route: "extraction_add", icon: "plusCircle" },
      { name: "View Status", route: "extraction_status", icon: "clipboardList" },
      { name: "Report", route: "extraction_report", icon: "fileText" },
    ],
  },
  { name: "Route Plan", route: "route_plan", icon: "map" },
  {
    name: "Market Coverage",
    icon: "briefcase",
    children: [
      { name: "Overview", route: "market_overview", icon: "map" },
      { name: "Beats", route: "market_beats", icon: "route" },
    ],
  },
  {
    name: "HR",
    icon: "users",
    children: [
      { name: "Attendance & Leave", route: "attendance", icon: "calendarCheck2" },
      { name: "Bill Upload", route: "bill_upload", icon: "fileUp" },
    ],
  },
  { name: "Geotagging", route: "geo_tagging", icon: "mapPin" },
  { name: "Punch In/Out", route: "punch_in_out", icon: "fingerprint" },
  { name: "Profile", route: "profile", icon: "user" },
  { name: "Logout", route: "logout", icon: "logOut" },
];

const zsmSidebar = () => [
  { name: "Dashboard", route: "dashboard", icon: "layoutDashboard" },
  { name: "Sales Dashboard", route: "sales_dashboard", icon: "barChart2" },
  {
    name: "Extraction",
    icon: "database",
    children: [
      { name: "Add Data", route: "extraction_add", icon: "plusCircle" },
      { name: "View Status", route: "extraction_status", icon: "clipboardList" },
      { name: "Report", route: "extraction_report", icon: "fileText" },
    ],
  },
  { name: "Route Plan", route: "route_plan", icon: "map" },
  {
    name: "Market Coverage",
    icon: "briefcase",
    children: [
      { name: "Overview", route: "market_overview", icon: "map" },
      { name: "Beats", route: "market_beats", icon: "route" },
    ],
  },
  {
    name: "HR",
    icon: "users",
    children: [
      { name: "Attendance & Leave", route: "attendance", icon: "calendarCheck2" },
      { name: "Bill Upload", route: "bill_upload", icon: "fileUp" },
    ],
  },
  { name: "Geotagging", route: "geo_tagging", icon: "mapPin" },
  { name: "Punch In/Out", route: "punch_in_out", icon: "fingerprint" },
  { name: "Profile", route: "profile", icon: "user" },
  { name: "Logout", route: "logout", icon: "logOut" },
];

const asmTseSidebar = () => [
  { name: "Dashboard", route: "dashboard", icon: "layoutDashboard" },
  { name: "Sales Dashboard", route: "sales_dashboard", icon: "barChart2" },
  {
    name: "Extraction",
    icon: "database",
    children: [{ name: "Add Data", route: "extraction_add", icon: "plusCircle" }],
  },
  { name: "Route Plan", route: "route_plan", icon: "map" },
  {
    name: "Market Coverage",
    icon: "briefcase",
    children: [{ name: "Beats", route: "market_beats", icon: "route" }],
  },
  {
    name: "HR",
    icon: "users",
    children: [
      { name: "Attendance & Leave", route: "attendance", icon: "calendarCheck2" },
      { name: "Bill Upload", route: "bill_upload", icon: "fileUp" },
    ],
  },
  { name: "Geotagging", route: "geo_tagging", icon: "mapPin" },
  { name: "Punch In/Out", route: "punch_in_out", icon: "fingerprint" },
  { name: "Profile", route: "profile", icon: "user" },
  { name: "Logout", route: "logout", icon: "logOut" },
];

const mddSidebar = () => [
  { name: "Dashboard", route: "dashboard", icon: "layoutDashboard" },
  {
    name: "Extraction",
    icon: "database",
    children: [{ name: "Add Data", route: "extraction_add", icon: "plusCircle" }],
  },
  { name: "Logout", route: "logout", icon: "logOut" },
];

const restSidebar = () => [
  { name: "Dashboard", route: "dashboard", icon: "layoutDashboard" },
  {
    name: "HR",
    icon: "users",
    children: [
      { name: "Attendance & Leave", route: "attendance", icon: "calendarCheck2" },
      { name: "Bill Upload", route: "bill_upload", icon: "fileUp" },
    ],
  },
  { name: "Punch In/Out", route: "punch_in_out", icon: "fingerprint" },
  { name: "Profile", route: "profile", icon: "user" },
  { name: "Logout", route: "logout", icon: "logOut" },
];
// ------------------------------
// 🧱 Sidebar Configurations end
// ------------------------------