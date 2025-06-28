const cloudinary = require('cloudinary').v2;
const fs = require("fs");
const moment = require("moment-timezone");

exports.getDistance = (lat1, lon1, lat2, lon2) => {
  // console.log("lat1:", lat1, "lon1", lon1, "lat2", lat2, "lon2", lon2)
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371; // Radius of Earth in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1000; // Distance in meters
 };

// exports.getDistance = (lat1, lon1, lat2, lon2) => {
//   // Helper to parse coordinates (handles numbers, strings, or $numberDecimal objects)
//   const parseCoordinate = (coord) => {
//     if (coord == null) return null;
//     if (typeof coord === 'number') return coord;
//     if (typeof coord === 'string') return parseFloat(coord);
//     if (typeof coord === 'object' && coord.$numberDecimal) {
//       return parseFloat(coord.$numberDecimal);
//     }
//     return null;
//   };

//   // Parse inputs
//   const lat1Num = parseCoordinate(lat1);
//   const lon1Num = parseCoordinate(lon1);
//   const lat2Num = parseCoordinate(lat2);
//   const lon2Num = parseCoordinate(lon2);

//   // Check for invalid or missing coordinates
//   if ([lat1Num, lon1Num, lat2Num, lon2Num].some((val) => val == null || isNaN(val))) {
//     console.warn("Invalid coordinates in getDistance:", { lat1, lon1, lat2, lon2 });
//     return null; // Match Flutter's behavior when currentLocation is null
//   }

//   // Validate ranges
//   if (lat1Num < -90 || lat1Num > 90 || lat2Num < -90 || lat2Num > 90) {
//     console.warn("Latitude out of range:", { lat1: lat1Num, lat2: lat2Num });
//     return null;
//   }
//   if (lon1Num < -180 || lon1Num > 180 || lon2Num < -180 || lon2Num > 180) {
//     console.warn("Longitude out of range:", { lon1: lon1Num, lon2: lon2Num });
//     return null;
//   }

//   // Handle identical points
//   if (lat1Num === lat2Num && lon1Num === lon2Num) {
//     return 0; // Same point, return 0 km
//   }

//   const toRad = (value) => (value * Math.PI) / 180;
//   const R = 6371; // Radius of Earth in km

//   const dLat = toRad(lat2Num - lat1Num);
//   const dLon = toRad(lon2Num - lon1Num);
//   const a =
//     Math.sin(dLat / 2) * Math.sin(dLat / 2) +
//     Math.cos(toRad(lat1Num)) * Math.cos(toRad(lat2Num)) *
//     Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
//   // Clamp a to [0, 1] to avoid numerical errors
//   const aClamped = Math.min(Math.max(a, 0), 1);
//   const c = 2 * Math.atan2(Math.sqrt(aClamped), Math.sqrt(1 - aClamped));
//   const distance = R * c; // Distance in kilometers

//   // Round to 2 decimal places to match Flutter's precision
//   return distance;
// };

// ✅ Helper for no-dealer punch-out
exports.handlePunchOutWithoutDealer = async ({
 attendance,
 req,
 res,
 punchOutTime,
 latitude,
 longitude,
}) => {
 if (!req.file) {
   return res.status(400).json({
     success: false,
     message: "Please capture an image.",
   });
 }

 const result = await cloudinary.uploader.upload(req.file.path, {
   folder: "gpunchOutImage",
   resource_type: "image",
 });

 fs.unlink(req.file.path, (err) => {
   if (err) console.error("Failed to delete temp file:", err);
 });

 const punchOutImage = result.secure_url;

 const durationMinutes = moment(punchOutTime).diff(
   moment(attendance.punchIn),
   "minutes"
 );
 const hoursWorked = (durationMinutes / 60).toFixed(2);

 let status = "Present";
 if (hoursWorked <= 4) {
   status = "Absent";
 } else if (hoursWorked < 8) {
   status = "Half Day";
 }

 attendance.punchOut = punchOutTime;
 attendance.punchOutImage = punchOutImage;
 attendance.status = status;
 attendance.punchOutLatitude = latitude;
 attendance.punchOutLongitude = longitude;
 
 attendance.hoursWorked = parseFloat(hoursWorked);
 attendance.punchOutCode = null;
 attendance.punchOutName = "N/A";

 await attendance.save();

 return res.status(201).json({
   message: "Punch-out recorded successfully (no dealer assigned)",
   attendance: {
     ...attendance.toObject(),
     punchOutCode: null,
     punchOutName: "N/A",
   },
 });
};


exports.formatDate = (dateInput) => {
 if (!dateInput) return "N/A";

 // Convert string to Date only if it's not already a Date object
 const dateObj = typeof dateInput === "string"
   ? new Date(dateInput.slice(0, 10)) // "YYYY-MM-DD"
   : new Date(dateInput);

 if (isNaN(dateObj)) return "Invalid Date";

 return dateObj.toLocaleDateString("en-IN", {
   day: "numeric",
   month: "short",
   year: "numeric",
 });
};

// module.exports = getDistance;
