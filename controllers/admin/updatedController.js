const UpdatedData = require("../../model/UpdatedData");

exports.getUpdatedDataGeoTag = async (req, res) => {
  try {
    const { startDate, endDate, search } = req.query;

    // Build query object
    const query = {
      updateReason: "Geotag location update",
    };

    // Add date range filter if provided
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        query.timestamp.$lte = new Date(endDate);
      }
    }

    let updateData = await UpdatedData.find(query)
      .populate("modelId", "name shopName")
      .sort({ timestamp: -1 });

    // Apply search filter if provided
    if (search) {
      updateData = updateData.filter((doc) => {
        const modelName = doc.modelId?.name?.toLowerCase() || "";
        const searchTerm = search.toLowerCase();
        return modelName.includes(searchTerm);
      });
    }

    const filtered = updateData.filter((doc) => {
      const keys = Object.keys(doc.newData);
      return keys.every((k) => k === "latitude" || k === "longitude");
    });

    res.status(200).json({
      success: true,
      data: filtered,
    });
  } catch (error) {
    console.log("error", error);
    res.status(500).json({
      success: false,
      message: "Error fetching updated data",
    });
  }
};

exports.getUpdatedGeoTagCount = async (req, res) => {
  try {
    const userId = req.user._id;

    const count = await UpdatedData.countDocuments({
      updateReason: "Geotag location update",
      "seenBy.userId": { $ne: userId },
    });

    res.status(200).json({
      success: true,
      data: count,
    });
  } catch (error) {
    console.error("Error fetching updated geo tag count:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching updated geo tag count",
    });
  }
};

exports.MarkSeenToAllGeoTag = async (req, res) => {
  try {
    const userId = req.user._id;
    await UpdatedData.updateMany(
      {
        "seenBy.userId": { $ne: userId },
        updateReason: "Geotag location update",
      },
      { $push: { seenBy: { userId, seenAt: new Date() } } }
    );

    res.status(200).json({
      success: true,
      message: "Updated data marked as seen",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error marking updated data as seen",
    });
  }
};
