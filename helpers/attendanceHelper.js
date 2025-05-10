const cloudinary = require('cloudinary').v2;
const fs = require("fs");
const moment = require("moment-timezone");

exports.getDistance = (lat1, lon1, lat2, lon2) => {
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

// module.exports = getDistance;
