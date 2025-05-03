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
    const matchedEntries = allEntries.filter((entry) => {
      const entryObj = entry.toObject();
      return Object.values(entryObj).includes(employeeCode);
    });

    if (matchedEntries.length === 0) {
      return res
        .status(404)
        .json({ message: "Employee not found in any hierarchy." });
    }

    // Step 3: Collect all unique dealer codes from matching entries
    const dealerCodes = [
      ...new Set(matchedEntries.map((entry) => entry.dealer).filter(Boolean)),
    ];

    if (dealerCodes.length === 0) {
      return res
        .status(404)
        .json({ message: "No dealers found for this employee." });
    }

    // Step 4: Fetch dealer details
    const dealerDetails = await ActorCode.find({ code: { $in: dealerCodes } });

    const dealers = dealerDetails.map((dealer) => ({
      code: dealer.code,
      name: dealer.name,
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
      folder: "geotag_pictures",
      public_id: `${code}_${Date.now()}`,
      resource_type: "image",
      transformation: [{ width: 600, height: 600, crop: "limit" }],
      timeout: 60000, // Extended timeout
    });
    
    // Delete the temp file after uploading to Cloudinary
    if (req.file?.path) {
      try {
        await fsPromises.unlink(req.file.path); // Delete temp file
        console.log("Temp file deleted:", req.file.path);
      } catch (err) {
        console.error("Failed to delete temp file:", err);
      }
    }
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


// get geotag dealers 
// exports.getGeotaggedDealers = async (req, res) => {
//  try {
//    const dealers = await User.find({
//      latitude: { $ne: null },
//      longitude: { $ne: null },
//      geotag_picture: {
//        $exists: true,
//        $nin: [null, ""],
//        $not: { $regex: /^not available$/i }
//      }
//    }).select('name code geotag_picture latitude longitude');

//    if (dealers.length === 0) {
//      return res.status(404).json({ message: "No geotagged dealers found." });
//    }

//    // Prepare data for CSV
//    const dealerData = dealers.map(dealer => ({
//      name: dealer.name || "N/A",
//      code: dealer.code || "N/A",
//      latitude: dealer.latitude || "N/A",
//      longitude: dealer.longitude || "N/A",
//      geotag_picture: dealer.geotag_picture || "N/A",
//      geotagging_status: dealer.geotag_picture ? "DONE" : "PENDING"
//    }));

//    // Define CSV columns
//    const columns = ["name", "code", "latitude", "longitude", "geotag_picture", "geotagging_status"];

//    // Build CSV string
//    let csvContent = columns.join(",") + "\n";
//    dealerData.forEach(dealer => {
//      const row = columns.map(col => {
//        const val = dealer[col];
//        return typeof val === "string" ? val.replace(/,/g, "") : val;
//      });
//      csvContent += row.join(",") + "\n";
//    });

//    // Set headers and return CSV
//    res.header("Content-Type", "text/csv");
//    res.header("Content-Disposition", "attachment; filename=geotagged_dealers.csv");
//    return res.status(200).send(csvContent);
//  } catch (error) {
//    console.error("Error exporting geotagged dealers to CSV:", error);
//    return res.status(500).json({ error: "Internal Server Error" });
//  }
// };

exports.getGeotaggedDealers = async (req, res) => {
 try {
  const dealers = await User.find({
    latitude: { $ne: null },
    longitude: { $ne: null },
    geotag_picture: {
      $exists: true,
      $nin: [null, ""],
      $not: { $regex: /^not available$/i }
    }
  }).select('name code geotag_picture latitude longitude');

  if (dealers.length === 0) {
    return res.status(404).json({ message: "No geotagged dealers found." });
  }

  const dealerData = [];
  const dynamicFieldsSet = new Set();

  for (const dealer of dealers) {
    // Fetch hierarchy based on the "dealer" field in the HierarchyEntries collection
    const hierarchy = await HierarchyEntries.findOne({
      dealer: dealer.code  // Use "dealer" field here instead of "dealers"
    }).lean();

    // Collect hierarchy fields dynamically (excluding `_id`, `dealer`, `createdAt`, and `updatedAt`)
    const hierarchyFields = {};
    if (hierarchy) {
      Object.entries(hierarchy).forEach(([key, value]) => {
        if (!['_id', 'dealer', 'createdAt', 'updatedAt', '__v'].includes(key)) {  // Excluding 'createdAt' and 'updatedAt'
          hierarchyFields[key] = value || "N/A";
          dynamicFieldsSet.add(key);
        }
      });
    }

    dealerData.push({
      name: dealer.name || "N/A",
      code: dealer.code || "N/A",
      latitude: dealer.latitude || "N/A",
      longitude: dealer.longitude || "N/A",
      geotag_picture: dealer.geotag_picture || "N/A",
      geotagging_status: dealer.geotag_picture ? "DONE" : "PENDING",
      ...hierarchyFields
    });
  }

  // Static columns
  const baseColumns = ["name", "code", "latitude", "longitude", "geotag_picture", "geotagging_status"];
  // Dynamic hierarchy columns
  const dynamicColumns = Array.from(dynamicFieldsSet);
  const columns = [...baseColumns, ...dynamicColumns];

  // Build CSV string
  let csvContent = columns.join(",") + "\n";
  dealerData.forEach(dealer => {
    const row = columns.map(col => {
      const val = dealer[col];
      return typeof val === "string" ? val.replace(/,/g, "") : val;
    });
    csvContent += row.join(",") + "\n";
  });

  res.header("Content-Type", "text/csv");
  res.header("Content-Disposition", "attachment; filename=geotagged_dealers_with_hierarchy.csv");
  return res.status(200).send(csvContent);
} catch (error) {
  console.error("Error exporting geotagged dealers to CSV:", error);
  return res.status(500).json({ error: "Internal Server Error" });
}
};
