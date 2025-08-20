const Attendance = require("../../model/Attendance");
const ActorCode = require("../../model/ActorCode");
const moment = require("moment");
const HierarchyEntries = require("../../model/HierarchyEntries");
const User = require("../../model/User");
const attendanceHelpers = require("../../helpers/attendanceHelper");
const { Parser } = require("json2csv");
const fs = require("fs");
const fsPromises = require("fs/promises");
const cloudinary = require("../../config/cloudinary");
const ActorTypesHierarchy = require("../../model/ActorTypesHierarchy");
const MetaData = require("../../model/MetaData");
const { DateTime } = require("luxon");
// const { warn } = require("console");

// punch in
// exports.punchIn = async (req, res) => {
//   try {
//     console.log("Punch in here")
//     const { latitude, longitude } = req.body;
//     const { code } = req.user;
//     console.log("Lats and logs: ", latitude, longitude);

//     if (!code)
//       return res
//         .status(400)
//         .json({ message: "User code is missing in token." });
//     if (!req.file) {
//       return res.status(200).json({
//         warning: true,
//         message: "Please capture an image.",
//       });
//     }

//     const formattedDate = moment().format("YYYY-MM-DD");
//     const punchInTime = moment().format("YYYY-MM-DD HH:mm:ss");

//     const existingAttendance = await Attendance.findOne({
//       code,
//       date: formattedDate,
//     });
//     if (existingAttendance) {
//       return res.status(200).json({
//         message: "You have already punched in for today.",
//         attendance: existingAttendance,
//       });
//     }

//     // Dynamic hierarchy handling
//     const userHierarchies = await HierarchyEntries.find({
//       $or: Object.keys(HierarchyEntries.schema.obj)
//         .filter((key) => !["_id", "__v", "hierarchy_name"].includes(key))
//         .map((key) => ({ [key]: code })),
//     });

//     const allCodesSet = new Set();

//     userHierarchies.forEach((hierarchy) => {
//       Object.entries(hierarchy.toObject()).forEach(([key, value]) => {
//         if (!["_id", "__v", "hierarchy_name"].includes(key)) {
//           if (Array.isArray(value)) {
//             value.forEach((v) => v && allCodesSet.add(v));
//           } else if (value) {
//             allCodesSet.add(value);
//           }
//         }
//       });
//     });

//     const allCodes = Array.from(allCodesSet);

//     if (!allCodes.length) {
//       return res
//         .status(404)
//         .json({ message: "No related employees found in the hierarchy." });
//     }

//     const relatedUsers = await User.aggregate([
//       {
//         $match: {
//           code: { $in: allCodes },
//           latitude: { $type: "decimal" },
//           longitude: { $type: "decimal" },
//         },
//       },
//       { $project: { code: 1, name: 1, latitude: 1, longitude: 1 } },
//     ]);

//     if (!relatedUsers.length) {
//       return res
//         .status(404)
//         .json({ message: "No related users with location data found." });
//     }

//     const userLat = parseFloat(latitude);
//     const userLon = parseFloat(longitude);

//     let nearestUser = null;
//     let minDistance = Infinity;

//     relatedUsers.forEach((relUser) => {
//       console.log("Rel user and code: ", relUser, code);
//       const relLat = parseFloat(relUser.latitude);
//       const relLon = parseFloat(relUser.longitude);

//       if (isNaN(relLat) || isNaN(relLon)) return;

//       const distance = attendanceHelpers.getDistance(
//         userLat,
//         userLon,
//         relLat,
//         relLon
//       );
//       if (distance < minDistance) {
//         minDistance = distance;
//         nearestUser = relUser;
//       }
//     });

//     if (!nearestUser || minDistance > 100) {
//       return res.status(200).json({
//         warning: true,
//         message: `You are too far  — approx ${minDistance.toFixed(
//           2
//         )} meters away. Please move closer to a hierarchy member and try again.`,
//       });
//     }

//     console.log("Nearest Dealerr: ", nearestUser);
//     // store image as name and time
//     const timestamp = moment().format("YYYY-MM-DD_HH-mm-ss");
//     const publicId = `${code}_${timestamp}`;

//     // Upload to Cloudinary
//     const result = await cloudinary.uploader.upload(req.file.path, {
//       folder: "gpunchInImage",
//       public_id: publicId,
//       transformation: [
//         { width: 800, height: 800, crop: "limit" },
//         { quality: "auto" },
//         { fetch_format: "auto" },
//       ],
//     });

//     // delete temp file
//     try {
//       if (req.file?.path) {
//         await fsPromises.unlink(req.file.path);
//         console.log("Temp file deleted:", req.file.path);
//       }
//     } catch (err) {
//       console.error("Failed to delete temp file:", err);
//     }

//     const attendance = new Attendance({
//       code,
//       date: formattedDate,
//       punchIn: punchInTime,
//       status: "Present",
//       punchInLatitude: latitude,
//       punchInLongitude: longitude,
//       punchInImage: result.secure_url,
//       punchInCode: nearestUser.code,
//       punchInName: nearestUser.name,
//     });

//     await attendance.save();
//     res
//       .status(201)
//       .json({ message: "Punch-in recorded successfully", attendance });
//   } catch (error) {
//     console.error("Error during punch-in:", error);
//     res
//       .status(500)
//       .json({ message: "Error recording punch in. please try again later" });
//   }
// };
// in this api i just add the succes true or false message not changed any other things
exports.punchIn = async (req, res) => {
  try {
    console.log("Punch in here");
    const { latitude, longitude } = req.body;
    const { code } = req.user;
    console.log("Lats and logs: ", latitude, longitude);
    console.log("User code:", code);

    if (!code)
      return res
        .status(400)
        .json({ success: false, message: "User code is missing in token." });
    if (!req.file) {
      return res.status(200).json({
        warning: true,
        message: "Please capture an image.",
      });
    }

    const formattedDate = moment().format("YYYY-MM-DD");
    const punchInTime = moment().format("YYYY-MM-DD HH:mm:ss");

    const existingAttendance = await Attendance.findOne({
      code,
      date: formattedDate,
    });
    if (existingAttendance) {
      return res.status(200).json({
       success: false,
       warning: true,
        message: "You have already punched in for today.",
        attendance: existingAttendance,
      });
    }

    // Fetch valid fields from ActorTypesHierarchy
    const actorTypes = await ActorTypesHierarchy.find().lean();
    const fieldsToQuery = [
      ...new Set(
        actorTypes
          .flatMap((entry) =>
            entry.hierarchy
              ? entry.hierarchy.map((role) => role.toLowerCase())
              : []
          )
          .filter((role) => role)
      ),
    ];
    console.log("Queried fields from ActorTypesHierarchy:", fieldsToQuery);

    // Fetch HierarchyEntries containing the user's code in any field
    const orQuery = fieldsToQuery.map((key) => ({
      [key]: { $in: [code] },
    }));
    console.log("Generated $or query:", orQuery);

    const userHierarchies = await HierarchyEntries.find({
      $or: orQuery,
    }).lean();
    console.log("Hierarchy count:", userHierarchies.length);
    if (userHierarchies.length !== 67) {
      console.log("Sample userHierarchies:", userHierarchies.slice(0, 5));
    }

    // Extract all unique codes from hierarchy entries
    const allCodes = [
      ...new Set(
        userHierarchies.flatMap((hierarchy) =>
          fieldsToQuery
            .flatMap((key) => {
              const value = hierarchy[key];
              return Array.isArray(value) ? value : [value];
            })
            .filter((v) => v && v !== code)
        )
      ),
    ];

    console.log("all code: ", allCodes);
    console.log("all code length: ", allCodes.length);

    if (!allCodes.length) {
      return res
        .status(404)
        .json({ success: false, message: "No related employees found in the hierarchy." });
    }

    const relatedUsers = await User.aggregate([
      {
        $match: {
          code: { $in: allCodes },
          latitude: { $type: ["double", "decimal"] },
          longitude: { $type: ["double", "decimal"] },
        },
      },
      {
        $project: { code: 1, name: 1, position: 1, latitude: 1, longitude: 1 },
      },
    ]);
    // console.log("Related Users (details):", relatedUsers);
    console.log("Related user count:", relatedUsers.length);
    const dealers = relatedUsers.filter((user) => user.position === "dealer");
    console.log("Dealer count:", dealers.length);

    if (!relatedUsers.length) {
      return res
        .status(404)
        .json({ success: false, message: "No related users with location data found." });
    }

    const userLat = parseFloat(latitude);
    const userLon = parseFloat(longitude);

    let nearestUser = null;
    let minDistance = Infinity;
    let ptnUser;
    relatedUsers.forEach((relUser) => {
      const relLat = parseFloat(relUser.latitude);
      const relLon = parseFloat(relUser.longitude);

      if (isNaN(relLat) || isNaN(relLon)) return;

      const distance = attendanceHelpers.getDistance(
        userLat,
        userLon,
        relLat,
        relLon
      );
      if (distance == null) {
        console.log(`Null distance for ${relUser.code}:`, {
          userLat,
          userLon,
          relLat,
          relLon,
        });
        return;
      }

      console.log(
        `Distance to ${relUser.code} (${relUser.position}): ${distance.toFixed(
          2
        )} km`
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearestUser = relUser;
      }
      ptnUser = nearestUser;
    });
    console.log("Ptn user: ", ptnUser, minDistance.toFixed(2), "Meters");

    if (!nearestUser || minDistance > 200) {
      return res.status(200).json({
       success: false,
        warning: true,
        message: `You are too far — approx ${minDistance.toFixed(
          2
        )} meters away. Please move closer to a hierarchy member and try again.`,
      });
    }

    console.log("Nearest User:", nearestUser);

    // Upload to Cloudinary
    const timestamp = moment().format("YYYY-MM-DD_HH-mm-ss");
    const publicId = `${code}_${timestamp}`;
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "gpunchInImage",
      public_id: publicId,
      transformation: [
        { width: 800, height: 800, crop: "limit" },
        { quality: "auto" },
        { fetch_format: "auto" },
      ],
    });

    // Delete temp file
    try {
      if (req.file?.path) {
        await fsPromises.unlink(req.file.path);
        console.log("Temp file deleted:", req.file.path);
      }
    } catch (err) {
      console.error("Failed to delete temp file:", err);
    }

    const attendance = new Attendance({
      code,
      date: formattedDate,
      punchIn: punchInTime,
      status: "Present",
      punchInLatitude: latitude,
      punchInLongitude: longitude,
      punchInImage: result.secure_url,
      punchInCode: nearestUser.code,
      punchInName: nearestUser.name,
      distance: parseFloat(minDistance.toFixed(2)),
    });

    await attendance.save();
    res
      .status(201)
      .json({ message: "Punch-in recorded successfully", attendance });
  } catch (error) {
    console.error("Error during punch-in:", error);
    res
      .status(500)
      // add the sucess false (Nameera)
      .json({ success: false, message: "Error recording punch in. Please try again later" });
  }
};

// punch out
// exports.punchOut = async (req, res) => {
//   try {
//     const { latitude, longitude } = req.body;
//     const { code } = req.user;

//     if (!code) {
//       return res
//         .status(400)
//         .json({ message: "User code is missing in token." });
//     }
//     if (!req.file) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Please capture an image." });
//     }
//     const formattedDate = moment().format("YYYY-MM-DD");
//     const punchOutTime = moment().format("YYYY-MM-DD HH:mm:ss");

//     const attendance = await Attendance.findOne({
//       code,
//       date: formattedDate,
//     });
//     if (!attendance) {
//       return res.status(200).json({
//         warning: true,
//         message: "You have not punched in yet for today.",
//       });
//     }

//     if (attendance.punchOut) {
//       return res.status(200).json({
//         warning: true,
//         message: "You have already punched out today.",
//       });
//     }
//     const allHierarchies = await HierarchyEntries.find({});
//     const matchedHierarchies = allHierarchies.filter((hierarchy) => {
//       const fields = Object.keys(hierarchy.toObject()).filter(
//         (key) => key !== "_id" && key !== "hierarchy_name" && key !== "__v"
//       );
//       return fields.some((key) => hierarchy[key] === code);
//     });
//     const hasDealerField = matchedHierarchies.some((hierarchy) =>
//       Object.prototype.hasOwnProperty.call(hierarchy.toObject(), "dealer")
//     );
//     const isDealerAssigned = matchedHierarchies.some(
//       (hierarchy) => hierarchy.dealer === code
//     );

//     if (hasDealerField && !isDealerAssigned) {
//       return await attendanceHelpers.handlePunchOutWithoutDealer({
//         attendance,
//         req,
//         res,
//         punchOutTime,
//         latitude,
//         longitude,
//       });
//     }

//     // ✅ Proceed with hierarchy + distance check
//     const allCodesSet = new Set();
//     matchedHierarchies.forEach((hierarchy) => {
//       Object.entries(hierarchy.toObject()).forEach(([key, value]) => {
//         if (!["_id", "__v", "hierarchy_name"].includes(key)) {
//           if (Array.isArray(value)) {
//             value.forEach((v) => v && allCodesSet.add(v));
//           } else if (value) {
//             allCodesSet.add(value);
//           }
//         }
//       });
//     });

//     const allCodes = Array.from(allCodesSet);

//     const relatedUsers = await User.aggregate([
//       {
//         $match: {
//           code: { $in: allCodes },
//           latitude: { $type: "decimal" },
//           longitude: { $type: "decimal" },
//         },
//       },
//       { $project: { code: 1, name: 1, latitude: 1, longitude: 1 } },
//     ]);

//     if (!relatedUsers.length) {
//       return res
//         .status(404)
//         .json({ message: "No related users with location data found." });
//     }

//     const userLat = parseFloat(latitude);
//     const userLon = parseFloat(longitude);

//     let nearestUser = null;
//     let minDistance = Infinity;

//     relatedUsers.forEach((relUser) => {
//       const relLat = parseFloat(relUser.latitude);
//       const relLon = parseFloat(relUser.longitude);
//       const distance = attendanceHelpers.getDistance(
//         userLat,
//         userLon,
//         relLat,
//         relLon
//       );
//       if (distance < minDistance) {
//         minDistance = distance;
//         nearestUser = relUser;
//       }
//     });

//     if (!nearestUser || minDistance > 100) {
//       return res.status(200).json({
//         warning: true,
//         message: `You are too far — approx ${minDistance.toFixed(
//           2
//         )} meters away. Please move closer to a hierarchy member and try again.`,
//       });
//     }

//     // ✅ Upload punch-out image
//     if (!req.file) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Please capture an image." });
//     } // store image as name and time
//     const timestamp = moment().format("YYYY-MM-DD_HH-mm-ss");
//     const publicId = `${code}_${timestamp}`;

//     // Upload to Cloudinary
//     const result = await cloudinary.uploader.upload(req.file.path, {
//       folder: "gpunchOutImage",
//       public_id: publicId,
//       transformation: [
//         { width: 800, height: 800, crop: "limit" },
//         { quality: "auto" },
//         { fetch_format: "auto" },
//       ],
//     });
//     // delete temp file
//     try {
//       if (req.file?.path) {
//         await fsPromises.unlink(req.file.path);
//         console.log("Temp file deleted:", req.file.path);
//       }
//     } catch (err) {
//       console.error("Failed to delete temp file:", err);
//     }

//     const punchOutImage = result.secure_url;

//     const durationMinutes = moment(punchOutTime).diff(
//       moment(attendance.punchIn),
//       "minutes"
//     );
//     const hoursWorked = (durationMinutes / 60).toFixed(2);

//     let status = "Present";
//     if (hoursWorked <= 4) status = "Absent";
//     else if (hoursWorked < 8) status = "Half Day";

//     attendance.punchOut = punchOutTime;
//     attendance.punchOutImage = punchOutImage;
//     attendance.status = status;
//     attendance.punchOutLatitude = latitude;
//     attendance.punchOutLongitude = longitude;
//     attendance.hoursWorked = parseFloat(hoursWorked);
//     attendance.punchOutCode = nearestUser.code;
//     attendance.punchOutName = nearestUser.name;

//     await attendance.save();

//     res.status(201).json({
//       message: "Punch-out recorded successfully",
//       attendance: {
//         ...attendance.toObject(),
//         punchOutCode: nearestUser.code,
//         punchOutName: nearestUser.name,
//         punchOutLatitude: latitude,
//         punchOutLongitude: longitude,
//       },
//     });
//   } catch (error) {
//     console.error("Error during punch-out:", error);
//     res
//       .status(500)
//       .json({ message: "Error recording punch out. please try again later" });
//   }
// };
// punch out lates api Nameera (07 july 2025)
exports.punchOut = async (req, res) => {
 console.log("punhc out start here...");
 try {
   const { latitude, longitude } = req.body;
   const { code } = req.user;
   console.log("latitude is", latitude, "longitude is", longitude);

   if (!code) {
     return res.status(400).json({ success: false, message: "User code is missing in token." });
   }

   if (!req.file) {
     return res.status(400).json({ success: false, message: "Please capture an image." });
   }

   const formattedDate = moment().format("YYYY-MM-DD");
   const punchOutTime = moment().format("YYYY-MM-DD HH:mm:ss");

   const attendance = await Attendance.findOne({ code, date: formattedDate });
   if (!attendance) {
     return res.status(200).json({ success: false, message: "You have not punched in yet for today." });
   }

   if (attendance.punchOut) {
     return res.status(200).json({ success: false, warning: true, message: "You have already punched out today." });
   }

   // Fetch valid fields from ActorTypesHierarchy
   const actorTypes = await ActorTypesHierarchy.find().lean();
   const fieldsToQuery = [
     ...new Set(
       actorTypes
         .flatMap((entry) => entry.hierarchy?.map((role) => role.toLowerCase()) || [])
         .filter((role) => role)
     ),
   ];

   // Build OR query for all fields
   const orQuery = fieldsToQuery.map((key) => ({
     [key]: { $in: [code] },
   }));

   const userHierarchies = await HierarchyEntries.find({ $or: orQuery }).lean();

   const allCodes = [
     ...new Set(
       userHierarchies.flatMap((hierarchy) =>
         fieldsToQuery
           .flatMap((key) => {
             const val = hierarchy[key];
             return Array.isArray(val) ? val : [val];
           })
           .filter((v) => v && v !== code)
       )
     ),
   ];

   if (!allCodes.length) {
     return res.status(404).json({ success: false, message: "No related employees found in the hierarchy." });
   }

   const relatedUsers = await User.aggregate([
     {
       $match: {
         code: { $in: allCodes },
         latitude: { $type: ["double", "decimal"] },
         longitude: { $type: ["double", "decimal"] },
       },
     },
     {
       $project: { code: 1, name: 1, position: 1, latitude: 1, longitude: 1 },
     },
   ]);

   if (!relatedUsers.length) {
     return res.status(404).json({ success: false, message: "No related users with location data found." });
   }

   const userLat = parseFloat(latitude);
   const userLon = parseFloat(longitude);

   let nearestUser = null;
   let minDistance = Infinity;
   let ptnUser;
   relatedUsers.forEach((relUser) => {
     const relLat = parseFloat(relUser.latitude);
     const relLon = parseFloat(relUser.longitude);
     if (isNaN(relLat) || isNaN(relLon)) return;
     const distance = attendanceHelpers.getDistance(userLat, userLon, relLat, relLon);
     if (distance == null) {
      console.log(`Null distance for ${relUser.code}:`, {
        userLat,
        userLon,
        relLat,
        relLon,
      });
      return;
    }

    console.log(
      `Distance to ${relUser.code} (${relUser.position}): ${distance.toFixed(
        2
      )} km`
    );

     if (distance < minDistance) {
       minDistance = distance;
       nearestUser = relUser;
     }
     ptnUser = nearestUser;
   });
   console.log("Ptn user: ", ptnUser, minDistance.toFixed(2), "Meters");

   if (!nearestUser || minDistance > 200) {
     return res.status(200).json({
       warning: true,
       message: `You are too far — approx ${minDistance.toFixed(
         2
       )} meters away. Please move closer to a hierarchy member and try again.`,
     });
   }
   console.log("Punch out nearest User:", nearestUser);
   // Upload punch-out image to Cloudinary
   const timestamp = moment().format("YYYY-MM-DD_HH-mm-ss");
   const publicId = `${code}_${timestamp}`;

   const result = await cloudinary.uploader.upload(req.file.path, {
     folder: "gpunchOutImage",
     public_id: publicId,
     transformation: [
       { width: 800, height: 800, crop: "limit" },
       { quality: "auto" },
       { fetch_format: "auto" },
     ],
   });

   // Delete temp image
   try {
     if (req.file?.path) {
       await fsPromises.unlink(req.file.path);
       console.log("Temp file deleted:", req.file.path);
     }
   } catch (err) {
     console.error("Failed to delete temp file:", err);
   }

   // Calculate worked hours
   const durationMinutes = moment(punchOutTime).diff(moment(attendance.punchIn), "minutes");
   const hoursWorked = (durationMinutes / 60).toFixed(2);

   let status = "Present";
   if (hoursWorked <= 4) status = "Absent";
   else if (hoursWorked < 8) status = "Half Day";

   // Update attendance record
   attendance.punchOut = punchOutTime;
   attendance.punchOutImage = result.secure_url;
   attendance.status = status;
   attendance.punchOutLatitude = latitude;
   attendance.punchOutLongitude = longitude;
   attendance.hoursWorked = parseFloat(hoursWorked);
   attendance.punchOutCode = nearestUser.code;
   attendance.punchOutName = nearestUser.name;
   attendance.distance = parseFloat(minDistance.toFixed(2));

   await attendance.save();

   res.status(201).json({
     message: "Punch-out recorded successfully",
     attendance: {
       ...attendance.toObject(),
       punchOutCode: nearestUser.code,
       punchOutName: nearestUser.name,
       punchOutLatitude: latitude,
       punchOutLongitude: longitude,
       distance: parseFloat(minDistance.toFixed(2)), // Also in response
     },
   });
 } catch (error) {
   console.error("Error during punch-out:", error);
   res.status(500).json({ success: false, message: "Error recording punch out. Please try again later." });
 }
};

exports.getAttendance = async (req, res) => {
  try {
    // Fetch all attendance records
    const attendanceRecords = await Attendance.find();

    if (!attendanceRecords.length) {
      return res.status(404).json({ message: "No attendance records found." });
    }

    // Count total punches per code
    const punchCounts = {};
    attendanceRecords.forEach((record) => {
      punchCounts[record.code] = (punchCounts[record.code] || 0) + 1;
    });

    // For each attendance record, add user name and total punches
    const attendanceWithDetails = await Promise.all(
      attendanceRecords.map(async (record) => {
        const user = await User.findOne({ code: record.code });

        return {
          ...record._doc,
          name: user ? user.name : "Unknown",
          totalPunches: punchCounts[record.code],
        };
      })
    );

    res.status(200).json({
      message: "Attendance records fetched successfully",
      attendance: attendanceWithDetails,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching attendance",
      error: error.message,
    });
  }
};
exports.getAttendanceForEmployee = async (req, res) => {
  const { code } = req.user;
  const { status, startDate, endDate, page, limit } = req.query;

  try {
    const filter = { code };

    if (status) {
      filter.status = status;
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        filter.date.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.date.$lte = new Date(endDate);
      }
    }

    let attendanceData;
    let totalRecords;

    if (page && limit) {
      const pageNumber = parseInt(page, 10) || 1;
      const pageSize = parseInt(limit, 10) || 10;
      const skip = (pageNumber - 1) * pageSize;

      totalRecords = await Attendance.countDocuments(filter);
      attendanceData = await Attendance.find(filter)
        .sort({ date: -1 })
        .skip(skip)
        .limit(pageSize);

      return res.status(200).json({
        success: true,
        data: attendanceData,
        pagination: {
          totalRecords,
          totalPages: Math.ceil(totalRecords / pageSize),
          currentPage: pageNumber,
          pageSize,
        },
      });
    } else {
      // No pagination — return all data
      attendanceData = await Attendance.find(filter).sort({ date: -1 });

      return res.status(200).json({
        success: true,
        data: attendanceData,
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Error fetching attendance records.",
    });
  }
};

exports.getAttendanceByEmployeeForAdmin = async (req, res) => {
  try {
    const { code } = req.params;
    const { date, month, year = new Date().getFullYear() } = req.query;

    if (!code) {
      return res.status(400).json({ message: "User code is missing." });
    }

    // Fetch the employee's details
    const employee = await User.findOne({ code });
    if (!employee) {
      return res.status(404).json({ message: "Employee not found." });
    }

    let dateFilter = {};

    // Handle date filtering
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      dateFilter = { $gte: startOfDay, $lte: endOfDay };
    } else if (month && year) {
      const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
      const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      dateFilter = { $gte: start, $lte: end };
    }

    // Fetch attendance records
    const rawRecords = await Attendance.find({
      ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
      code,
    })
      .sort({ date: 1, punchIn: -1 })
      .lean();

    const attendanceMap = new Map();

    for (const record of rawRecords) {
      const key = `${record.code.trim().toLowerCase()}-${new Date(record.date)
        .toISOString()
        .slice(0, 10)}`;

      if (!attendanceMap.has(key)) {
        attendanceMap.set(key, record);
      } else {
        const existing = attendanceMap.get(key);
        const priority = { Present: 3, "Half Day": 2, Absent: 1 };

        if ((priority[record.status] || 0) > (priority[existing.status] || 0)) {
          attendanceMap.set(key, record);
        }
      }
    }

    let attendanceRecords = Array.from(attendanceMap.values());

    // If a specific date is given (single day), handle absentees
    if (date) {
      const presentCodes = new Set(
        attendanceRecords.map((r) => r.code.trim().toLowerCase())
      );
      if (!presentCodes.has(code.trim().toLowerCase())) {
        attendanceRecords.push({
          code: employee.code,
          name: employee.name,
          position: employee.position,
          status: "Absent",
          date: new Date(date),
        });
      }
    }

    // If month view, fill absent data for each day
    if (!date && month && year) {
      const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
      const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

      const allDays = [];
      let d = new Date(startDate);
      while (d <= endDate) {
        allDays.push(new Date(d));
        d.setDate(d.getDate() + 1);
      }

      const dateMap = new Map(
        attendanceRecords.map((record) => [
          `${record.code.trim().toLowerCase()}-${new Date(record.date)
            .toISOString()
            .slice(0, 10)}`,
          record,
        ])
      );

      const empCode = code.trim().toLowerCase();
      for (const day of allDays) {
        const key = `${empCode}-${day.toISOString().slice(0, 10)}`;
        if (!dateMap.has(key)) {
          attendanceRecords.push({
            code: employee.code,
            name: employee.name,
            position: employee.position,
            status: "Absent",
            date: new Date(day),
          });
        }
      }
    }

    // Custom status priority
    const statusPriority = {
      Present: 6,
      Pending: 5,
      "Half Day": 4,
      Leave: 3,
      Absent: 1,
    };

    // Sort by date ASC, and within each date, by status priority DESC
    attendanceRecords.sort((a, b) => {
      const dateA = new Date(a.date).setHours(0, 0, 0, 0);
      const dateB = new Date(b.date).setHours(0, 0, 0, 0);

      if (dateA !== dateB) return dateA - dateB;

      // Same date: sort by status priority
      const priorityA = statusPriority[a.status] || 0;
      const priorityB = statusPriority[b.status] || 0;
      return priorityB - priorityA;
    });
    // Now calculate stats after all additions and sorting
    const employeeStats = {
      total: attendanceRecords.length,
      present: attendanceRecords.filter(
        (r) => r.status === "Present" || r.status === "Pending"
      ).length,
      absent: attendanceRecords.filter((r) => r.status === "Absent").length,
      halfdays: attendanceRecords.filter((r) => r.status === "Half Day").length,
      leave: attendanceRecords.filter(
        (r) => r.status === "Approved" || r.status === "Rejected"
      ).length,
    };

    res.status(200).json({
      message: "Attendance records fetched successfully",
      employeeName: employee.name,
      employeeCode: employee.code,
      employeePosition: employee.position,
      employeeStats,
      attendance: attendanceRecords,
    });
  } catch (error) {
    console.error("Error fetching attendance:", error);
    res.status(500).json({
      message: "Error fetching attendance",
      error: error.message,
    });
  }
};
// get attendance by date
exports.getAttendanceByDate = async (req, res) => {
  try {
    const { role } = req.user;
    const { date } = req.params;
    const { firms = [], tag } = req.query; // Changed to array

    if (!date) {
      return res.status(400).json({ message: "Date is required." });
    }

    // Normalize the date
    const selectedDate = new Date(date);
    selectedDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(selectedDate);
    nextDay.setDate(selectedDate.getDate() + 1);

    // Step 1: Get Firm Positions
    let firmPositions = [];
    if (firms.length) {
      const firmData = await ActorTypesHierarchy.find({ _id: { $in: firms } }); // Changed to find multiple firms
      if (!firmData.length) {
        return res.status(400).json({ message: "Invalid firm IDs." });
      }

      // Collect positions from all firms
      firmPositions = firmData.reduce((positions, firm) => {
        if (firm.hierarchy && Array.isArray(firm.hierarchy)) {
          positions.push(...firm.hierarchy);
        }
        return positions;
      }, []);
    }
    let employeeFilter = { status: "active" };
    if (role === "super_admin" || role === "admin") {
      employeeFilter.role = { $in: ["admin", "employee", "hr"] };
    } else if (role === "hr") {
      employeeFilter.role = { $in: ["employee"] };
    } else {
      return res.status(403).json({ message: "Unauthorized" });
    }

    if (tag) {
      // tag can be a string (single tag) or array (multiple tags)
      const tagArray = Array.isArray(tag) ? tag : [tag];
      employeeFilter.tags = { $in: tagArray };
    }

    if (firmPositions.length > 0) {
      employeeFilter.position = { $in: firmPositions };
    }
    const employees = await User.find(
      employeeFilter,
      "code name position"
    ).lean();

    // Step 3: Fetch Attendance Records (Include All)
    let attendanceRecords = await Attendance.find({
      date: { $gte: selectedDate, $lt: nextDay },
      code: { $in: employees.map((emp) => emp.code) }, // Ensure only firm employees are included
    }).lean();

    // Step 4: Convert attendance codes to a Set
    const presentCodes = new Set(
      attendanceRecords.map((record) => record.code.trim().toLowerCase())
    );

    // Step 5: Identify Absent Employees from the Firm
    const absentEmployees = employees.filter(
      (emp) => !presentCodes.has(emp.code.trim().toLowerCase())
    );

    absentEmployees.forEach((emp) => {
      attendanceRecords.push({
        code: emp.code,
        name: emp.name,
        position: emp.position,
        status: "Absent",
        date: selectedDate,
      });
    });

    // Step 6: Initialize and Count Attendance Statuses
    let attendanceCount = {
      halfDay: 0,
      present: 0,
      leave: 0,
      absent: 0,
      pending: 0,
      total: attendanceRecords.length,
    };

    attendanceRecords.forEach(({ status }) => {
      if (status === "Half Day") attendanceCount.halfDay++;
      else if (status === "Present") attendanceCount.present++;
      else if (status === "Pending") attendanceCount.pending++;
      else if (status === "Absent") attendanceCount.absent++;
      else if (status === "Leave") {
        attendanceCount.leave++;
      }
    });

    res.status(200).json({
      message: "Attendance counts fetched successfully",
      attendanceCount,
    });
  } catch (error) {
    console.error("Error fetching attendance:", error);
    res.status(500).json({
      message: "Error fetching attendance",
      error: error.message,
    });
  }
};

// exports.getLatestAttendance = async (req, res) => {
//   try {
//     const { role } = req.user;
//     const {
//       date,
//       month,
//       year = new Date().getFullYear(),
//       page = 1,
//       limit = 10,
//       search = "",
//       status = "",
//       firms = [],
//       tag,
//     } = req.query;

//     let firmPositions = [];
//     if (firms.length) {
//       const firmData = await ActorTypesHierarchy.find({ _id: { $in: firms } });
//       if (!firmData.length) {
//         return res.status(400).json({ message: "Invalid firm IDs." });
//       }

//       firmPositions = firmData.reduce((positions, firm) => {
//         if (firm.hierarchy && Array.isArray(firm.hierarchy)) {
//           positions.push(...firm.hierarchy);
//         }
//         return positions;
//       }, []);
//     }
//     let employeeFilter = { status: "active" };
//     if (role === "super_admin" || role === "admin") {
//       employeeFilter.role = { $in: ["admin", "employee", "hr"] };
//     } else if (role === "hr") {
//       employeeFilter.role = { $in: ["employee"] };
//     } else {
//       return res.status(403).json({ message: "Unauthorized" });
//     }

//     if (firmPositions.length) {
//       employeeFilter.position = { $in: firmPositions };
//     }
//     if (tag) {
//       // tag can be a string (single tag) or array (multiple tags)
//       const tagArray = Array.isArray(tag) ? tag : [tag];
//       employeeFilter.tags = { $in: tagArray };
//     }

//     const employees = await User.find(
//       employeeFilter,
//       "code name position"
//     ).lean();
//     if (!employees.length) {
//       return res.status(200).json({
//         message: "No employees found",
//         currentPage: Number(page),
//         totalRecords: 0,
//         totalPages: 0,
//         data: [],
//       });
//     }

//     const employeeMap = employees.reduce((acc, emp) => {
//       acc[emp.code.trim().toLowerCase()] = {
//         name: emp.name,
//         position: emp.position,
//       };
//       return acc;
//     }, {});

//     const employeeCodes = employees.map((emp) => emp.code);
//     let attendanceRecords = [];
//     let dateFilter = {};

//     // Handle date filtering
//     if (date) {
//       const startOfDay = new Date(date);
//       startOfDay.setHours(0, 0, 0, 0);
//       const endOfDay = new Date(date);
//       endOfDay.setHours(23, 59, 59, 999);
//       dateFilter = { $gte: startOfDay, $lte: endOfDay };
//     } else if (month && year) {
//       const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)); // April 1, 2025
//       const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)); // April 30, 2025
//       dateFilter = { $gte: start, $lte: end };
//       // console.log(start, end);
//     }

//     // Fetch attendance records
//     const rawRecords = await Attendance.find({
//       ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
//       code: { $in: employeeCodes },
//     })
//       .sort({ date: 1, punchIn: -1 })
//       .lean();

//     // console.log(rawRecords.slice(0, 10));
//     const attendanceMap = new Map();

//     for (const record of rawRecords) {
//       const key = `${record.code.trim().toLowerCase()}-${new Date(record.date)
//         .toISOString()
//         .slice(0, 10)}`;

//       if (!attendanceMap.has(key)) {
//         attendanceMap.set(key, record);
//       } else {
//         const existing = attendanceMap.get(key);
//         const priority = { Present: 3, "Half Day": 2, Absent: 1 };

//         if ((priority[record.status] || 0) > (priority[existing.status] || 0)) {
//           attendanceMap.set(key, record);
//         }
//       }
//     }

//     attendanceRecords = Array.from(attendanceMap.values());

//     // If a specific date is given (single day), handle absentees
//     if (date) {
//       const presentCodes = new Set(
//         attendanceRecords.map((r) => r.code.trim().toLowerCase())
//       );
//       employees.forEach((emp) => {
//         const empCode = emp.code.trim().toLowerCase();
//         if (!presentCodes.has(empCode)) {
//           attendanceRecords.push({
//             code: emp.code,
//             name: emp.name,
//             position: emp.position,
//             status: "Absent",
//             date: new Date(date),
//           });
//         }
//       });
//     }

//     // If month view, fill absent data for each day and employee
//     if (!date && month && year) {
//       const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)); // April 1, 2025
//       const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)); // April 30, 2025

//       const allDays = [];
//       let d = new Date(startDate);
//       while (d <= endDate) {
//         allDays.push(new Date(d));
//         d.setDate(d.getDate() + 1);
//       }

//       const dateMap = new Map(
//         attendanceRecords.map((record) => [
//           `${record.code.trim().toLowerCase()}-${new Date(record.date)
//             .toISOString()
//             .slice(0, 10)}`,
//           record,
//         ])
//       );

//       for (const emp of employees) {
//         const empCode = emp.code.trim().toLowerCase();
//         for (const day of allDays) {
//           const key = `${empCode}-${day.toISOString().slice(0, 10)}`;
//           if (!dateMap.has(key)) {
//             attendanceRecords.push({
//               code: emp.code,
//               name: emp.name,
//               position: emp.position,
//               status: "Absent",
//               date: new Date(day),
//             });
//           }
//         }
//       }
//     }

//     // Attach name, position, and calculate stats
//     //  const employeeStats = {};
//     attendanceRecords = attendanceRecords.map((record) => {
//       const normalizedCode = record.code.trim().toLowerCase();
//       const employee = employeeMap[normalizedCode];

//       //  if (!employeeStats[normalizedCode]) {
//       //    employeeStats[normalizedCode] = {
//       //      totalDays: 0,
//       //      presentDays: 0,
//       //      absentDays: 0,
//       //      halfDays: 0,
//       //    };
//       //  }

//       //  employeeStats[normalizedCode].totalDays++;
//       //  if (record.status === "Present")
//       //    employeeStats[normalizedCode].presentDays++;
//       //  else if (record.status === "Absent")
//       //    employeeStats[normalizedCode].absentDays++;
//       //  else if (record.status === "Half Day")
//       //    employeeStats[normalizedCode].halfDays++;

//       return {
//         ...record,
//         name: employee?.name || "Unknown",
//         position: employee?.position || "Unknown",
//         //  monthlyStats: employeeStats[normalizedCode],
//       };
//     });

//     // Filter by search
//     if (search) {
//       const regex = new RegExp(search, "i");
//       attendanceRecords = attendanceRecords.filter(
//         (rec) => regex.test(rec.code) || regex.test(rec.name)
//       );
//     }

//     // Filter by status
//     if (status) {
//       attendanceRecords = attendanceRecords.filter(
//         (rec) => rec.status === status
//       );
//     }

//     // Custom status priority
//     const statusPriority = {
//       Present: 6,
//       Pending: 5,
//       "Half Day": 4,
//       Leave: 3,
//       Absent: 1,
//     };

//     // Sort by date ASC, and within each date, by status priority DESC
//     attendanceRecords.sort((a, b) => {
//       const dateA = new Date(a.date).setHours(0, 0, 0, 0);
//       const dateB = new Date(b.date).setHours(0, 0, 0, 0);

//       if (dateA !== dateB) return dateA - dateB;

//       // Same date: sort by status priority
//       const priorityA = statusPriority[a.status] || 0;
//       const priorityB = statusPriority[b.status] || 0;
//       return priorityB - priorityA;
//     });

//     // Pagination
//     const totalRecords = attendanceRecords.length;
//     const totalPages = Math.ceil(totalRecords / limit);
//     const paginated = attendanceRecords.slice((page - 1) * limit, page * limit);

//     // Overall stats
//     // const overallStats = {
//     //   totalEmployees: employees.length,
//     //   totalDays: attendanceRecords.reduce(
//     //     (sum, r) => sum + (r.monthlyStats?.totalDays || 0),
//     //     0
//     //   ),
//     //   totalPresent: attendanceRecords.reduce(
//     //     (sum, r) => sum + (r.monthlyStats?.presentDays || 0),
//     //     0
//     //   ),
//     //   totalAbsent: attendanceRecords.reduce(
//     //     (sum, r) => sum + (r.monthlyStats?.absentDays || 0),
//     //     0
//     //   ),
//     //   totalHalfDays: attendanceRecords.reduce(
//     //     (sum, r) => sum + (r.monthlyStats?.halfDays || 0),
//     //     0
//     //   ),
//     // };

//     res.status(200).json({
//       message: "Attendance summary fetched successfully",
//       currentPage: Number(page),
//       totalRecords,
//       totalPages,
//       data: paginated,
//     });
//   } catch (error) {
//     console.error("Error fetching attendance summary:", error);
//     res.status(500).json({
//       message: "Error fetching attendance summary",
//       error: error.message,
//     });
//   }
// };

// nameeraaaa
exports.getLatestAttendance = async (req, res) => {
  try {
    const { role } = req.user;
    const {
      firmCodes,
      date,
      month,
      year = new Date().getFullYear(),
      page = 1,
      limit = 10,
      search = "",
      status = "",
      firms = [],
      tag,
    } = req.query;

    // 1️⃣ Validate firmCodes if provided
    let userCodes = [];
    let totalEligibleUsers = 0;
    if (firmCodes) {
      if (!firmCodes) {
        return res
          .status(400)
          .json({ message: "firmCodes are required in query when provided." });
      }

      const firmCodesArray = firmCodes.split(",").map((code) => code.trim());
      if (!Array.isArray(firmCodesArray) || firmCodesArray.length === 0) {
        return res
          .status(400)
          .json({ message: "firmCodes must be a comma-separated list." });
      }

      // 2️⃣ Find metadata entries where attendance is true
      const metaDataUsers = await MetaData.find({
        firm_code: { $in: firmCodesArray },
        attendance: true,
      });

      userCodes = metaDataUsers.map((meta) => meta.code);
      totalEligibleUsers = userCodes.length;

      if (totalEligibleUsers === 0) {
        return res.status(200).json({
          message: "No users with attendance:true found.",
          totalEligibleUsers,
          currentPage: Number(page),
          totalRecords: 0,
          totalPages: 0,
          data: [],
        });
      }
    }

    // 3️⃣ Handle firm hierarchy and role-based filtering
    let firmPositions = [];
    if (firms.length) {
      const firmData = await ActorTypesHierarchy.find({ _id: { $in: firms } });
      if (!firmData.length) {
        return res.status(400).json({ message: "Invalid firm IDs." });
      }

      firmPositions = firmData.reduce((positions, firm) => {
        if (firm.hierarchy && Array.isArray(firm.hierarchy)) {
          positions.push(...firm.hierarchy);
        }
        return positions;
      }, []);
    }

    let employeeFilter = { status: "active" };
    if (role === "super_admin" || role === "admin") {
      employeeFilter.role = { $in: ["admin", "employee", "hr"] };
    } else if (role === "hr") {
      employeeFilter.role = { $in: ["employee"] };
    } else {
      return res.status(403).json({ message: "Unauthorized" });
    }

    if (firmPositions.length) {
      employeeFilter.position = { $in: firmPositions };
    }
    if (tag) {
      const tagArray = Array.isArray(tag) ? tag : [tag];
      employeeFilter.tags = { $in: tagArray };
    }

    // 4️⃣ If firmCodes provided, filter employees by userCodes from MetaData
    if (firmCodes) {
      employeeFilter.code = { $in: userCodes };
    }

    // 5️⃣ Fetch employees
    const employees = await User.find(
      employeeFilter,
      "code name position"
    ).lean();
    // console.log(`Total active employees found: ${employees.length}`);
    // Log codes present in MetaData but not in active employees
    if (firmCodes) {
      const employeeCodes = employees.map((emp) =>
        emp.code.trim().toLowerCase()
      );
      const missingCodes = userCodes.filter(
        (code) => !employeeCodes.includes(code.trim().toLowerCase())
      );
      if (missingCodes.length > 0) {
        console.log(
          `Codes in MetaData (attendance: true) but not in active employees: ${missingCodes.join(
            ", "
          )}`
        );
      } else {
        console.log("All MetaData codes found in active employees.");
      }
    }
    if (!employees.length) {
      return res.status(200).json({
        message: "No employees found",
        totalEligibleUsers,
        currentPage: Number(page),
        totalRecords: 0,
        totalPages: 0,
        data: [],
      });
    }

    // 6️⃣ Create employee map
    const employeeMap = employees.reduce((acc, emp) => {
      acc[emp.code.trim().toLowerCase()] = {
        name: emp.name || emp.code,
        position: emp.position || "Unknown",
      };
      return acc;
    }, {});

    // 7️⃣ Apply search filter
    let filteredCodes = employees
      .map((emp) => emp.code)
      .filter((code) => {
        const normalizedCode = code.trim().toLowerCase();
        const name = employeeMap[normalizedCode]?.name?.toLowerCase() || "";
        const regex = new RegExp(search, "i");
        return regex.test(normalizedCode) || regex.test(name);
      });

    if (firmCodes && filteredCodes.length === 0) {
      return res.status(200).json({
        message: "No users match the search criteria.",
        totalEligibleUsers,
        currentPage: Number(page),
        totalRecords: 0,
        totalPages: 0,
        data: [],
      });
    }

    // 8️⃣ Build date filter
    let dateFilter = {};
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      dateFilter = { $gte: startOfDay, $lte: endOfDay };
    } else if (month && year) {
      const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
      const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      dateFilter = { $gte: start, $lte: end };
    }

    // 9️⃣ Fetch attendance records
    const rawRecords = await Attendance.find({
      ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
      code: { $in: filteredCodes },
    })
      .sort({ date: 1, punchIn: -1 })
      .lean();

    // 10️⃣ Deduplicate records by code and date, prioritizing higher status
    const attendanceMap = new Map();
    const statusPriority = {
      Present: 6,
      Pending: 5,
      "Half Day": 4,
      Leave: 3,
      Absent: 1,
    };

    for (const record of rawRecords) {
      const key = `${record.code.trim().toLowerCase()}-${new Date(record.date)
        .toISOString()
        .slice(0, 10)}`;
      if (!attendanceMap.has(key)) {
        attendanceMap.set(key, record);
      } else {
        const existing = attendanceMap.get(key);
        if (
          (statusPriority[record.status] || 0) >
          (statusPriority[existing.status] || 0)
        ) {
          attendanceMap.set(key, record);
        }
      }
    }

    let attendanceRecords = Array.from(attendanceMap.values());

    // 11️⃣ Handle absentees for single date
    if (date) {
      const presentCodes = new Set(
        attendanceRecords.map((r) => r.code.trim().toLowerCase())
      );
      filteredCodes.forEach((code) => {
        const normalizedCode = code.trim().toLowerCase();
        if (!presentCodes.has(normalizedCode)) {
          attendanceRecords.push({
            code,
            name: employeeMap[normalizedCode]?.name || code,
            position: employeeMap[normalizedCode]?.position || "Unknown",
            status: "Absent",
            date: new Date(date),
          });
        }
      });
    }

    // 12️⃣ Handle absentees for month view
    if (!date && month && year) {
      const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
      const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      const allDays = [];
      let d = new Date(startDate);
      while (d <= endDate) {
        allDays.push(new Date(d));
        d.setDate(d.getDate() + 1);
      }

      const dateMap = new Map(
        attendanceRecords.map((record) => [
          `${record.code.trim().toLowerCase()}-${new Date(record.date)
            .toISOString()
            .slice(0, 10)}`,
          record,
        ])
      );

      for (const code of filteredCodes) {
        const normalizedCode = code.trim().toLowerCase();
        for (const day of allDays) {
          const key = `${normalizedCode}-${day.toISOString().slice(0, 10)}`;
          if (!dateMap.has(key)) {
            attendanceRecords.push({
              code,
              name: employeeMap[normalizedCode]?.name || code,
              position: employeeMap[normalizedCode]?.position || "Unknown",
              status: "Absent",
              date: new Date(day),
            });
          }
        }
      }
    }

    // 13️⃣ Attach name and position
    attendanceRecords = attendanceRecords.map((record) => {
      const normalizedCode = record.code.trim().toLowerCase();
      const employee = employeeMap[normalizedCode];
      return {
        ...record,
        name: employee?.name || record.code,
        position: employee?.position || "Unknown",
      };
    });

    // 14️⃣ Apply status filter
    if (status) {
      attendanceRecords = attendanceRecords.filter(
        (rec) => rec.status === status
      );
    }

    // 15️⃣ Sort by date ASC and status priority DESC
    attendanceRecords.sort((a, b) => {
      const dateA = new Date(a.date).setHours(0, 0, 0, 0);
      const dateB = new Date(b.date).setHours(0, 0, 0, 0);
      if (dateA !== dateB) return dateA - dateB;
      const priorityA = statusPriority[a.status] || 0;
      const priorityB = statusPriority[b.status] || 0;
      return priorityB - priorityA;
    });

    // 16️⃣ Pagination
    const totalRecords = attendanceRecords.length;
    const totalPages = Math.ceil(totalRecords / limit);
    const paginated = attendanceRecords.slice((page - 1) * limit, page * limit);

    // 17️⃣ Return response
    res.status(200).json({
      message: "Attendance summary fetched successfully",
      totalEligibleUsers: firmCodes ? totalEligibleUsers : employees.length,
      currentPage: Number(page),
      totalRecords,
      totalPages,
      data: paginated,
    });
  } catch (error) {
    console.error("Error fetching attendance summary:", error);
    res.status(500).json({
      message: "Error fetching attendance summary",
      error: error.message,
    });
  }
};
exports.editAttendanceByID = async (req, res) => {
  try {
    const { role } = req.user;

    // Check if role is one of the allowed roles
    if (!["admin", "super_admin", "hr"].includes(role)) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { id } = req.params;
    const update = req.body;

    const AttendanceEntity = await Attendance.findById(id);
    if (!AttendanceEntity) {
      return res.status(404).json({ message: "Attendance record not found" });
    }

    // Calculate hoursWorked if both punchIn and punchOut are provided
    if (update.punchIn && update.punchOut) {
      const punchInTime = new Date(update.punchIn);
      const punchOutTime = new Date(update.punchOut);

      let adjustedPunchOutTime = new Date(punchOutTime);

      // Handle night shift (if punchOut is earlier than punchIn, assume next day)
      if (adjustedPunchOutTime <= punchInTime) {
        adjustedPunchOutTime.setDate(adjustedPunchOutTime.getDate() + 1);
      }

      const diffMs = adjustedPunchOutTime - punchInTime;
      const hoursWorked = diffMs / (1000 * 60 * 60);

      update.hoursWorked = Math.round(hoursWorked * 100) / 100;
    }

    const updateData = await Attendance.findByIdAndUpdate(id, update, {
      new: true,
    });

    return res.status(200).json({
      message: "Attendance record updated successfully",
      data: updateData,
    });
  } catch (error) {
    console.error("Error updating attendance:", error);
    return res.status(500).json({
      message: "Error updating attendance",
      error: error.message,
    });
  }
};

// exports.downloadAllAttendance = async (req, res) => {
//   try {
//     const { role } = req.user;
//     const {
//       date,
//       month,
//       year = new Date().getFullYear(),
//       search = "",
//       status = "",
//       firms = [],
//       tag,
//     } = req.query;

//     let firmPositions = [];
//     if (firms.length) {
//       const firmData = await ActorTypesHierarchy.find({ _id: Conditions });
//       if (!firmData.length) {
//         return res.status(400).json({ message: "Invalid firm IDs." });
//       }
//       firmPositions = firmData.reduce((positions, firm) => {
//         if (firm.hierarchy && Array.isArray(firm.hierarchy)) {
//           positions.push(...firm.hierarchy);
//         }
//         return positions;
//       }, []);
//     }

//     let employeeFilter = { status: "active" };
//     if (role === "super_admin" || role === "admin") {
//       employeeFilter.role = { $in: ["admin", "employee", "hr"] };
//     } else if (role === "hr") {
//       employeeFilter.role = { $in: ["employee"] };
//     } else {
//       return res.status(403).json({ message: "Unauthorized" });
//     }

//     if (firmPositions.length) {
//       employeeFilter.position = { $in: firmPositions };
//     }

//     // Add tag filter
//     if (tag) {
//       const tagArray = Array.isArray(tag) ? tag : [tag];
//       employeeFilter.tags = { $in: tagArray };
//     }

//     // Fetch employees with siddha_code
//     const employees = await User.find(
//       employeeFilter,
//       "code name position tags siddha_code" // Added siddha_code
//     ).lean();

//     if (!employees.length) {
//       return res.status(200).json({
//         message: "No employees found",
//         data: [],
//       });
//     }

//     // Include siddha_code in employeeMap
//     const employeeMap = employees.reduce((acc, emp) => {
//       acc[emp.code.trim().toLowerCase()] = {
//         name: emp.name,
//         position: emp.position,
//         tags: emp.tags,
//         siddha_code: emp.siddha_code, // Added siddha_code
//       };
//       return acc;
//     }, {});

//     const employeeCodes = employees.map((emp) => emp.code);
//     let attendanceRecords = [];
//     let dateFilter = {};

//     // Handle date filtering
//     if (date) {
//       const startOfDay = new Date(date);
//       startOfDay.setHours(0, 0, 0, 0);
//       const endOfDay = new Date(date);
//       endOfDay.setHours(23, 59, 59, 999);
//       dateFilter = { $gte: startOfDay, $lte: endOfDay };
//     } else if (month && year) {
//       const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
//       const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
//       dateFilter = { $gte: start, $lte: end };
//     }

//     // Fetch attendance records
//     const rawRecords = await Attendance.find({
//       ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
//       code: { $in: employeeCodes },
//     })
//       .sort({ date: 1, punchIn: -1 })
//       .lean();

//     const attendanceMap = new Map();

//     for (const record of rawRecords) {
//       const key = `${record.code.trim().toLowerCase()}-${new Date(record.date)
//         .toISOString()
//         .slice(0, 10)}`;

//       if (!attendanceMap.has(key)) {
//         attendanceMap.set(key, record);
//       } else {
//         const existing = attendanceMap.get(key);
//         const priority = { Present: 3, "Half Day": 2, Absent: 1 };

//         if ((priority[record.status] || 0) > (priority[existing.status] || 0)) {
//           attendanceMap.set(key, record);
//         }
//       }
//     }

//     attendanceRecords = Array.from(attendanceMap.values());

//     // If a specific date is given (single day), handle absentees
//     if (date) {
//       const presentCodes = new Set(
//         attendanceRecords.map((r) => r.code.trim().toLowerCase())
//       );
//       employees.forEach((emp) => {
//         const empCode = emp.code.trim().toLowerCase();
//         if (!presentCodes.has(empCode)) {
//           attendanceRecords.push({
//             code: emp.code,
//             name: emp.name,
//             position: emp.position,
//             status: "Absent",
//             date: new Date(date),
//             tags: emp.tags,
//             siddha_code: emp.siddha_code, // Added siddha_code
//           });
//         }
//       });
//     }

//     // If month view, fill absent data for each day and employee
//     if (!date && month && year) {
//       const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
//       const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

//       const allDays = [];
//       let d = new Date(startDate);
//       while (d <= endDate) {
//         allDays.push(new Date(d));
//         d.setDate(d.getDate() + 1);
//       }

//       const dateMap = new Map(
//         attendanceRecords.map((record) => [
//           `${record.code.trim().toLowerCase()}-${new Date(record.date)
//             .toISOString()
//             .slice(0, 10)}`,
//           record,
//         ])
//       );

//       for (const emp of employees) {
//         const empCode = emp.code.trim().toLowerCase();
//         for (const day of allDays) {
//           const key = `${empCode}-${day.toISOString().slice(0, 10)}`;
//           if (!dateMap.has(key)) {
//             attendanceRecords.push({
//               code: emp.code,
//               name: emp.name,
//               position: emp.position,
//               status: "Absent",
//               date: new Date(day),
//               tags: emp.tags,
//               siddha_code: emp.siddha_code, // Added siddha_code
//             });
//           }
//         }
//       }
//     }

//     // Attach name, position, tags, and siddha_code
//     attendanceRecords = attendanceRecords.map((record) => {
//       const normalizedCode = record.code.trim().toLowerCase();
//       const employee = employeeMap[normalizedCode];

//       return {
//         ...record,
//         name: employee?.name || "Unknown",
//         position: employee?.position || "Unknown",
//         tags: record.tags || employee?.tags || [],
//         siddha_code: record.siddha_code || employee?.siddha_code || "N/A", // Added siddha_code
//       };
//     });

//     // Filter by search
//     if (search) {
//       const regex = new RegExp(search, "i");
//       attendanceRecords = attendanceRecords.filter(
//         (rec) =>
//           regex.test(rec.code) ||
//           regex.test(rec.name) ||
//           regex.test(rec.siddha_code) // Include siddha_code in search
//       );
//     }

//     // Filter by status
//     if (status) {
//       attendanceRecords = attendanceRecords.filter(
//         (rec) => rec.status === status
//       );
//     }

//     // Custom status priority
//     const statusPriority = {
//       Present: 6,
//       Pending: 5,
//       "Half Day": 4,
//       Leave: 3,
//       Absent: 1,
//     };

//     // Sort by date ASC, and within each date, by status priority DESC
//     attendanceRecords.sort((a, b) => {
//       const dateA = new Date(a.date).setHours(0, 0, 0, 0);
//       const dateB = new Date(b.date).setHours(0, 0, 0, 0);

//       if (dateA !== dateB) return dateA - dateB;

//       const priorityA = statusPriority[a.status] || 0;
//       const priorityB = statusPriority[b.status] || 0;
//       return priorityB - priorityA;
//     });

//     // Format data for CSV export
//     const formattedAttendance = attendanceRecords.map((record) => ({
//       Name: record.name || "Unknown",
//       Code: record.code,
//       "Siddha Code": record.siddha_code || "N/A", // Added Siddha Code
//       Position: record.position || "Unknown",
//       Date: record.date
//         ? new Date(record.date).toISOString().split("T")[0]
//         : "N/A",
//       "Punch In Time": record.punchIn
//         ? new Date(record.punchIn).toLocaleTimeString("en-IN", {
//             timeZone: "Asia/Kolkata",
//           })
//         : "N/A",
//       "Punch In Out": record.punchOut
//         ? new Date(record.punchOut).toLocaleTimeString("en-IN", {
//             timeZone: "Asia/Kolkata",
//           })
//         : "N/A",
//       Status: record.status,
//       "Working Hours": record.hoursWorked || "0",
//       Tags:
//         Array.isArray(record.tags) && record.tags.length
//           ? record.tags.join("; ")
//           : "N/A",
//     }));

//     const fields = [
//       "Name",
//       "Code",
//       "Siddha Code", // Added Siddha Code to fields
//       "Position",
//       "Date",
//       "Punch In Time",
//       "Punch In Out",
//       "Status",
//       "Working Hours",
//       "Tags",
//     ];
//     const parser = new Parser({ fields });
//     const csv = parser.parse(formattedAttendance);

//     res.header("Content-Type", "text/csv");
//     res.attachment("attendance_data.csv");
//     return res.send(csv);
//   } catch (error) {
//     console.error("Error downloading attendance data:", error);
//     res.status(500).json({
//       message: "Error downloading attendance data",
//       error: error.message,
//     });
//   }
// };

// nameeraaa
exports.downloadAllAttendance = async (req, res) => {
  try {
    const { role } = req.user;
    const {
      firmCodes,
      date,
      month,
      year = new Date().getFullYear(),
      search = "",
      status = "",
      firms = [],
      tag,
    } = req.query;

    // 1️⃣ Validate firmCodes if provided
    let userCodes = [];
    let totalEligibleUsers = 0;
    if (firmCodes) {
      if (!firmCodes) {
        return res
          .status(400)
          .json({ message: "firmCodes are required in query when provided." });
      }

      const firmCodesArray = firmCodes.split(",").map((code) => code.trim());
      if (!Array.isArray(firmCodesArray) || firmCodesArray.length === 0) {
        return res
          .status(400)
          .json({ message: "firmCodes must be a comma-separated list." });
      }

      // 2️⃣ Find metadata entries where attendance is true
      const metaDataUsers = await MetaData.find({
        firm_code: { $in: firmCodesArray },
        attendance: true,
      });

      userCodes = metaDataUsers.map((meta) => meta.code);
      totalEligibleUsers = userCodes.length;

      if (totalEligibleUsers === 0) {
        return res.status(200).json({
          message: "No users with attendance:true found.",
          data: [],
        });
      }
    }

    // 3️⃣ Handle firm hierarchy and role-based filtering
    let firmPositions = [];
    if (firms.length) {
      const firmData = await ActorTypesHierarchy.find({ _id: { $in: firms } });
      if (!firmData.length) {
        return res.status(400).json({ message: "Invalid firm IDs." });
      }
      firmPositions = firmData.reduce((positions, firm) => {
        if (firm.hierarchy && Array.isArray(firm.hierarchy)) {
          positions.push(...firm.hierarchy);
        }
        return positions;
      }, []);
    }

    let employeeFilter = { status: "active" };
    if (role === "super_admin" || role === "admin") {
      employeeFilter.role = { $in: ["admin", "employee", "hr"] };
    } else if (role === "hr") {
      employeeFilter.role = { $in: ["employee"] };
    } else {
      return res.status(403).json({ message: "Unauthorized" });
    }

    if (firmPositions.length) {
      employeeFilter.position = { $in: firmPositions };
    }

    // Add tag filter
    if (tag) {
      const tagArray = Array.isArray(tag) ? tag : [tag];
      employeeFilter.tags = { $in: tagArray };
    }

    // 4️⃣ If firmCodes provided, filter employees by userCodes from MetaData
    if (firmCodes) {
      employeeFilter.code = { $in: userCodes };
    }

    // 5️⃣ Fetch employees with siddha_code
    const employees = await User.find(
      employeeFilter,
      "code name position tags siddha_code"
    ).lean();

    // 6️⃣ Log codes present in MetaData but not in active employees
    if (firmCodes) {
      const employeeCodes = employees.map((emp) =>
        emp.code.trim().toLowerCase()
      );
      const missingCodes = userCodes.filter(
        (code) => !employeeCodes.includes(code.trim().toLowerCase())
      );
      if (missingCodes.length > 0) {
        console.log(
          `Codes in MetaData (attendance: true) but not in active employees: ${missingCodes.join(
            ", "
          )}`
        );
      } else {
        console.log("All MetaData codes found in active employees.");
      }
    }

    if (!employees.length) {
      return res.status(200).json({
        message: "No employees found",
        data: [],
      });
    }

    // 7️⃣ Include siddha_code in employeeMap
    const employeeMap = employees.reduce((acc, emp) => {
      acc[emp.code.trim().toLowerCase()] = {
        name: emp.name,
        position: emp.position,
        tags: emp.tags,
        siddha_code: emp.siddha_code,
      };
      return acc;
    }, {});

    const employeeCodes = employees.map((emp) => emp.code);
    let attendanceRecords = [];
    let dateFilter = {};

    // 8️⃣ Handle date filtering
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      dateFilter = { $gte: startOfDay, $lte: endOfDay };
    } else if (month && year) {
      const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
      const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      dateFilter = { $gte: start, $lte: end };
    }

    // 9️⃣ Fetch attendance records
    const rawRecords = await Attendance.find({
      ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
      code: { $in: employeeCodes },
    })
      .sort({ date: 1, punchIn: -1 })
      .lean();

    const attendanceMap = new Map();
    const statusPriority = {
      Present: 6,
      Pending: 5,
      "Half Day": 4,
      Leave: 3,
      Absent: 1,
    };

    for (const record of rawRecords) {
      const key = `${record.code.trim().toLowerCase()}-${new Date(record.date)
        .toISOString()
        .slice(0, 10)}`;

      if (!attendanceMap.has(key)) {
        attendanceMap.set(key, record);
      } else {
        const existing = attendanceMap.get(key);
        if (
          (statusPriority[record.status] || 0) >
          (statusPriority[existing.status] || 0)
        ) {
          attendanceMap.set(key, record);
        }
      }
    }

    attendanceRecords = Array.from(attendanceMap.values());

    // 10️⃣ If a specific date is given (single day), handle absentees
    if (date) {
      const presentCodes = new Set(
        attendanceRecords.map((r) => r.code.trim().toLowerCase())
      );
      employees.forEach((emp) => {
        const empCode = emp.code.trim().toLowerCase();
        if (!presentCodes.has(empCode)) {
          attendanceRecords.push({
            code: emp.code,
            name: emp.name,
            position: emp.position,
            status: "Absent",
            date: new Date(date),
            tags: emp.tags,
            siddha_code: emp.siddha_code,
          });
        }
      });
    }

    // 11️⃣ If month view, fill absent data for each day and employee
    if (!date && month && year) {
      const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
      const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

      const allDays = [];
      let d = new Date(startDate);
      while (d <= endDate) {
        allDays.push(new Date(d));
        d.setDate(d.getDate() + 1);
      }

      const dateMap = new Map(
        attendanceRecords.map((record) => [
          `${record.code.trim().toLowerCase()}-${new Date(record.date)
            .toISOString()
            .slice(0, 10)}`,
          record,
        ])
      );

      for (const emp of employees) {
        const empCode = emp.code.trim().toLowerCase();
        for (const day of allDays) {
          const key = `${empCode}-${day.toISOString().slice(0, 10)}`;
          if (!dateMap.has(key)) {
            attendanceRecords.push({
              code: emp.code,
              name: emp.name,
              position: emp.position,
              status: "Absent",
              date: new Date(day),
              tags: emp.tags,
              siddha_code: emp.siddha_code,
            });
          }
        }
      }
    }

    // 12️⃣ Attach name, position, tags, and siddha_code
    attendanceRecords = attendanceRecords.map((record) => {
      const normalizedCode = record.code.trim().toLowerCase();
      const employee = employeeMap[normalizedCode];

      return {
        ...record,
        name: employee?.name || "Unknown",
        position: employee?.position || "Unknown",
        tags: record.tags || employee?.tags || [],
        siddha_code: record.siddha_code || employee?.siddha_code || "N/A",
      };
    });

    // 13️⃣ Filter by search
    if (search) {
      const regex = new RegExp(search, "i");
      attendanceRecords = attendanceRecords.filter(
        (rec) =>
          regex.test(rec.code) ||
          regex.test(rec.name) ||
          regex.test(rec.siddha_code)
      );
    }

    // 14️⃣ Filter by status
    if (status) {
      attendanceRecords = attendanceRecords.filter(
        (rec) => rec.status === status
      );
    }

    // 15️⃣ Sort by date ASC, and within each date, by status priority DESC
    attendanceRecords.sort((a, b) => {
      const dateA = new Date(a.date).setHours(0, 0, 0, 0);
      const dateB = new Date(b.date).setHours(0, 0, 0, 0);

      if (dateA !== dateB) return dateA - dateB;

      const priorityA = statusPriority[a.status] || 0;
      const priorityB = statusPriority[b.status] || 0;
      return priorityB - priorityA;
    });

    // 16️⃣ Format data for CSV export
    const formattedAttendance = attendanceRecords.map((record) => ({
      Name: record.name || "Unknown",
      Code: record.code,
      "Siddha Code": record.siddha_code || "N/A",
      Position: record.position || "Unknown",
      Date: record.date
        ? new Date(record.date).toISOString().split("T")[0]
        : "N/A",
      "Punch In Time": record.punchIn
        ? new Date(record.punchIn).toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata",
          })
        : "N/A",
      "Punch In Out": record.punchOut
        ? new Date(record.punchOut).toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata",
          })
        : "N/A",
      Status: record.status,
      "Working Hours": record.hoursWorked || "0",
      Tags:
        Array.isArray(record.tags) && record.tags.length
          ? record.tags.join("; ")
          : "N/A",
    }));

    const fields = [
      "Name",
      "Code",
      "Siddha Code",
      "Position",
      "Date",
      "Punch In Time",
      "Punch In Out",
      "Status",
      "Working Hours",
      "Tags",
    ];
    const parser = new Parser({ fields });
    const csv = parser.parse(formattedAttendance);

    res.header("Content-Type", "text/csv");
    res.attachment("attendance_data.csv");
    return res.send(csv);
  } catch (error) {
    console.error("Error downloading attendance data:", error);
    res.status(500).json({
      message: "Error downloading attendance data",
      error: error.message,
    });
  }
};

exports.deleteAttendanceByID = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "Id is not given" });
    }

    const employee = await Attendance.findById(id);

    if (!employee) {
      return res
        .status(400)
        .json({ success: false, message: "Employee not found" });
    }

    await Attendance.findByIdAndDelete(id);

    return res
      .status(200)
      .json({ success: true, message: " successfully delete employee" });
  } catch (err) {
    console.error("Error in deleteAttendanceByID:", err);
    console.error("Error stack:", err.stack);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
};

exports.getJaipurDealers = async (req, res) => {
  try {
    const { search } = req.query;

    // Build the search query object
    let searchQuery = { district: "Jaipur" };

    // If a search term is provided, add it to the query for name and code fields
    if (search) {
      searchQuery = {
        $or: [
          { name: { $regex: search, $options: "i" } }, // Case-insensitive search for name
          { code: { $regex: search, $options: "i" } }, // Case-insensitive search for code
          { district: { $regex: search, $options: "i" } }, // Case-insensitive search for district
          { taluka: { $regex: search, $options: "i" } }, // Case-insensitive search for taluka
          { zone: { $regex: search, $options: "i" } }, // Case-insensitive search for zone
        ],
      };
    }

    // Fetch the dealers based on the search query
    const jaipurDealers = await User.find(searchQuery);

    if (jaipurDealers.length === 0) {
      return res.status(404).json({ message: "No dealers found" });
    }

    res.status(200).json({
      message: "Dealers fetched successfully",
      data: jaipurDealers,
    });
  } catch (error) {
    console.error("Error in getting dealers:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

//add attendance by admin
exports.addAttendanceByAdmin = async (req, res) => {
  try {
    const name = req.user.name;
    const role = req.user.role;
    const {
      code,
      date,
      punchIn,
      punchOut,
      status = "Present",
      latitude,
      longitude,
      remark,
      punchOutLatitude,
      punchOutLongitude,
    } = req.body;

    const user = await User.findOne({ code });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    if (role === "admin" && user.role === "admin") {
      return res
        .status(400)
        .json({ message: "You are not authorized to add attendance" });
    }

    // Validate required fields
    if (!code || !date || !latitude || !longitude || !remark) {
      return res.status(400).json({
        message: "All fields are required",
        received: { code, date, punchIn, latitude, longitude, remark },
      });
    }

    let punchInDate = null;
    let punchOutDate = null;
    let hoursWorked = 0;
    let existingAttendance = null;

    // Handle punch-in
    if (punchIn) {
      existingAttendance = await Attendance.findOne({
        code,
        date: new Date(date),
        punchIn: { $ne: null },
      });

      if (existingAttendance) {
        return res.status(400).json({ message: "Attendance already exists" });
      }
      punchInDate = DateTime.fromISO(`${date}T${punchIn}`, {
        zone: "Asia/Kolkata",
      })
        .toUTC()
        .toJSDate();
    }

    // Handle punch-out
    if (punchOut) {
      if (!punchOutLatitude || !punchOutLongitude) {
        return res.status(400).json({
          message: "Punch out latitude and longitude are required",
        });
      }

      // If no punch-in provided, check for existing punch-in record
      if (!punchIn) {
        existingAttendance = await Attendance.findOne({
          code,
          date: new Date(date),
          punchIn: { $ne: null },
          punchOut: null,
        });

        if (!existingAttendance) {
          return res
            .status(400)
            .json({ message: "No punch-in record found for this date" });
        }

        punchInDate = existingAttendance.punchIn;
      }

      punchOutDate = DateTime.fromISO(`${date}T${punchOut}`, {
        zone: "Asia/Kolkata",
      })
        .toUTC()
        .toJSDate();

      // Handle night shift (if punch-out time is earlier than punch-in, assume next day)
      if (punchOutDate <= punchInDate) {
        punchOutDate.setDate(punchOutDate.getDate() + 1);
      }

      hoursWorked = (punchOutDate - punchInDate) / (1000 * 60 * 60);
    }

    if (!punchInDate && !punchOutDate) {
      return res
        .status(400)
        .json({ message: "Punch in and punch out are required" });
    }

    let attendance;
    if (existingAttendance) {
      // Update existing attendance record
      existingAttendance.punchOut = punchOutDate;
      existingAttendance.punchOutName = name;
      existingAttendance.punchOutLatitude = punchOutLatitude;
      existingAttendance.punchOutLongitude = punchOutLongitude;
      existingAttendance.hoursWorked = Math.round(hoursWorked * 100) / 100;
      attendance = await existingAttendance.save();
    } else {
      // Create new attendance record
      attendance = await Attendance.create({
        code,
        date: new Date(date),
        status,
        punchIn: punchInDate,
        punchInName: name,
        punchOut: punchOutDate,
        punchOutName: punchOut ? name : null,
        punchInLatitude: latitude,
        punchInLongitude: longitude,
        remark: remark,
        punchOutLatitude: punchOutLatitude || null,
        punchOutLongitude: punchOutLongitude || null,
        hoursWorked: Math.round(hoursWorked * 100) / 100,
      });
    }

    return res.status(200).json({
      message: "Attendance added successfully",
      data: attendance,
    });
  } catch (error) {
    console.error("Error adding attendance:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

//get attendance add by admin
exports.getAddedAttendanceByAdmin = async (req, res) => {
  try {
    const { date, month, year = new Date().getFullYear() } = req.query;

    // Build query
    const query = {
      remark: { $ne: null },
    };

    if (date) {
      const targetDate = new Date(date);
      targetDate.setUTCHours(0, 0, 0, 0);
      query.date = targetDate;
    } else if (month && year) {
      const start = new Date(Date.UTC(year, month - 1, 1));
      const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      query.date = { $gte: start, $lte: end };
    }

    // Fetch employees created by admin
    const employees = await User.find(
      { role: "employee" },
      "code name position"
    ).lean();

    const employeeMap = employees.reduce((acc, emp) => {
      acc[emp.code.trim().toLowerCase()] = {
        name: emp.name,
        position: emp.position,
      };
      return acc;
    }, {});

    // Count and paginate attendance
    const totalAttendance = await Attendance.countDocuments(query);

    const attendance = await Attendance.find(query).sort({ date: -1 }).lean();

    const attendanceRecords = attendance.map((record) => {
      const normalizedCode = record.code.trim().toLowerCase();
      const employee = employeeMap[normalizedCode];

      return {
        ...record,
        name: employee?.name || "Unknown",
        position: employee?.position || "Unknown",
      };
    });

    return res.status(200).json({
      message: "Attendance fetched successfully",
      data: attendanceRecords,
      totalAttendance,
    });
  } catch (error) {
    console.error("Error fetching attendance:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};


// controllers/attendanceGeo.controller.js

exports.getAttendanceGeoLatest = async (req, res) => {
  try {
    const { role } = req.user || {};
    const {
      firmCodes,        // eg: "RAJ, MP, GJ"
      date,
      month,
      year = new Date().getFullYear(),
      page = 1,
      limit = 200,      // map usually wants many; tweak as you wish
      search = "",
      status = "",
      firms = [],
      tag,
    } = req.query;

    // -------------------------------
    // 1) Resolve firmCodes -> MetaData(attendance:true) -> user codes
    // -------------------------------
    let userCodes = [];
    let totalEligibleUsers = 0;
    if (firmCodes) {
      const firmCodesArray = firmCodes.split(",").map((c) => c.trim()).filter(Boolean);
      if (!firmCodesArray.length) {
        return res.status(400).json({ message: "firmCodes must be a comma-separated list." });
      }

      const metaDataUsers = await MetaData.find({
        firm_code: { $in: firmCodesArray },
        attendance: true,
      }, { code: 1 }).lean();

      userCodes = metaDataUsers.map(m => (m.code || "").trim());
      totalEligibleUsers = userCodes.length;

      if (totalEligibleUsers === 0) {
        return res.status(200).json({
          message: "No users with attendance:true for provided firmCodes.",
          totalEligibleUsers,
          currentPage: Number(page),
          totalRecords: 0,
          totalPages: 0,
          plottedCount: 0,
          data: [],
          stats: { byStatus: {} },
        });
      }
    }

    // -------------------------------
    // 2) Firm hierarchy + role-based employee scope
    // -------------------------------
    let firmPositions = [];
    const firmIds = Array.isArray(firms) ? firms : (firms ? [firms] : []);
    if (firmIds.length) {
      const firmData = await ActorTypesHierarchy.find({ _id: { $in: firmIds } }, { hierarchy: 1 }).lean();
      if (!firmData.length) return res.status(400).json({ message: "Invalid firm IDs." });
      firmPositions = firmData.flatMap(f => Array.isArray(f.hierarchy) ? f.hierarchy : []);
    }

    const employeeFilter = { status: "active" };
    if (role === "super_admin" || role === "admin") {
      employeeFilter.role = { $in: ["admin", "employee", "hr"] };
    } else if (role === "hr") {
      employeeFilter.role = { $in: ["employee"] };
    } else {
      return res.status(403).json({ message: "Unauthorized" });
    }

    if (firmPositions.length) {
      employeeFilter.position = { $in: firmPositions };
    }
    if (tag) {
      const tagArray = Array.isArray(tag) ? tag : [tag];
      employeeFilter.tags = { $in: tagArray };
    }
    if (firmCodes) {
      employeeFilter.code = { $in: userCodes };
    }

    // -------------------------------
    // 3) Fetch employees + search (code or name)
    // -------------------------------
    const employees = await User.find(employeeFilter, { code: 1, name: 1, position: 1 }).lean();
    if (!employees.length) {
      return res.status(200).json({
        message: "No employees found for the given scope.",
        totalEligibleUsers: firmCodes ? totalEligibleUsers : 0,
        currentPage: Number(page),
        totalRecords: 0,
        totalPages: 0,
        plottedCount: 0,
        data: [],
        stats: { byStatus: {} },
      });
    }

    const employeeMap = new Map(
      employees.map(e => [e.code.trim().toLowerCase(), { name: e.name || e.code, position: e.position || "Unknown" }])
    );

    const filteredCodes = employees
      .map(e => e.code)
      .filter(code => {
        const q = (search || "").trim().toLowerCase();
        if (!q) return true;
        const norm = code.trim().toLowerCase();
        const name = (employeeMap.get(norm)?.name || "").toLowerCase();
        return norm.includes(q) || name.includes(q);
      });

    if (!filteredCodes.length) {
      return res.status(200).json({
        message: "No employees match the search.",
        totalEligibleUsers: firmCodes ? totalEligibleUsers : employees.length,
        currentPage: Number(page),
        totalRecords: 0,
        totalPages: 0,
        plottedCount: 0,
        data: [],
        stats: { byStatus: {} },
      });
    }

    // -------------------------------
    // 4) Build date filter
    // -------------------------------
    let dateFilter = {};
    if (date) {
      const start = new Date(date); start.setHours(0,0,0,0);
      const end   = new Date(date); end.setHours(23,59,59,999);
      dateFilter = { $gte: start, $lte: end };
    } else if (month && year) {
      const start = new Date(Date.UTC(Number(year), Number(month) - 1, 1, 0, 0, 0, 0));
      const end   = new Date(Date.UTC(Number(year), Number(month), 0, 23, 59, 59, 999));
      dateFilter = { $gte: start, $lte: end };
    }

    // -------------------------------
    // 5) Fetch ONLY geo-coded attendance
    //    prefer punchOut coords; else punchIn
    // -------------------------------
    const geoFilter = {
      code: { $in: filteredCodes },
      ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
      $or: [
        { punchOutLatitude: { $ne: null }, punchOutLongitude: { $ne: null } },
        { punchInLatitude: { $ne: null }, punchInLongitude: { $ne: null } },
      ],
    };

    if (status) {
      geoFilter.status = status; // note: "Absent" will naturally drop because it has no coords
    }

    // Sort to let us keep "latest" easily (prefer out > in; then by times; then update recency)
    const raw = await Attendance.find(geoFilter).sort({
      date: 1,
      punchOut: -1,
      punchIn: -1,
      updatedAt: -1,
    }).lean();

    // -------------------------------
    // 6) Deduplicate for map:
    //   - if 'date' provided   → keep latest per user (code) for that day
    //   - if 'month+year'      → keep latest per user per day
    // -------------------------------
    const pickKey = (rec) => {
      const day = new Date(rec.date).toISOString().slice(0, 10);
      const code = rec.code.trim().toLowerCase();
      return date ? code : `${code}-${day}`;
    };

    const bestByKey = new Map();
    for (const r of raw) {
      const k = pickKey(r);
      if (!bestByKey.has(k)) bestByKey.set(k, r);
      // already sorted to latest first, so first seen wins
    }

    let records = Array.from(bestByKey.values());

    // -------------------------------
    // 7) Shape payload for map + attach name/position + prefer punchOut coords
    // -------------------------------
    const payload = records.map((r) => {
      const norm = r.code.trim().toLowerCase();
      const emp = employeeMap.get(norm) || {};
      const hasOut = r.punchOutLatitude != null && r.punchOutLongitude != null;

      const latitude  = hasOut ? r.punchOutLatitude  : r.punchInLatitude;
      const longitude = hasOut ? r.punchOutLongitude : r.punchInLongitude;

      return {
        _id: r._id,
        code: r.code,
        name: emp.name || r.code,
        position: emp.position || "Unknown",
        date: r.date,
        status: r.status,
        punchIn: r.punchIn || null,
        punchOut: r.punchOut || null,
        punchInImage: r.punchInImage || null,
        punchOutImage: r.punchOutImage || null,
        punchInName: r.punchInName || r.punchInCode || null,
        punchOutName: r.punchOutName || r.punchOutCode || null,
        hoursWorked: r.hoursWorked ?? null,
        latitude: typeof latitude === "object" && latitude?.$numberDecimal ? Number(latitude.$numberDecimal) : latitude,
        longitude: typeof longitude === "object" && longitude?.$numberDecimal ? Number(longitude.$numberDecimal) : longitude,
        distance: r.distance ?? null,
      };
    })
    // ensure coords exist after normalization
    .filter(p => typeof p.latitude === "number" && typeof p.longitude === "number");

    // quick status stats (for overlay bars etc.)
    const byStatus = {};
    for (const p of payload) byStatus[p.status] = (byStatus[p.status] || 0) + 1;

    // -------------------------------
    // 8) Pagination (optional for map UI)
    // -------------------------------
    const totalRecords = payload.length;
    const totalPages = Math.ceil(totalRecords / Number(limit));
    const startIdx = (Number(page) - 1) * Number(limit);
    const pageData = payload.slice(startIdx, startIdx + Number(limit));

    return res.status(200).json({
      message: "Geo attendance fetched successfully",
      scopeSize: filteredCodes.length,
      totalEligibleUsers: firmCodes ? totalEligibleUsers : filteredCodes.length,
      currentPage: Number(page),
      totalRecords,
      totalPages,
      plottedCount: pageData.length,
      stats: { byStatus },
      data: pageData,
    });
  } catch (err) {
    console.error("getAttendanceGeoLatest error:", err);
    return res.status(500).json({ message: "Error fetching geo attendance", error: err.message });
  }
};

