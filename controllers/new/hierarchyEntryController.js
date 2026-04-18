const mongoose = require("mongoose");

const HierarchyEntries = require("../../model/HierarchyEntries");
const Firm = require("../../model/Firm");
const ActorTypesHierarchy = require("../../model/ActorTypesHierarchy");

function cleanValue(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function buildSearchFilter(search, fields) {
  if (!search || !String(search).trim()) return null;

  const regex = new RegExp(String(search).trim(), "i");

  return {
    $or: fields.map((f) => ({ [f]: regex })),
  };
}

exports.getHierarchyMeta = async (req, res) => {
  try {
    const [firms, flows] = await Promise.all([
      Firm.find({})
        .select("code name flowTypes")
        .lean(),

      ActorTypesHierarchy.find({})
        .select("name hierarchy")
        .lean(),
    ]);

    const flowMap = {};
    flows.forEach((f) => {
      flowMap[f.name] = Array.isArray(f.hierarchy) ? f.hierarchy : [];
    });

    return res.status(200).json({
      success: true,
      message: "Hierarchy meta fetched successfully",
      data: {
        firms: firms.map((f) => ({
          code: f.code || "",
          name: f.name || "",
          flowTypes: Array.isArray(f.flowTypes) ? f.flowTypes : [],
        })),
        flows: flows.map((f) => ({
          name: f.name || "",
          hierarchy: Array.isArray(f.hierarchy) ? f.hierarchy : [],
        })),
        flowMap,
      },
    });
  } catch (error) {
    console.error("getHierarchyMeta error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch hierarchy meta",
      error: error.message,
    });
  }
};

exports.getHierarchyEntries = async (req, res) => {
  try {
    const {
      firm_code,
      hierarchy_name,
      position_field,
      position_value,
      dealer,
      search,
      page = 1,
      limit = 50,
      all = "false",
    } = req.query;

    const fetchAll = String(all).toLowerCase() === "true";

    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 5000);
    const skip = (parsedPage - 1) * parsedLimit;

    let finalHierarchyName = String(hierarchy_name || "").trim();

    if (!finalHierarchyName && firm_code) {
      const firm = await Firm.findOne({
        code: String(firm_code).trim(),
      }).lean();

      if (firm?.flowTypes?.length) {
        finalHierarchyName = String(firm.flowTypes[0] || "").trim();
      }
    }

    if (!finalHierarchyName) {
      return res.status(400).json({
        success: false,
        message: "hierarchy_name is required",
      });
    }

    const flow = await ActorTypesHierarchy.findOne({
      name: finalHierarchyName,
    }).lean();

    if (!flow) {
      return res.status(404).json({
        success: false,
        message: "Flow not found",
      });
    }

    const fields = Array.isArray(flow.hierarchy) ? flow.hierarchy : [];

    const query = {
      hierarchy_name: finalHierarchyName,
    };

    if (position_field && position_value) {
      const safeField = String(position_field).trim();

      if (!fields.includes(safeField)) {
        return res.status(400).json({
          success: false,
          message: `Invalid position_field: ${safeField}`,
        });
      }

      query[safeField] = String(position_value).trim();
    }

    if (dealer && String(dealer).trim()) {
      query.dealer = String(dealer).trim();
    }

    const searchFilter = buildSearchFilter(search, fields);
    if (searchFilter) {
      query.$or = searchFilter.$or;
    }

    const total = await HierarchyEntries.countDocuments(query);

    let rowsQuery = HierarchyEntries.find(query)
      .sort({ updatedAt: -1, createdAt: -1 });

    if (!fetchAll) {
      rowsQuery = rowsQuery.skip(skip).limit(parsedLimit);
    }

    const rows = await rowsQuery.lean();

    return res.status(200).json({
      success: true,
      message: "Hierarchy entries fetched successfully",
      total,
      page: fetchAll ? 1 : parsedPage,
      limit: fetchAll ? total : parsedLimit,
      totalPages: fetchAll ? 1 : Math.ceil(total / parsedLimit),
      all: fetchAll,
      appliedFilters: {
        firm_code: firm_code || null,
        hierarchy_name: finalHierarchyName,
        position_field: position_field || null,
        position_value: position_value || null,
        dealer: dealer || null,
        search: search || null,
      },
      columns: fields,
      rows,
    });
  } catch (error) {
    console.error("getHierarchyEntries error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch hierarchy entries",
      error: error.message,
    });
  }
};

exports.updateHierarchyEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { updates = {} } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "id is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid entry id",
      });
    }

    const existing = await HierarchyEntries.findById(id).lean();

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Entry not found",
      });
    }

    const flow = await ActorTypesHierarchy.findOne({
      name: existing.hierarchy_name,
    }).lean();

    if (!flow) {
      return res.status(404).json({
        success: false,
        message: "Flow not found for this entry",
      });
    }

    const allowedFields = Array.isArray(flow.hierarchy) ? flow.hierarchy : [];

    const finalUpdate = {};
    const invalidFields = [];

    Object.keys(updates || {}).forEach((key) => {
      if (allowedFields.includes(key)) {
        finalUpdate[key] = cleanValue(updates[key]);
      } else {
        invalidFields.push(key);
      }
    });

    if (invalidFields.length) {
      return res.status(400).json({
        success: false,
        message: `Invalid update fields: ${invalidFields.join(", ")}`,
      });
    }

    if (!Object.keys(finalUpdate).length) {
      return res.status(400).json({
        success: false,
        message: "No valid fields to update",
      });
    }

    const updated = await HierarchyEntries.findByIdAndUpdate(
      id,
      { $set: finalUpdate },
      { new: true }
    ).lean();

    return res.status(200).json({
      success: true,
      message: "Hierarchy entry updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("updateHierarchyEntry error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update entry",
      error: error.message,
    });
  }
};

exports.bulkUpdateHierarchyEntries = async (req, res) => {
  try {
    const { ids = [], hierarchy_name, updates = {} } = req.body;

    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({
        success: false,
        message: "ids must be a non-empty array",
      });
    }

    if (!hierarchy_name || !String(hierarchy_name).trim()) {
      return res.status(400).json({
        success: false,
        message: "hierarchy_name is required",
      });
    }

    const cleanedIds = ids
      .map((id) => String(id || "").trim())
      .filter(Boolean);

    const invalidIds = cleanedIds.filter(
      (id) => !mongoose.Types.ObjectId.isValid(id)
    );

    if (invalidIds.length) {
      return res.status(400).json({
        success: false,
        message: `Invalid ids found: ${invalidIds.join(", ")}`,
      });
    }

    const uniqueIds = [...new Set(cleanedIds)];

    const flow = await ActorTypesHierarchy.findOne({
      name: String(hierarchy_name).trim(),
    }).lean();

    if (!flow) {
      return res.status(404).json({
        success: false,
        message: "Flow not found",
      });
    }

    const allowedFields = Array.isArray(flow.hierarchy) ? flow.hierarchy : [];

    const updateKeys = Object.keys(updates || {});

    if (!updateKeys.length) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one field to update",
      });
    }

    const invalidFields = updateKeys.filter(
      (key) => !allowedFields.includes(key)
    );

    if (invalidFields.length) {
      return res.status(400).json({
        success: false,
        message: `Invalid fields for flow ${hierarchy_name}: ${invalidFields.join(", ")}`,
      });
    }

    const docs = await HierarchyEntries.find({
      _id: { $in: uniqueIds },
    })
      .select("_id hierarchy_name dealer")
      .lean();

    if (!docs.length) {
      return res.status(404).json({
        success: false,
        message: "No hierarchy rows found for selected ids",
      });
    }

    const foundIds = docs.map((doc) => String(doc._id));
    const missingIds = uniqueIds.filter((id) => !foundIds.includes(id));

    if (missingIds.length) {
      return res.status(400).json({
        success: false,
        message: `Some selected rows were not found: ${missingIds.join(", ")}`,
      });
    }

    const mismatchedRows = docs.filter(
      (doc) => String(doc.hierarchy_name) !== String(hierarchy_name).trim()
    );

    if (mismatchedRows.length) {
      return res.status(400).json({
        success: false,
        message:
          "Bulk edit only supports rows from the same flow. Please select rows from one hierarchy flow only.",
        mismatchedRows: mismatchedRows.map((row) => ({
          _id: row._id,
          dealer: row.dealer || "",
          hierarchy_name: row.hierarchy_name || "",
        })),
      });
    }

    const finalUpdate = {};
    updateKeys.forEach((key) => {
      finalUpdate[key] = cleanValue(updates[key]);
    });

    const result = await HierarchyEntries.updateMany(
      {
        _id: { $in: uniqueIds },
        hierarchy_name: String(hierarchy_name).trim(),
      },
      {
        $set: finalUpdate,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Bulk hierarchy update applied successfully",
      data: {
        hierarchy_name: String(hierarchy_name).trim(),
        selectedCount: uniqueIds.length,
        matchedCount: result.matchedCount || 0,
        modifiedCount: result.modifiedCount || 0,
        updatedFields: Object.keys(finalUpdate),
      },
    });
  } catch (error) {
    console.error("bulkUpdateHierarchyEntries error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to bulk update hierarchy entries",
      error: error.message,
    });
  }
};