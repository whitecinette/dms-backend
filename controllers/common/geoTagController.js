const ActorCode = require("../../model/ActorCode");
const HierarchyEntries = require("../../model/HierarchyEntries");
const User = require("../../model/User");
const cloudinary = require("../../config/cloudinary");
const fsPromises = require("fs").promises;
const UpdatedData = require("../../model/UpdatedData");

// Controller to get dealers by employee code
exports.getDealerByEmployee = async (req, res) => {
  const { code } = req.user;

  try {
    // Step 1: Fetch all hierarchy entries
    const allEntries = await HierarchyEntries.find();

    // Step 2: Filter entries where employee code appears in any field
    const matchedEntries = allEntries.filter((entry) => {
      const entryObj = entry.toObject();
      return Object.values(entryObj).includes(code);
    });

    if (matchedEntries.length === 0) {
      return res
        .status(404)
        .json({ message: "Employee not found in any hierarchy." });
    }

    // Step 3: Collect all unique dealer codes from matching entries
    const dealerCodesSet = new Set();

    matchedEntries.forEach((entry) => {
      if (entry.dealer) dealerCodesSet.add(entry.dealer);
      if (entry.mdd) dealerCodesSet.add(entry.mdd);
    });

    const dealerCodes = Array.from(dealerCodesSet);

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
      position: dealer.position,
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

    // Find the dealer before update to store previous data
    const previousDealer = await User.findOne({ code });

    if (!previousDealer) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found",
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

    // Only update lat/long if they are different from 0,0
    const updateData = {
      geotag_picture: result.secure_url,
    };

    // Check if lat/long are different from 0,0
    if (parsedLatitude !== 0 || parsedLongitude !== 0) {
      updateData.latitude = parsedLatitude;
      updateData.longitude = parsedLongitude;
    }

    // Update dealer with latitude, longitude, and geotag picture URL
    const updatedDealer = await User.findOneAndUpdate(
      { code },
      updateData,
      { new: true } // Return the updated document
    );

    // Check if there are actual changes in latitude or longitude
    const lat = Number(parsedLatitude);
    const lon = Number(parsedLongitude);
    const prevLat = Number(previousDealer.latitude);
    const prevLon = Number(previousDealer.longitude);


    // Both must be non-zero to be considered a valid location
    const isNonZeroLocation = !(prevLat === 0 && prevLon === 0);
    // Both must be different from previous to be considered a change
    const isDifferentFromPrevious = !(lat === prevLat && lon === prevLon);

    
    const hasLocationChanges = isNonZeroLocation && isDifferentFromPrevious;

    // Only create update record if there are location changes
    if (hasLocationChanges) {
      const changes = [];

      if (previousDealer.latitude !== parsedLatitude) {
        changes.push({
          field: "latitude",
          oldValue: previousDealer.latitude,
          newValue: parsedLatitude,
        });
      }

      if (previousDealer.longitude !== parsedLongitude) {
        changes.push({
          field: "longitude",
          oldValue: previousDealer.longitude,
          newValue: parsedLongitude,
        });
      }

      // Create update record only if there are location changes
      await UpdatedData.create({
        modelName: "GeoTag",
        modelId: updatedDealer._id,
        previousData: {
          latitude: previousDealer.latitude,
          longitude: previousDealer.longitude,
        },
        newData: {
          latitude: parsedLatitude,
          longitude: parsedLongitude,
        },
        updatedBy: {
          name: req.user.name,
          code: req.user.code,
        },
        updateReason: "Geotag location update",
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
    const { hierarchy_name } = req.query;

    if (!hierarchy_name) {
      return res.status(400).json({ message: "Hierarchy name is required." });
    }

    // Step 1: Find matching HierarchyEntries
    const matchingEntries = await HierarchyEntries.find({
      hierarchy_name,
    }).lean();

    if (matchingEntries.length === 0) {
      return res
        .status(404)
        .json({ message: "No hierarchy entries found for the given name." });
    }

    // Step 2: Extract dealer codes from matching entries
    const dealerCodes = matchingEntries.map((entry) => entry.dealer);

    // Step 3: Find users (dealers) with latitude, longitude, and optionally geotag_picture
    const dealers = await User.find({
      code: { $in: dealerCodes },
      latitude: { $ne: null },
      longitude: { $ne: null },
    }).select("name code geotag_picture latitude longitude");

    if (dealers.length === 0) {
      return res.status(404).json({ message: "No geotagged dealers found." });
    }

    const dealerData = [];
    const dynamicFieldsSet = new Set();

    for (const dealer of dealers) {
      const hierarchy = matchingEntries.find(
        (entry) => entry.dealer === dealer.code
      );

      const hierarchyFields = {};
      if (hierarchy) {
        Object.entries(hierarchy).forEach(([key, value]) => {
          if (
            !["_id", "dealer", "createdAt", "updatedAt", "__v"].includes(key)
          ) {
            hierarchyFields[key] = value || "N/A";
            dynamicFieldsSet.add(key);
          }
        });
      }

      const geotagged =
        dealer.geotag_picture &&
        dealer.geotag_picture.trim().toLowerCase() !== "not available";

      dealerData.push({
        name: dealer.name || "N/A",
        code: dealer.code || "N/A",
        latitude: dealer.latitude || "N/A",
        longitude: dealer.longitude || "N/A",
        geotag_picture: dealer.geotag_picture || "N/A",
        geotagging_status: geotagged ? "DONE" : "PENDING",
        ...hierarchyFields,
      });
    }

    const baseColumns = [
      "name",
      "code",
      "latitude",
      "longitude",
      "geotag_picture",
      "geotagging_status",
    ];
    const dynamicColumns = Array.from(dynamicFieldsSet);
    const columns = [...baseColumns, ...dynamicColumns];

    let csvContent = columns.join(",") + "\n";
    dealerData.forEach((dealer) => {
      const row = columns.map((col) => {
        const val = dealer[col];
        return typeof val === "string" ? val.replace(/,/g, "") : val;
      });
      csvContent += row.join(",") + "\n";
    });

    res.header("Content-Type", "text/csv");
    res.header(
      "Content-Disposition",
      "attachment; filename=geotagged_dealers_with_hierarchy.csv"
    );
    return res.status(200).send(csvContent);
  } catch (error) {
    console.error("Error exporting geotagged dealers to CSV:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.getGeoTaggedDealersForAdmin = async (req, res) => {
  try {
    const {
      hierarchy_name,
      page = 1,
      limit = 10,
      search,
      sortBy = "name",
      sortOrder = "asc",
      status,
    } = req.query;

    // Step 1: Get all data
    let allDealers = [];
    let dynamicFieldsSet = new Set();

    if (hierarchy_name) {
      // Get all matching hierarchy entries
      const matchingEntries = await HierarchyEntries.find({
        hierarchy_name,
      }).lean();

      if (matchingEntries.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No hierarchy entries found for the given name.",
        });
      }

      const dealerCodes = matchingEntries.map((entry) => entry.dealer);
      const dealers = await User.find({
        code: { $in: dealerCodes },
        latitude: { $ne: null },
        longitude: { $ne: null },
      })
        .select("name code geotag_picture latitude longitude")
        .lean();

      // Create a map for quick dealer lookup
      const dealerMap = new Map(dealers.map((dealer) => [dealer.code, dealer]));

      // Combine hierarchy entries with dealer data
      allDealers = matchingEntries.map((entry) => {
        // Collect dynamic fields from hierarchy
        Object.entries(entry).forEach(([key, value]) => {
          if (
            !["_id", "dealer", "createdAt", "updatedAt", "__v"].includes(key)
          ) {
            dynamicFieldsSet.add(key);
          }
        });

        return {
          entry,
          dealer: dealerMap.get(entry.dealer),
        };
      });
    } else {
      // Get all dealers with location data
      const dealers = await User.find({
        latitude: { $ne: null },
        longitude: { $ne: null },
      })
        .select("name code geotag_picture latitude longitude")
        .lean();

      allDealers = dealers.map((dealer) => ({
        dealer,
      }));
    }

    // Step 2: Format the data
    let formattedData = allDealers.map(({ entry, dealer }) => {
      const geotagged =
        dealer?.geotag_picture &&
        dealer.geotag_picture.trim().toLowerCase() !== "not available";

      const latitude = dealer?.latitude
        ? parseFloat(dealer.latitude).toFixed(6)
        : "N/A";
      const longitude = dealer?.longitude
        ? parseFloat(dealer.longitude).toFixed(6)
        : "N/A";

      // Base dealer data
      const dealerData = {
        name: dealer?.name || "N/A",
        code: dealer?.code || entry?.dealer || "N/A",
        latitude,
        longitude,
        image: dealer?.geotag_picture || "N/A",
        status: geotagged ? "DONE" : "PENDING",
      };

      // Add hierarchy fields if they exist
      if (entry) {
        Object.entries(entry).forEach(([key, value]) => {
          if (
            !["_id", "dealer", "createdAt", "updatedAt", "__v"].includes(key)
          ) {
            dealerData[key] = value || "N/A";
          }
        });
      }

      return dealerData;
    });

    // Step 3: Apply search filter if provided
    if (search) {
      formattedData = formattedData.filter(
        (dealer) =>
          dealer.name.toLowerCase().includes(search.toLowerCase()) ||
          dealer.code.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Step 4: Apply status filter if provided
    if (status) {
      formattedData = formattedData.filter(
        (dealer) => dealer.status === status.toUpperCase()
      );
    }

    // Step 5: Sort the data
    formattedData.sort((a, b) => {
      const aValue = a[sortBy]?.toLowerCase() || "";
      const bValue = b[sortBy]?.toLowerCase() || "";
      return sortOrder === "asc"
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    });

    // Step 6: Calculate pagination
    const totalEntries = formattedData.length;
    const parsedLimit = parseInt(limit);
    const parsedPage = parseInt(page);
    const totalPages = Math.ceil(totalEntries / parsedLimit);

    // Step 7: Apply pagination (skip and limit)
    const startIndex = (parsedPage - 1) * parsedLimit;
    const paginatedData = formattedData.slice(
      startIndex,
      startIndex + parsedLimit
    );

    return res.status(200).json({
      success: true,
      data: paginatedData,
      pagination: {
        total: totalEntries,
        page: parsedPage,
        limit: parsedLimit,
        pages: totalPages,
      },
      fields: Array.from(dynamicFieldsSet), // Include available hierarchy fields
    });
  } catch (error) {
    console.error("Error fetching geotagged dealers:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
