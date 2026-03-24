const ActivationData = require("../../model/ActivationData");
const SecondaryData = require("../../model/SecondaryData");
const TertiaryData = require("../../model/TertiaryData");
const ProductMaster = require("../../model/ProductMaster");
const Product = require("../../model/Product");
const moment = require("moment-timezone");
const { getDealerCodesFromFilters } = require("../../services/dealerFilterService");
const ExcelJS = require("exceljs");

const ExtractionRecord = require("../../model/ExtractionRecord");
const User = require("../../model/User");
const ActorCode = require("../../model/ActorCode");
const HierarchyEntries = require("../../model/HierarchyEntries");

const { Readable } = require("stream");
const csv = require("csv-parser");


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

exports.getExcludedRawData = async (req, res) => {
  try {
    let { start_date, end_date, filters } = req.body || {};
    const user = req.user;

    const indiaNow = moment().tz("Asia/Kolkata");

    if (!start_date || !end_date) {
      start_date = indiaNow.clone().startOf("month").format("YYYY-MM-DD");
      end_date = indiaNow.format("YYYY-MM-DD");
    }

    const startDate = moment(start_date, "YYYY-MM-DD").startOf("day");
    const endDate = moment(end_date, "YYYY-MM-DD").endOf("day");

    const { dealerCodes = [], mddCodes = [] } =
      await getDealerCodesFromFilters(filters, user);

    const getExcluded = async (
      Model,
      dateField,
      dealerField,
      codes,
      valueField,
      qtyField
    ) => {
      const safeCodes = Array.isArray(codes) ? codes : [];

      const docs = await Model.aggregate([
        {
          $addFields: {
            parsedDate: {
              $let: {
                vars: { parts: { $split: [`$${dateField}`, "/"] } },
                in: {
                  $cond: [
                    { $eq: [{ $size: "$$parts" }, 3] },
                    {
                      $dateFromParts: {
                        year: {
                          $add: [
                            2000,
                            { $toInt: { $arrayElemAt: ["$$parts", 2] } }
                          ]
                        },
                        month: { $toInt: { $arrayElemAt: ["$$parts", 0] } },
                        day: { $toInt: { $arrayElemAt: ["$$parts", 1] } }
                      }
                    },
                    null
                  ]
                }
              }
            }
          }
        },
        {
          $match: {
            parsedDate: {
              $gte: startDate.toDate(),
              $lte: endDate.toDate(),
            }
          }
        },
        {
          $match: {
            $or: [
              { [dealerField]: { $nin: safeCodes } },
              { parsedDate: null }
            ]
          }
        }
      ]);

      let totalVal = 0;
      let totalQty = 0;

      docs.forEach(d => {
        totalVal += Number(d[valueField] || 0);
        totalQty += Number(d[qtyField] || 0);
      });

      return {
        rows: docs,
        totalVal,
        totalQty
      };
    };

    const [activation, tertiary, secondary] = await Promise.all([
      getExcluded(
        ActivationData,
        "activation_date_raw",
        "tertiary_buyer_code",
        dealerCodes,
        "val",
        "qty"
      ),
      getExcluded(
        TertiaryData,
        "invoice_date_raw",
        "dealer_code",
        dealerCodes,
        "net_value",
        "qty"
      ),
      getExcluded(
        SecondaryData,
        "invoice_date_raw",
        "mdd_code",
        mddCodes, // ✅ beat_code based mddCodes
        "net_value",
        "qty"
      )
    ]);

    return res.json({
      success: true,
      dateRange: { start_date, end_date },
      activation,
      tertiary,
      secondary
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


exports.getSalesReportFlags = async (req, res) => {
  try {
    const moment = require("moment-timezone");

    let { start_date, end_date, filters } = req.body || {};
    const user = req.user;

    const indiaNow = moment().tz("Asia/Kolkata");

    if (!start_date || !end_date) {
      start_date = indiaNow.clone().startOf("month").format("YYYY-MM-DD");
      end_date = indiaNow.format("YYYY-MM-DD");
    }

    const startDate = moment(start_date, "YYYY-MM-DD").startOf("day");
    const endDate = moment(end_date, "YYYY-MM-DD").endOf("day");

    const { dealerCodes = [], mddCodes = [] } =
      await getDealerCodesFromFilters(filters, user);

    const analyzeModel = async (
      Model,
      dateField,
      dealerField,
      codes,
      valueField,
      qtyField
    ) => {
      const safeCodes = Array.isArray(codes) ? codes : [];

      const docs = await Model.find({}).lean();

      let summary = {};
      let totalExcluded = 0;
      let totalVal = 0;
      let totalQty = 0;

      docs.forEach((doc) => {
        let reason = null;
        let parsedDate = null;

        if (doc[dateField]) {
          const parts = doc[dateField].split("/");
          if (parts.length === 3) {
            parsedDate = moment(
              `20${parts[2]}-${parts[0]}-${parts[1]}`,
              "YYYY-MM-DD"
            );
          }
        }

        if (!parsedDate || !parsedDate.isValid()) {
          reason = "Invalid date format";
        } else if (
          parsedDate.isBefore(startDate) ||
          parsedDate.isAfter(endDate)
        ) {
          reason = "Outside selected date range";
        } else if (
            safeCodes.length &&
            !safeCodes.includes(doc[dealerField])
            ) {
            reason =
                dealerField === "mdd_code"
                ? "MDD not in hierarchy"
                : "Dealer not in hierarchy";
            }


        if (reason) {
          totalExcluded++;
          totalVal += Number(doc[valueField] || 0);
          totalQty += Number(doc[qtyField] || 0);
          summary[reason] = (summary[reason] || 0) + 1;
        }
      });

      return {
        totalExcluded,
        totalVal,
        totalQty,
        breakdown: summary,
      };
    };

    const analyzeWOD = async (
      Model,
      dateField,
      dealerField,
      codes,
      qtyField
    ) => {
      const safeCodes = Array.isArray(codes) ? codes : [];
      const docs = await Model.find({}).lean();

      const dealerMap = {};
      let excludedDealers = 0;

      docs.forEach((doc) => {
        let parsedDate = null;

        if (doc[dateField]) {
          const parts = doc[dateField].split("/");
          if (parts.length === 3) {
            parsedDate = moment(
              `20${parts[2]}-${parts[0]}-${parts[1]}`,
              "YYYY-MM-DD"
            );
          }
        }

        if (!parsedDate || !parsedDate.isValid()) return;
        if (
          parsedDate.isBefore(startDate) ||
          parsedDate.isAfter(endDate)
        ) return;

        if (!doc[dealerField]) return;
        if (Number(doc[qtyField] || 0) <= 0) return;

        if (!dealerMap[doc[dealerField]]) {
          dealerMap[doc[dealerField]] = {
            inHierarchy:
              !safeCodes.length ||
              safeCodes.includes(doc[dealerField]),
          };
        }
      });

      const uniqueDealers = Object.keys(dealerMap);

      uniqueDealers.forEach((code) => {
        if (!dealerMap[code].inHierarchy) excludedDealers++;
      });

      return {
        totalDealers: uniqueDealers.length,
        excludedDealers,
      };
    };

    const [activation, tertiary, secondary, wod] =

    await Promise.all([
      analyzeModel(
        ActivationData,
        "activation_date_raw",
        "tertiary_buyer_code",
        dealerCodes,
        "val",
        "qty"
      ),
      analyzeModel(
        TertiaryData,
        "invoice_date_raw",
        "dealer_code",
        dealerCodes,
        "net_value",
        "qty"
      ),
      analyzeModel(
        SecondaryData,
        "invoice_date_raw",
        "mdd_code",
        mddCodes,
        "net_value",
        "qty"
      ),
      analyzeWOD(
        TertiaryData, // 🔥 change to ActivationData if needed
        "invoice_date_raw",
        "dealer_code",
        dealerCodes,
        "qty"
      ),
    ]);


    return res.json({
      success: true,
      dateRange: { start_date, end_date },
      activation,
      tertiary,
      secondary,
      wod
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};




// correct product price segments 

function toNumber(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  const s = String(val).replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function bucketFromPrice(price) {
  if (!price || price <= 0) return "";

  if (price <= 6000) return "0-6";
  if (price <= 10000) return "6-10";
  if (price <= 20000) return "10-20";
  if (price <= 30000) return "20-30";
  if (price <= 40000) return "30-40";
  if (price <= 70000) return "40-70";
  if (price <= 100000) return "70-100";
  if (price <= 120000) return "100-120";
  return "120";
}

exports.recalculateProductSegmentsByFilter = async (req, res) => {
  try {
    let { segments = [] } = req.body;

    if (!Array.isArray(segments) || !segments.length) {
      return res.status(400).json({
        success: false,
        message: "segments array is required",
      });
    }

    segments = segments.map((s) => String(s).trim()).filter(Boolean);

    const products = await Product.find({
      segment: { $in: segments },
    }).lean();

    if (!products.length) {
      return res.status(200).json({
        success: true,
        matchedCount: 0,
        modifiedCount: 0,
        message: "No products found for given segments",
      });
    }

    const bulkOps = [];
    const preview = [];

    for (const product of products) {
      const price = toNumber(product.price);
      const newSegment = bucketFromPrice(price);
      const oldSegment = String(product.segment || "").trim();

      if (!newSegment || oldSegment === newSegment) continue;

      bulkOps.push({
        updateOne: {
          filter: { _id: product._id },
          update: {
            $set: {
              segment: newSegment,
            },
          },
        },
      });

      if (preview.length < 20) {
        preview.push({
          product_code: product.product_code,
          product_name: product.product_name,
          price: product.price,
          oldSegment,
          newSegment,
        });
      }
    }

    if (!bulkOps.length) {
      return res.status(200).json({
        success: true,
        matchedCount: products.length,
        modifiedCount: 0,
        message: "All matching products already have correct segments",
      });
    }

    const result = await Product.bulkWrite(bulkOps);

    return res.status(200).json({
      success: true,
      matchedCount: products.length,
      modifiedCount: result.modifiedCount || 0,
      preview,
      message: "Product segments recalculated successfully",
    });
  } catch (error) {
    console.error("Error in recalculateProductSegmentsByFilter:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};


// correct price segments


//smartphone to smart_phone
exports.renameSmartphoneCategoryToSmartPhone = async (req, res) => {
  try {
    const filter = { product_category: "smartphone" };

    const matchedCount = await Product.countDocuments(filter);

    if (!matchedCount) {
      return res.status(200).json({
        success: true,
        matchedCount: 0,
        modifiedCount: 0,
        message: "No products found with product_category = smartphone",
      });
    }

    const result = await Product.updateMany(filter, {
      $set: { product_category: "smart_phone" },
    });

    return res.status(200).json({
      success: true,
      matchedCount,
      modifiedCount: result.modifiedCount || 0,
      message: "product_category updated from smartphone to smart_phone",
    });
  } catch (error) {
    console.error("Error in renameSmartphoneCategoryToSmartPhone:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};
//smartphone to smart_phone




// market sales download 



const normalizeMongoNumber = (value) => {
  if (value === undefined || value === null) return "";
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value.toString === "function") return Number(value.toString());
  return "";
};

exports.downloadMarketSalesDataDownloadMonthWise = async (req, res) => {
  try {
    let {
      month,
      year,
      smd = [],
      zsm = [],
      asm = [],
      mdd = [],
      tse = [],
      dealer = [],
      topOutlet = null,
      extractionActive = null,
    } = req.body;

    const { code: userCode, position: userPosition, role: userRole } = req.user;

    if (!userCode || !userPosition || !userRole) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    month = Number(month);
    year = Number(year);

    if (!month || !year || month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: "Valid month and year are required",
      });
    }

    if (typeof smd === "string") smd = smd ? smd.split(",") : [];
    if (typeof zsm === "string") zsm = zsm ? zsm.split(",") : [];
    if (typeof asm === "string") asm = asm ? asm.split(",") : [];
    if (typeof mdd === "string") mdd = mdd ? mdd.split(",") : [];
    if (typeof tse === "string") tse = tse ? tse.split(",") : [];
    if (typeof dealer === "string") dealer = dealer ? dealer.split(",") : [];

    const start = moment
      .utc({ year, month: month - 1, day: 1 })
      .startOf("day")
      .toDate();

    const end = moment.utc(start).add(1, "month").toDate();
    const yearMonth = `${year}-${String(month).padStart(2, "0")}`;

    const hierarchyFilter = {
      hierarchy_name: "default_sales_flow",
    };

    if (smd.length) hierarchyFilter.smd = { $in: smd };
    if (zsm.length) hierarchyFilter.zsm = { $in: zsm };
    if (asm.length) hierarchyFilter.asm = { $in: asm };
    if (mdd.length) hierarchyFilter.mdd = { $in: mdd };
    if (tse.length) hierarchyFilter.tse = { $in: tse };
    if (dealer.length) hierarchyFilter.dealer = { $in: dealer };

    if (userRole !== "admin") {
      if (userPosition === "smd") hierarchyFilter.smd = userCode;
      if (userPosition === "zsm") hierarchyFilter.zsm = userCode;
      if (userPosition === "asm") hierarchyFilter.asm = userCode;
      if (userPosition === "mdd") hierarchyFilter.mdd = userCode;
      if (userPosition === "tse") hierarchyFilter.tse = userCode;
      if (userPosition === "dealer") hierarchyFilter.dealer = userCode;
    }

    const hierarchyEntries = await HierarchyEntries.find(hierarchyFilter).lean();

    if (!hierarchyEntries.length) {
      return res.status(404).json({
        success: false,
        message: "No hierarchy entries found",
      });
    }

    const hierarchyMap = {};
    const dealerCodes = [];
    const actorCodesSet = new Set();

    hierarchyEntries.forEach((entry) => {
      if (entry.dealer) {
        hierarchyMap[entry.dealer] = entry;
        dealerCodes.push(entry.dealer);
      }

      if (entry.smd && entry.smd !== "VACANT") actorCodesSet.add(entry.smd);
      if (entry.zsm && entry.zsm !== "VACANT") actorCodesSet.add(entry.zsm);
      if (entry.asm && entry.asm !== "VACANT") actorCodesSet.add(entry.asm);
      if (entry.mdd && entry.mdd !== "VACANT") actorCodesSet.add(entry.mdd);
      if (entry.tse && entry.tse !== "VACANT") actorCodesSet.add(entry.tse);
      if (entry.dealer && entry.dealer !== "VACANT") actorCodesSet.add(entry.dealer);
    });

    const uniqueDealerCodes = [...new Set(dealerCodes)];

    const dealerUserFilter = {
      code: { $in: uniqueDealerCodes },
    };

    if (topOutlet === true) dealerUserFilter.top_outlet = true;
    if (topOutlet === false && req.body.hasOwnProperty("topOutlet")) {
      dealerUserFilter.top_outlet = false;
    }

    if (extractionActive === true) dealerUserFilter.extraction_active = true;
    if (
      extractionActive === false &&
      req.body.hasOwnProperty("extractionActive")
    ) {
      dealerUserFilter.extraction_active = false;
    }

    const dealerUsers = await User.find(
      dealerUserFilter,
      {
        code: 1,
        name: 1,
        top_outlet: 1,
        extraction_active: 1,
        latitude: 1,
        longitude: 1,
        district: 1,
        taluka: 1,
        zone: 1,
        town: 1,
        _id: 0,
      }
    ).lean();

    if (!dealerUsers.length) {
      return res.status(404).json({
        success: false,
        message: "No dealer users found",
      });
    }

    const dealerUserMap = {};
    const filteredDealerCodes = [];

    dealerUsers.forEach((user) => {
      dealerUserMap[user.code] = user;
      filteredDealerCodes.push(user.code);
    });

    const actorCodeDocs = await ActorCode.find(
      { code: { $in: Array.from(actorCodesSet) } },
      { code: 1, name: 1, position: 1, _id: 0 }
    ).lean();

    const actorCodeMap = {};
    actorCodeDocs.forEach((item) => {
      actorCodeMap[item.code] = {
        name: item.name || "",
        position: item.position || "",
      };
    });

    const [extractionRecords, activationRecords] = await Promise.all([
      ExtractionRecord.find({
        dealer: { $in: filteredDealerCodes },
        createdAt: { $gte: start, $lt: end },
      })
        .sort({ createdAt: -1 })
        .lean(),

      ActivationData.find({
        year_month: yearMonth,
      })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const productCodes = [
      ...new Set(
        activationRecords
          .map((item) => item.product_code)
          .filter(Boolean)
      ),
    ];

    const modelCodes = [
      ...new Set(
        activationRecords
          .map((item) => item.model_no)
          .filter(Boolean)
      ),
    ];

    const products = await Product.find(
      {
        $or: [
          { product_code: { $in: productCodes } },
          { model_code: { $in: modelCodes } },
        ],
      },
      {
        brand: 1,
        product_name: 1,
        product_category: 1,
        price: 1,
        segment: 1,
        model_code: 1,
        product_code: 1,
        _id: 0,
      }
    ).lean();

    const productByCodeMap = {};
    const productByModelMap = {};

    products.forEach((item) => {
      if (item.product_code) productByCodeMap[item.product_code] = item;
      if (item.model_code) productByModelMap[item.model_code] = item;
    });

    if (!extractionRecords.length && !activationRecords.length) {
      return res.status(404).json({
        success: false,
        message: "No extraction or activation records found for selected month/year",
      });
    }

    const extractionRows = extractionRecords.map((record) => {
      const hierarchy = hierarchyMap[record.dealer] || {};
      const dealerUser = dealerUserMap[record.dealer] || {};

      const smdCode = hierarchy.smd || "";
      const zsmCode = hierarchy.zsm || "";
      const asmCode = hierarchy.asm || "";
      const mddCode = hierarchy.mdd || "";
      const tseCode = hierarchy.tse || "";
      const dealerCode = hierarchy.dealer || record.dealer || "";

      return {
        source: "Extraction",
        uploaded_by: record.uploaded_by || "",
        seller_code: "",
        sale_date: record.createdAt ? moment(record.createdAt).format("DD-MM-YYYY") : "",
        sale_time: record.createdAt ? moment(record.createdAt).format("HH:mm:ss") : "",
        month: record.month || String(month),

        dealer_code: dealerCode,
        dealer_name: dealerUser.name || actorCodeMap[dealerCode]?.name || "",
        top_outlet:
          dealerUser.top_outlet === true
            ? "Yes"
            : dealerUser.top_outlet === false
            ? "No"
            : "",
        extraction_active:
          dealerUser.extraction_active === true
            ? "Yes"
            : dealerUser.extraction_active === false
            ? "No"
            : "",
        dealer_latitude: normalizeMongoNumber(dealerUser.latitude),
        dealer_longitude: normalizeMongoNumber(dealerUser.longitude),
        district: dealerUser.district || "",
        taluka: dealerUser.taluka || "",
        zone: dealerUser.zone || "",
        town: dealerUser.town || "",

        smd_code: smdCode,
        smd_name: actorCodeMap[smdCode]?.name || "",

        zsm_code: zsmCode,
        zsm_name: actorCodeMap[zsmCode]?.name || "",

        asm_code: asmCode,
        asm_name: actorCodeMap[asmCode]?.name || "",

        mdd_code: mddCode,
        mdd_name: actorCodeMap[mddCode]?.name || "",

        tse_code: tseCode,
        tse_name: actorCodeMap[tseCode]?.name || "",

        brand: record.brand || "",
        model_code: "",
        product_code: record.product_code || "",
        product_name: record.product_name || "",
        product_category: record.product_category || "",
        segment: record.segment || "",
        price: record.price || 0,
        quantity: record.quantity || 0,
        amount: record.amount || 0,
      };
    });

    const activationRows = activationRecords.map((record) => {
      const dealerCode = record.tertiary_buyer_code || "";
      const hierarchy = hierarchyMap[dealerCode] || {};
      const dealerUser = dealerUserMap[dealerCode] || {};

      const smdCode = hierarchy.smd || "";
      const zsmCode = hierarchy.zsm || "";
      const asmCode = hierarchy.asm || "";
      const mddCode = hierarchy.mdd || "";
      const tseCode = hierarchy.tse || "";

      const matchedProduct =
        productByCodeMap[record.product_code] ||
        productByModelMap[record.model_no] ||
        {};

      return {
        source: "Activation",
        uploaded_by: "",
        seller_code: record.tertiary_seller_code || "",
        sale_date: record.activation_date_raw || "",
        sale_time: "",
        month: String(month),

        dealer_code: dealerCode,
        dealer_name: dealerUser.name || actorCodeMap[dealerCode]?.name || "",
        top_outlet:
          dealerUser.top_outlet === true
            ? "Yes"
            : dealerUser.top_outlet === false
            ? "No"
            : "",
        extraction_active:
          dealerUser.extraction_active === true
            ? "Yes"
            : dealerUser.extraction_active === false
            ? "No"
            : "",
        dealer_latitude: normalizeMongoNumber(dealerUser.latitude),
        dealer_longitude: normalizeMongoNumber(dealerUser.longitude),
        district: dealerUser.district || "",
        taluka: dealerUser.taluka || "",
        zone: dealerUser.zone || "",
        town: dealerUser.town || "",

        smd_code: smdCode,
        smd_name: actorCodeMap[smdCode]?.name || "",

        zsm_code: zsmCode,
        zsm_name: actorCodeMap[zsmCode]?.name || "",

        asm_code: asmCode,
        asm_name: actorCodeMap[asmCode]?.name || "",

        mdd_code: mddCode,
        mdd_name: actorCodeMap[mddCode]?.name || "",

        tse_code: tseCode,
        tse_name: actorCodeMap[tseCode]?.name || "",

        brand: matchedProduct.brand || "samsung",
        model_code: record.model_no || "",
        product_code: record.product_code || "",
        product_name: matchedProduct.product_name || "",
        product_category: matchedProduct.product_category || "",
        segment: matchedProduct.segment || "",
        price: matchedProduct.price || "",
        quantity: record.qty || 0,
        amount: record.val || 0,
      };
    });

    const rows = [...extractionRows, ...activationRows].map((item, index) => ({
      sr_no: index + 1,
      ...item,
    }));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "OpenAI";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Market Sales Data");

    worksheet.columns = [
      { header: "SR NO", key: "sr_no", width: 10 },
      { header: "SOURCE", key: "source", width: 14 },
      { header: "UPLOADED BY", key: "uploaded_by", width: 18 },
      { header: "SELLER CODE", key: "seller_code", width: 18 },
      { header: "SALE DATE", key: "sale_date", width: 16 },
      { header: "SALE TIME", key: "sale_time", width: 14 },
      { header: "MONTH", key: "month", width: 10 },

      { header: "DEALER CODE", key: "dealer_code", width: 18 },
      { header: "DEALER NAME", key: "dealer_name", width: 28 },
      { header: "TOP OUTLET", key: "top_outlet", width: 14 },
      { header: "EXTRACTION ACTIVE", key: "extraction_active", width: 18 },
      { header: "DEALER LATITUDE", key: "dealer_latitude", width: 18 },
      { header: "DEALER LONGITUDE", key: "dealer_longitude", width: 18 },
      { header: "DISTRICT", key: "district", width: 18 },
      { header: "TALUKA", key: "taluka", width: 18 },
      { header: "ZONE", key: "zone", width: 18 },
      { header: "TOWN", key: "town", width: 18 },

      { header: "SMD CODE", key: "smd_code", width: 16 },
      { header: "SMD NAME", key: "smd_name", width: 24 },
      { header: "ZSM CODE", key: "zsm_code", width: 16 },
      { header: "ZSM NAME", key: "zsm_name", width: 24 },
      { header: "ASM CODE", key: "asm_code", width: 16 },
      { header: "ASM NAME", key: "asm_name", width: 24 },
      { header: "MDD CODE", key: "mdd_code", width: 16 },
      { header: "MDD NAME", key: "mdd_name", width: 24 },
      { header: "TSE CODE", key: "tse_code", width: 16 },
      { header: "TSE NAME", key: "tse_name", width: 24 },

      { header: "BRAND", key: "brand", width: 16 },
      { header: "MODEL CODE", key: "model_code", width: 18 },
      { header: "PRODUCT CODE", key: "product_code", width: 24 },
      { header: "PRODUCT NAME", key: "product_name", width: 30 },
      { header: "PRODUCT CATEGORY", key: "product_category", width: 20 },
      { header: "SEGMENT", key: "segment", width: 14 },
      { header: "PRICE", key: "price", width: 12 },
      { header: "QUANTITY", key: "quantity", width: 12 },
      { header: "AMOUNT", key: "amount", width: 14 },
    ];

    rows.forEach((row) => {
      worksheet.addRow(row);
    });

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = {
      vertical: "middle",
      horizontal: "center",
    };

    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.alignment = { vertical: "middle", horizontal: "left" };
      });
    });

    const fileName = `Market_Sales_Data_${String(month).padStart(
      2,
      "0"
    )}_${year}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    console.error("Error in downloadMarketSalesDataDownloadMonthWise:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};



//update upsert user/actocode


function parseCsvBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const rows = [];

    Readable.from(buffer)
      .pipe(csv())
      .on("data", (data) => rows.push(data))
      .on("end", () => resolve(rows))
      .on("error", (err) => reject(err));
  });
}

function parseBoolean(value) {
  const v = String(value ?? "").trim().toLowerCase();

  if (["true", "1", "yes", "y", "on"].includes(v)) return true;
  if (["false", "0", "no", "n", "off"].includes(v)) return false;

  return false;
}

function normalizeKey(key = "") {
  return String(key)
    .trim()
    .replace(/\uFEFF/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function parseValue(value) {
  if (value === undefined || value === null) return value;

  const str = String(value).trim();

  if (str === "") return "";

  const lower = str.toLowerCase();

  if (lower === "true") return true;
  if (lower === "false") return false;
  if (lower === "null") return null;
  if (lower === "undefined") return undefined;

  if (!Number.isNaN(Number(str)) && str !== "") {
    return Number(str);
  }

  return str;
}

function getCodeFromRow(row = {}) {
  const possibleKeys = [
    "code",
    "Code",
    "CODE",
    "user_code",
    "User Code",
    "USER CODE",
    "USER_CODE",
    "actorCode",
    "actor_code",
    "Actor Code",
    "employee_code",
    "Employee Code",
  ];

  for (const key of possibleKeys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim()) {
      return String(row[key]).trim();
    }
  }

  return "";
}

function cleanObject(obj = {}) {
  const cleaned = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    cleaned[key] = value;
  }

  return cleaned;
}

function buildUserPayload(rowData = {}, existingDoc = null, createNewFieldsUser = false) {
  const payload = {};

  for (const [key, value] of Object.entries(rowData)) {
    if (
      [
        "code",
        "user_code",
        "actor_code",
        "actorcode",
        "employee_code",
      ].includes(key)
    ) {
      continue;
    }

    if (createNewFieldsUser) {
      payload[key] = value;
    } else if (existingDoc && Object.prototype.hasOwnProperty.call(existingDoc, key)) {
      payload[key] = value;
    }
  }

  return cleanObject(payload);
}

function buildActorPayload(rowData = {}, existingDoc = null, createNewFieldsActorCode = false) {
  const baseFields = ["code", "name", "role", "position", "status"];
  const payload = {};

  // always try to keep code synced
  if (rowData.code) {
    payload.code = rowData.code;
    payload.actorCode = rowData.code;
  }

  for (const field of baseFields) {
    if (rowData[field] !== undefined) {
      payload[field] = rowData[field];
    }
  }

  if (createNewFieldsActorCode) {
    for (const [key, value] of Object.entries(rowData)) {
      if (payload[key] !== undefined) continue;
      payload[key] = value;
    }
  } else if (existingDoc) {
    for (const [key, value] of Object.entries(rowData)) {
      if (payload[key] !== undefined) continue;
      if (Object.prototype.hasOwnProperty.call(existingDoc, key)) {
        payload[key] = value;
      }
    }
  }

  return cleanObject(payload);
}

exports.uploadUsersDataFromCsvMaster = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: "CSV file is required",
      });
    }

    const dryRun = String(req.query.dryRun || "false").toLowerCase() === "true";
    const syncTarget = String(req.body.syncTarget || "both").trim().toLowerCase();

    const createMissingUser = parseBoolean(req.body.createMissingUser);
    const createMissingActorCode = parseBoolean(req.body.createMissingActorCode);

    const createNewFieldsUser = parseBoolean(req.body.createNewFieldsUser);
    const createNewFieldsActorCode = parseBoolean(req.body.createNewFieldsActorCode);

    if (!["user", "actorcode", "both"].includes(syncTarget)) {
      return res.status(400).json({
        success: false,
        message: "syncTarget must be one of: user, actorcode, both",
      });
    }

    const originalname = String(req.file.originalname || "").toLowerCase();
    if (!originalname.endsWith(".csv")) {
      return res.status(400).json({
        success: false,
        message: "Only CSV files are allowed",
      });
    }

    console.log("==== uploadUsersDataFromCsvMaster ====");
    console.log("FILE:", req.file.originalname);
    console.log("SIZE:", req.file.size);
    console.log("DRY RUN:", dryRun);
    console.log("SYNC TARGET:", syncTarget);
    console.log("CREATE MISSING USER:", createMissingUser);
    console.log("CREATE MISSING ACTORCODE:", createMissingActorCode);
    console.log("CREATE NEW FIELDS USER:", createNewFieldsUser);
    console.log("CREATE NEW FIELDS ACTORCODE:", createNewFieldsActorCode);

    const rows = await parseCsvBuffer(req.file.buffer);

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: "CSV is empty",
      });
    }

    const normalizedRows = [];
    const invalidRows = [];

    for (let i = 0; i < rows.length; i++) {
      const rawRow = rows[i] || {};
      const code = getCodeFromRow(rawRow);

      if (!code) {
        invalidRows.push({
          rowNumber: i + 2,
          code: null,
          reason: "Missing code",
        });
        continue;
      }

      const normalizedData = {};
      for (const [key, value] of Object.entries(rawRow)) {
        const normalizedKey = normalizeKey(key);
        normalizedData[normalizedKey] = parseValue(value);
      }

      normalizedData.code = code;

      normalizedRows.push({
        rowNumber: i + 2,
        code,
        data: normalizedData,
      });
    }

    if (!normalizedRows.length) {
      return res.status(400).json({
        success: false,
        message: "No valid rows found in CSV",
        invalidRows,
      });
    }

    // last row wins if duplicate code in CSV
    const rowMap = new Map();
    for (const item of normalizedRows) {
      rowMap.set(item.code, item);
    }

    const finalRows = Array.from(rowMap.values());
    const uniqueCodes = finalRows.map((item) => item.code);

    let existingUsers = [];
    let existingActors = [];

    if (syncTarget === "user" || syncTarget === "both") {
      existingUsers = await User.find({
        code: { $in: uniqueCodes },
      }).lean();
    }

    if (syncTarget === "actorcode" || syncTarget === "both") {
      existingActors = await ActorCode.find({
        $or: [
          { code: { $in: uniqueCodes } },
          { actorCode: { $in: uniqueCodes } },
        ],
      }).lean();
    }

    const existingUserMap = new Map(
      existingUsers.map((item) => [String(item.code).trim(), item])
    );

    const existingActorMap = new Map();
    for (const item of existingActors) {
      if (item.code) {
        existingActorMap.set(String(item.code).trim(), item);
      }
      if (item.actorCode) {
        existingActorMap.set(String(item.actorCode).trim(), item);
      }
    }

    const summary = {
      success: true,
      message: dryRun
        ? "Dry run completed successfully"
        : "CSV processed successfully",
      dryRun,
      syncTarget,
      totalRows: rows.length,
      validRows: normalizedRows.length,
      invalidRowsCount: invalidRows.length,
      uniqueCodesInFile: uniqueCodes.length,
      createMissingUser,
      createMissingActorCode,
      createNewFieldsUser,
      createNewFieldsActorCode,
      invalidRows,
      user: {
        willCreate: 0,
        willUpdate: 0,
        updated: 0,
        created: 0,
        unchanged: 0,
        failed: 0,
        skipped: [],
        failedUsers: [],
        sampleUsers: [],
      },
      actorCode: {
        willCreate: 0,
        willUpdate: 0,
        updated: 0,
        created: 0,
        unchanged: 0,
        failed: 0,
        skipped: [],
        failedUsers: [],
        sampleUsers: [],
      },
    };

    const userOps = [];
    const actorOps = [];

    for (const row of finalRows) {
      const { code, rowNumber, data } = row;

      // =========================
      // USER
      // =========================
      if (syncTarget === "user" || syncTarget === "both") {
        const existingUser = existingUserMap.get(code) || null;
        const userPayload = buildUserPayload(
          data,
          existingUser,
          createNewFieldsUser
        );

        const hasPayload = Object.keys(userPayload).length > 0;

        if (existingUser) {
          if (!hasPayload) {
            summary.user.skipped.push({
              rowNumber,
              code,
              reason: "No matching fields to update in User",
            });
          } else {
            summary.user.willUpdate += 1;

            userOps.push({
              mode: "update",
              rowNumber,
              code,
              name: data.name || existingUser.name || "",
              filter: { _id: existingUser._id },
              payload: userPayload,
              updatedFields: Object.keys(userPayload),
            });

            if (summary.user.sampleUsers.length < 20) {
              summary.user.sampleUsers.push({
                rowNumber,
                code,
                name: data.name || existingUser.name || "",
                action: "update",
                updatedFields: Object.keys(userPayload),
                updatePayload: userPayload,
              });
            }
          }
        } else {
          if (!createMissingUser) {
            summary.user.skipped.push({
              rowNumber,
              code,
              reason: "User not found and createMissingUser is false",
            });
          } else {
            const createPayload = createNewFieldsUser
              ? { code, ...data }
              : cleanObject({
                  code,
                  name: data.name,
                  role: data.role,
                  position: data.position,
                  status: data.status,
                });

            if (!Object.keys(createPayload).length) {
              summary.user.skipped.push({
                rowNumber,
                code,
                reason: "No fields available to create User",
              });
            } else {
              summary.user.willCreate += 1;

              userOps.push({
                mode: "create",
                rowNumber,
                code,
                name: data.name || "",
                filter: { code },
                payload: createPayload,
                updatedFields: Object.keys(createPayload),
              });

              if (summary.user.sampleUsers.length < 20) {
                summary.user.sampleUsers.push({
                  rowNumber,
                  code,
                  name: data.name || "",
                  action: "create",
                  updatedFields: Object.keys(createPayload),
                  updatePayload: createPayload,
                });
              }
            }
          }
        }
      }

      // =========================
      // ACTOR CODE
      // =========================
      if (syncTarget === "actorcode" || syncTarget === "both") {
        const existingActor = existingActorMap.get(code) || null;
        const actorPayload = buildActorPayload(
          data,
          existingActor,
          createNewFieldsActorCode
        );

        const hasPayload = Object.keys(actorPayload).length > 0;

        if (existingActor) {
          if (!hasPayload) {
            summary.actorCode.skipped.push({
              rowNumber,
              code,
              reason: "No matching fields to update in ActorCode",
            });
          } else {
            summary.actorCode.willUpdate += 1;

            actorOps.push({
              mode: "update",
              rowNumber,
              code,
              name: data.name || existingActor.name || "",
              filter: { _id: existingActor._id },
              payload: actorPayload,
              updatedFields: Object.keys(actorPayload),
            });

            if (summary.actorCode.sampleUsers.length < 20) {
              summary.actorCode.sampleUsers.push({
                rowNumber,
                code,
                name: data.name || existingActor.name || "",
                action: "update",
                updatedFields: Object.keys(actorPayload),
                updatePayload: actorPayload,
              });
            }
          }
        } else {
          if (!createMissingActorCode) {
            summary.actorCode.skipped.push({
              rowNumber,
              code,
              reason: "ActorCode not found and createMissingActorCode is false",
            });
          } else {
            const createPayload = buildActorPayload(
              data,
              null,
              createNewFieldsActorCode || true
            );

            if (!Object.keys(createPayload).length) {
              summary.actorCode.skipped.push({
                rowNumber,
                code,
                reason: "No fields available to create ActorCode",
              });
            } else {
              summary.actorCode.willCreate += 1;

              actorOps.push({
                mode: "create",
                rowNumber,
                code,
                name: data.name || "",
                filter: {
                  $or: [{ code }, { actorCode: code }],
                },
                payload: createPayload,
                updatedFields: Object.keys(createPayload),
              });

              if (summary.actorCode.sampleUsers.length < 20) {
                summary.actorCode.sampleUsers.push({
                  rowNumber,
                  code,
                  name: data.name || "",
                  action: "create",
                  updatedFields: Object.keys(createPayload),
                  updatePayload: createPayload,
                });
              }
            }
          }
        }
      }
    }

    if (dryRun) {
      return res.status(200).json(summary);
    }

    // =========================
    // EXECUTE USER OPS
    // =========================
    for (const op of userOps) {
      try {
        if (op.mode === "update") {
          const result = await User.updateOne(op.filter, {
            $set: op.payload,
          });

          if (result.modifiedCount > 0) {
            summary.user.updated += 1;
          } else {
            summary.user.unchanged += 1;
          }
        } else if (op.mode === "create") {
          const existing = await User.findOne({ code: op.code }).lean();

          if (existing) {
            const result = await User.updateOne(
              { _id: existing._id },
              { $set: op.payload }
            );

            if (result.modifiedCount > 0) {
              summary.user.updated += 1;
            } else {
              summary.user.unchanged += 1;
            }
          } else {
            await User.create(op.payload);
            summary.user.created += 1;
          }
        }
      } catch (err) {
        summary.user.failed += 1;
        summary.user.failedUsers.push({
          rowNumber: op.rowNumber,
          code: op.code,
          name: op.name || "",
          action: op.mode,
          reason: err.message || "User operation failed",
        });
      }
    }

    // =========================
    // EXECUTE ACTOR OPS
    // =========================
    for (const op of actorOps) {
      try {
        if (op.mode === "update") {
          const result = await ActorCode.updateOne(op.filter, {
            $set: op.payload,
          });

          if (result.modifiedCount > 0) {
            summary.actorCode.updated += 1;
          } else {
            summary.actorCode.unchanged += 1;
          }
        } else if (op.mode === "create") {
          const existing = await ActorCode.findOne({
            $or: [{ code: op.code }, { actorCode: op.code }],
          }).lean();

          if (existing) {
            const result = await ActorCode.updateOne(
              { _id: existing._id },
              { $set: op.payload }
            );

            if (result.modifiedCount > 0) {
              summary.actorCode.updated += 1;
            } else {
              summary.actorCode.unchanged += 1;
            }
          } else {
            await ActorCode.create(op.payload);
            summary.actorCode.created += 1;
          }
        }
      } catch (err) {
        summary.actorCode.failed += 1;
        summary.actorCode.failedUsers.push({
          rowNumber: op.rowNumber,
          code: op.code,
          name: op.name || "",
          action: op.mode,
          reason: err.message || "ActorCode operation failed",
        });
      }
    }

    return res.status(200).json(summary);
  } catch (err) {
    console.error("uploadUsersDataFromCsvMaster error:", err);
    return res.status(500).json({
      success: false,
      message: "User master CSV sync failed",
      error: err.message,
    });
  }
};
