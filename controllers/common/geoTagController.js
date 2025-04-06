const ActorCode = require("../../model/ActorCode");
const HierarchyEntries = require("../../model/HierarchyEntries");
const User = require("../../model/User");
const cloudinary = require("../../config/cloudinary");


// Controller to get dealers by employee code
exports.getDealerByEmployee = async (req, res) => {
 const employeeCode = req.user.code;

 try {
   // Step 1: Fetch all hierarchy entries
   const allEntries = await HierarchyEntries.find();

   // Step 2: Filter entries where employee code appears in any field
   const matchedEntries = allEntries.filter(entry => {
     const entryObj = entry.toObject();
     return Object.values(entryObj).includes(employeeCode);
   });

   if (matchedEntries.length === 0) {
     return res.status(404).json({ message: "Employee not found in any hierarchy." });
   }

   // Step 3: Collect all unique dealer codes from matching entries
   const dealerCodes = [
     ...new Set(matchedEntries.map(entry => entry.dealer).filter(Boolean))
   ];

   if (dealerCodes.length === 0) {
     return res.status(404).json({ message: "No dealers found for this employee." });
   }

   // Step 4: Fetch dealer details
   const dealerDetails = await ActorCode.find({ code: { $in: dealerCodes } });

   const dealers = dealerDetails.map(dealer => ({
     code: dealer.code,
     name: dealer.name
   }));

   res.status(200).json({ dealers });

 } catch (error) {
   console.error(error);
   res.status(500).json({ message: "Internal server error." });
 }
};


// update geotag picture lat and long of dealer

exports.updateGeotagLatLong = async (req, res) => {
 try {
     const { code, latitude, longitude } = req.body;

     if (!code) {
         return res.status(400).json({
             success: false,
             message: "Code is required",
         });
     }

     const parsedLatitude = parseFloat(latitude);
     const parsedLongitude = parseFloat(longitude);

     if (isNaN(parsedLatitude) || isNaN(parsedLongitude)) {
         return res.status(400).json({
             success: false,
             message: "Latitude and longitude must be valid numbers.",
         });
     }

     if (!req.file) {
         return res.status(400).json({
             success: false,
             message: "Geotagging picture is required.",
         });
     }

     // Upload image to Cloudinary
     const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'geotag_pictures',
      public_id: `${code}_${Date.now()}`,
      resource_type: 'image',
      transformation: [{ width: 600, height: 600, crop: "limit" }],
      timeout: 60000  // Extended timeout
  });
  
     // Update dealer with latitude, longitude, and geotag picture URL
     const updatedDealer = await User.findOneAndUpdate(
         { code },
         {
             latitude: parsedLatitude,
             longitude: parsedLongitude,
             geotag_picture: result.secure_url,
         },
         { new: true } // Return the updated document
     );

     if (!updatedDealer) {
         return res.status(404).json({
             success: false,
             message: "Dealer not found",
         });
     }

     return res.status(200).json({
         success: true,
         message: "Dealer geotag updated successfully",
         dealer: updatedDealer,
     });
 } catch (error) {
     console.error("Error updating dealer geotag:", error);
     return res.status(500).json({
         success: false,
         message: "Internal Server Error",
     });
 }
};


