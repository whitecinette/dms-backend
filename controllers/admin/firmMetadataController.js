const FirmMetaData = require("../../model/FirmMetadata");
const Firm = require("../../model/Firm"); // ✅ To validate firm code exists

// ✅ Create firm metadata
exports.createFirmMetaData = async (req, res) => {
  try {
    console.log("reach firm mt")
    const { firmCode, ...rest } = req.body;

    if (!firmCode) {
      return res.status(400).json({
        success: false,
        message: "firmCode is required",
      });
    }

    // 🔍 Ensure firm exists
    const firm = await Firm.findOne({ code: firmCode });
    if (!firm) {
      return res.status(404).json({
        success: false,
        message: `Firm with code '${firmCode}' not found`,
      });
    }

    // 🔍 Prevent duplicates → one metadata doc per firm
    const existingMeta = await FirmMetaData.findOne({ firmCode });
    if (existingMeta) {
      return res.status(400).json({
        success: false,
        message: `Metadata for firm '${firmCode}' already exists. Use update instead.`,
      });
    }

    // ✅ Create new metadata (rest contains all configs including extra fields)
    const metadata = new FirmMetaData({
      firmCode,
      ...rest,
    });

    await metadata.save();

    res.status(201).json({
      success: true,
      message: "Firm metadata created successfully",
      data: metadata,
    });
  } catch (error) {
    console.error("❌ Error creating firm metadata:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create firm metadata",
      error: error.message,
    });
  }
};


// controllers/firmMetadataController.js
exports.getFirmMetaData = async (req, res) => {
  try {
    const { firmCode } = req.params;

    if (!firmCode) {
      return res.status(400).json({
        success: false,
        message: "firmCode is required",
      });
    }

    // 🔍 Ensure firm exists
    const firm = await Firm.findOne({ code: firmCode });
    if (!firm) {
      return res.status(404).json({
        success: false,
        message: `Firm with code '${firmCode}' not found`,
      });
    }

    // 🔍 Find metadata or create default
    let metadata = await FirmMetaData.findOne({ firmCode });
    if (!metadata) {
      metadata = new FirmMetaData({ firmCode });
      await metadata.save();
    }

    res.status(200).json({
      success: true,
      message: "Firm metadata fetched successfully",
      data: metadata,
    });
  } catch (error) {
    console.error("❌ Error fetching firm metadata:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch firm metadata",
      error: error.message,
    });
  }
};


// controllers/firmMetadataController.js
exports.upsertFirmMetaData = async (req, res) => {
  try {
    const { firmCode, ...rest } = req.body;

    if (!firmCode) {
      return res.status(400).json({
        success: false,
        message: "firmCode is required",
      });
    }

    // 🔍 Ensure firm exists
    const firm = await Firm.findOne({ code: firmCode });
    if (!firm) {
      return res.status(404).json({
        success: false,
        message: `Firm with code '${firmCode}' not found`,
      });
    }

    // ✅ Upsert metadata
    const metadata = await FirmMetaData.findOneAndUpdate(
      { firmCode },
      { $set: { firmCode, ...rest } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({
      success: true,
      message: "Firm metadata saved successfully",
      data: metadata,
    });
  } catch (error) {
    console.error("❌ Error upserting firm metadata:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save firm metadata",
      error: error.message,
    });
  }
};

