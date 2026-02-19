const ActivationData = require("../../model/ActivationData");
const SecondaryData = require("../../model/SecondaryData");
const TertiaryData = require("../../model/TertiaryData");
const ProductMaster = require("../../model/ProductMaster");

// =====================================================
// GET PRODUCTS NOT IN PRODUCT MASTER
// =====================================================
exports.getUnmappedProducts = async (req, res) => {
  try {
    // 1️⃣ Get distinct models from all 3 collections
    const activationModels = await ActivationData.distinct("model_no");
    const secondaryModels = await SecondaryData.distinct("model");
    const tertiaryModels = await TertiaryData.distinct("model");

    // Combine all models
    const allSalesModels = [
      ...activationModels,
      ...secondaryModels,
      ...tertiaryModels,
    ];

    // Normalize & remove duplicates
    const uniqueSalesModels = [
      ...new Set(
        allSalesModels
          .filter(Boolean)
          .map((m) => m.toString().trim())
      ),
    ];

    // 2️⃣ Get product master models
    const masterModels = await ProductMaster.distinct("model");

    const normalizedMasterModels = new Set(
      masterModels
        .filter(Boolean)
        .map((m) => m.toString().trim())
    );

    // 3️⃣ Find missing models
    const missingModels = uniqueSalesModels.filter(
      (model) => !normalizedMasterModels.has(model)
    );

    res.json({
      success: true,
      totalSalesModels: uniqueSalesModels.length,
      totalMasterModels: normalizedMasterModels.size,
      missingCount: missingModels.length,
      missingModels,
    });

  } catch (err) {
    console.error("Unmapped Products Error:", err);
    res.status(500).json({
      success: false,
      message: "Error fetching unmapped products",
    });
  }
};
