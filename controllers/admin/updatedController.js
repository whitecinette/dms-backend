const UpdatedData = require("../../model/UpdatedData");

exports.getUpdatedData = async (req, res) => {
  try{
    const updateData = await UpdatedData.find({modelName: 'GeoTag'})
    .populate('modelId', 'name')
    .sort({ timestamp: -1 });

    res.status(200).json({
        success: true,
        data: updateData,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching updated data",
    });
  }
};

