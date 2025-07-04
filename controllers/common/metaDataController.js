// controllers/common/metaDataController.js
const csvParser = require('csv-parser');
const fs = require('fs');
const moment = require('moment'); // or use native Date
const MetaData = require('../../model/MetaData');
const Attendance = require('../../model/Attendance');

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

// exports.getEmployeesForAttendanceCount = async (req, res) => {
//  try {
//    // 1. Get all employees where attendance = true
//    const eligibleEmployees = await MetaData.find({ attendance: true });
//    const employeeCodes = eligibleEmployees.map(emp => emp.code);

//    // 2. Use query date if provided, else default to today
//    const selectedDate = req.query.date
//      ? moment(req.query.date, 'YYYY-MM-DD')
//      : moment(); // today

//    const startOfDay = selectedDate.startOf('day').toDate();
//    const endOfDay = selectedDate.endOf('day').toDate();

//    // 3. Fetch all attendance for selected date
//    const todayAttendance = await Attendance.find({
//      code: { $in: employeeCodes },
//      date: { $gte: startOfDay, $lte: endOfDay },
//    });

//    // 4. Create a map of attendance by code
//    const attendanceMap = {};
//    todayAttendance.forEach((record) => {
//      attendanceMap[record.code] = record.status;
//    });

//    // 5. Classify employees by status
//    const allEmployees = [];
//    let presentCount = 0;
//    let absentCount = 0;
//    let leaveCount = 0;
//    let halfDayCount = 0;
//    let pendingCount = 0;

//    for (const emp of eligibleEmployees) {
//      const code = emp.code;
//      const status = attendanceMap[code] || "Absent"; // default to Absent

//      const employeeWithStatus = {
//        ...emp._doc,
//        status,
//      };

//      if (status === "Present") presentCount++;
//      else if (status === "Leave") leaveCount++;
//      else if (status === "Half Day") halfDayCount++;
//      else if (status === "Pending") pendingCount++;
//      else absentCount++;

//      allEmployees.push(employeeWithStatus);
//    }

//    res.status(200).json({
//      success: true,
//      date: selectedDate.format('YYYY-MM-DD'),
//      total: allEmployees.length,
//      presentCount,
//      absentCount,
//      leaveCount,
//      halfDayCount,
//      pendingCount,
//      data: allEmployees,
//    });

//  } catch (error) {
//    console.error("Fetch error:", error);
//    res.status(500).json({
//      success: false,
//      message: 'Failed to fetch employees for attendance',
//      error: error.message,
//    });
//  }
// };


exports.getEmployeesForAttendanceCount = async (req, res) => {
 try {
   // 1. Get all employees where attendance = true
   const eligibleEmployees = await MetaData.find({ attendance: true });
   const employeeCodes = eligibleEmployees.map(emp => emp.code);

   // 2. Use query date if provided, else default to today
   const selectedDate = req.query.date
     ? moment(req.query.date, 'YYYY-MM-DD')
     : moment(); // today

   const startOfDay = selectedDate.startOf('day').toDate();
   const endOfDay = selectedDate.endOf('day').toDate();

   // 3. Fetch all attendance for selected date
   const todayAttendance = await Attendance.find({
     code: { $in: employeeCodes },
     date: { $gte: startOfDay, $lte: endOfDay },
   });

   // 4. Create a map of attendance by code
   const attendanceMap = {};
   todayAttendance.forEach((record) => {
     attendanceMap[record.code] = record.status;
   });

   // 5. Classify employees by status
   const allEmployees = [];
   let presentCount = 0;
   let absentCount = 0;
   let leaveCount = 0;
   let halfDayCount = 0;
   let pendingCount = 0;

   for (const emp of eligibleEmployees) {
     const code = emp.code;
     const status = attendanceMap[code] || "Absent"; // default to Absent

     const employeeWithStatus = {
       ...emp._doc,
       status,
     };

     if (status === "Present") presentCount++;
     else if (status === "Leave") leaveCount++;
     else if (status === "Half Day") halfDayCount++;
     else if (status === "Pending") pendingCount++;
     else absentCount++;

     allEmployees.push(employeeWithStatus);
   }

   // ---------------------------------------------
   // ✅ 6. Weekly Data (for Line Chart)
   // ---------------------------------------------
// ---------------------------------------------
// ✅ 6. Weekly Data (for Line Chart - Current Week Auto)
// ---------------------------------------------
let weeklyChartData = [];

const baseDate = selectedDate.clone(); // either query date or today

// Get current week range: Monday to Sunday
const startDate = baseDate.clone().startOf('isoWeek').startOf('day'); // Monday
const endDate = baseDate.clone().endOf('isoWeek').endOf('day');       // Sunday

const weeklyAttendance = await Attendance.find({
  code: { $in: employeeCodes },
  date: { $gte: startDate.toDate(), $lte: endDate.toDate() },
});

// Group by date
const groupedByDate = {};

weeklyAttendance.forEach((record) => {
  const dateStr = moment(record.date).format('YYYY-MM-DD');
  if (!groupedByDate[dateStr]) {
    groupedByDate[dateStr] = {
      date: dateStr,
      Present: 0,
      Absent: 0,
      Leave: 0,
      'Half Day': 0,
      Pending: 0,
    };
  }
  groupedByDate[dateStr][record.status] =
    (groupedByDate[dateStr][record.status] || 0) + 1;
});

// Fill missing dates with 0 counts
// Fill missing dates with 0 counts
const current = startDate.clone();
while (current.isSameOrBefore(endDate)) {
  const dateStr = current.format('YYYY-MM-DD');

  if (!groupedByDate[dateStr]) {
    groupedByDate[dateStr] = {
      date: dateStr,
      Present: 0,
      Absent: 0,
      Leave: 0,
      'Half Day': 0,
      Pending: 0,
    };
  }

  // 👇 Add Absent logic based on total - others
  const present = groupedByDate[dateStr].Present || 0;
  const leave = groupedByDate[dateStr].Leave || 0;
  const halfDay = groupedByDate[dateStr]['Half Day'] || 0;
  const pending = groupedByDate[dateStr].Pending || 0;
  const total = employeeCodes.length;

  groupedByDate[dateStr].Absent = total - (present + leave + halfDay + pending);

  current.add(1, 'day');
}


// Final sorted array
weeklyChartData = Object.values(groupedByDate).sort((a, b) =>
  a.date.localeCompare(b.date)
);


   // ---------------------------------------------
   // ✅ Final Response
   // ---------------------------------------------
   res.status(200).json({
     success: true,
     date: selectedDate.format('YYYY-MM-DD'),
     total: allEmployees.length,
     presentCount,
     absentCount,
     leaveCount,
     halfDayCount,
     pendingCount,
     data: allEmployees,
     weeklyChart: weeklyChartData, // 👉 for frontend chart
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