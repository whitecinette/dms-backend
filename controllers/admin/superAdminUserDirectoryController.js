const mongoose = require("mongoose");
const MetaData = require("../../model/MetaData");
const Firm = require("../../model/Firm");
const User = require("../../model/User");
const ActorCode = require("../../model/ActorCode");

const EXCLUDED_POSITIONS = ["mdd", "dealer", "spd", "smd"];

const normalizeStatus = (status) => {
  if (!status) return undefined;
  const s = String(status).trim().toLowerCase();
  if (s === "active") return "active";
  if (s === "inactive") return "inactive";
  return undefined;
};

const toDisplayValue = (value) => {
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    (typeof value === "number" && Number.isNaN(value))
  ) {
    return "NA";
  }
  return value;
};

const cleanObject = (obj = {}) => {
  const cleaned = {};
  Object.keys(obj).forEach((key) => {
    if (
      key !== "_id" &&
      key !== "__v" &&
      key !== "createdAt" &&
      key !== "updatedAt"
    ) {
      cleaned[key] = obj[key];
    }
  });
  return cleaned;
};

exports.getSuperAdminUserDirectory = async (req, res) => {
  try {
    const {
      position,
      role,
      status,
      search,
      page = 1,
      limit = 50,
    } = req.query;

    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
    const skip = (parsedPage - 1) * parsedLimit;

    const safeStatus = normalizeStatus(status);

    const actorFilter = {
      position: { $nin: EXCLUDED_POSITIONS },
    };

    const userFilter = {
      position: { $nin: EXCLUDED_POSITIONS },
    };

    if (position) {
      actorFilter.position = String(position).trim().toLowerCase();
      userFilter.position = String(position).trim().toLowerCase();
    }

    if (role) {
      actorFilter.role = String(role).trim().toLowerCase();
      userFilter.role = String(role).trim().toLowerCase();
    }

    if (safeStatus) {
      actorFilter.status = safeStatus;
      userFilter.status = safeStatus;
    }

    if (search && String(search).trim()) {
      const regex = new RegExp(String(search).trim(), "i");
      actorFilter.$or = [
        { code: regex },
        { name: regex },
        { parent_code: regex },
      ];
      userFilter.$or = [
        { code: regex },
        { name: regex },
        { email: regex },
        { phone: regex },
      ];
    }

    const [actorDocs, userDocs, metaDocs] = await Promise.all([
      ActorCode.find(actorFilter).lean(),
      User.find(userFilter).lean(),
      MetaData.find({}).lean(),
    ]);

    const actorMap = new Map();
    const userMap = new Map();
    const metaMap = new Map();

    actorDocs.forEach((doc) => {
      if (doc?.code) actorMap.set(doc.code, doc);
    });

    userDocs.forEach((doc) => {
      if (doc?.code) userMap.set(doc.code, doc);
    });

    metaDocs.forEach((doc) => {
      if (doc?.code) metaMap.set(doc.code, doc);
    });

    const allCodes = new Set([
      ...actorDocs.map((x) => x.code).filter(Boolean),
      ...userDocs.map((x) => x.code).filter(Boolean),
    ]);

    let rows = Array.from(allCodes).map((code) => {
      const actor = actorMap.get(code) || {};
      const user = userMap.get(code) || {};
      const metadata = metaMap.get(code) || null;

      const metadataClean = metadata ? cleanObject(metadata) : null;

      return {
        code: code || "NA",
        name: toDisplayValue(user.name || actor.name),
        position: toDisplayValue(user.position || actor.position),
        role: toDisplayValue(user.role || actor.role),
        user_status: toDisplayValue(user.status),
        actor_status: toDisplayValue(actor.status),
        is_active:
          (user.status || actor.status || "").toLowerCase() === "active"
            ? "active"
            : "inactive",

        email: toDisplayValue(user.email),
        phone: toDisplayValue(user.phone),
        parent_code: toDisplayValue(actor.parent_code),
        siddha_code: toDisplayValue(user.siddha_code),

        firm_code: toDisplayValue(metadata?.firm_code),
        metadata_available: !!metadata,
        metadata: metadataClean
          ? Object.fromEntries(
              Object.entries(metadataClean).map(([key, value]) => [
                key,
                toDisplayValue(value),
              ])
            )
          : null,

        actor_data: actor && Object.keys(actor).length ? actor : null,
        user_data: user && Object.keys(user).length ? user : null,
      };
    });

    rows = rows.filter((row) => !EXCLUDED_POSITIONS.includes(String(row.position).toLowerCase()));

    rows.sort((a, b) => {
      const posA = String(a.position || "");
      const posB = String(b.position || "");
      const nameA = String(a.name || "");
      const nameB = String(b.name || "");
      return posA.localeCompare(posB) || nameA.localeCompare(nameB);
    });

    const allMetadataKeysSet = new Set();
    rows.forEach((row) => {
      if (row.metadata && typeof row.metadata === "object") {
        Object.keys(row.metadata).forEach((key) => allMetadataKeysSet.add(key));
      }
    });

    const total = rows.length;
    const paginatedRows = rows.slice(skip, skip + parsedLimit);

    return res.status(200).json({
      success: true,
      message: "User directory fetched successfully",
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.ceil(total / parsedLimit),
      filters: {
        excluded_positions: EXCLUDED_POSITIONS,
        applied: {
          position: position || null,
          role: role || null,
          status: safeStatus || null,
          search: search || null,
        },
      },
      allMetadataKeys: Array.from(allMetadataKeysSet).sort(),
      rows: paginatedRows,
    });
  } catch (error) {
    console.error("getSuperAdminUserDirectory error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user directory",
      error: error.message,
    });
  }
};

exports.getFirmOptionsForUserDirectory = async (req, res) => {
  try {
    const firms = await Firm.find({})
      .select("code name status firmId orgName")
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: "Firm options fetched successfully",
      firms: firms.map((firm) => ({
        _id: firm._id,
        code: firm.code || "NA",
        name: firm.name || "NA",
        status: firm.status || "NA",
        firmId: firm.firmId || "NA",
        orgName: firm.orgName || "NA",
        label: `${firm.name || "Unnamed Firm"} (${firm.code || "NA"})`,
      })),
    });
  } catch (error) {
    console.error("getFirmOptionsForUserDirectory error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch firms",
      error: error.message,
    });
  }
};

exports.updateUserDirectoryFirm = async (req, res) => {
  try {
    const { code } = req.params;
    const { firm_code } = req.body;

    if (!code || !firm_code) {
      return res.status(400).json({
        success: false,
        message: "code and firm_code are required",
      });
    }

    const firm = await Firm.findOne({ code: firm_code }).lean();

    if (!firm) {
      return res.status(404).json({
        success: false,
        message: "Firm not found for provided firm_code",
      });
    }

    const userOrActor = await Promise.all([
      User.findOne({ code }).lean(),
      ActorCode.findOne({ code }).lean(),
    ]);

    if (!userOrActor[0] && !userOrActor[1]) {
      return res.status(404).json({
        success: false,
        message: "User/Actor not found for provided code",
      });
    }

    const sourceName =
      userOrActor[0]?.name || userOrActor[1]?.name || "NA";

    const updatedMeta = await MetaData.findOneAndUpdate(
      { code },
      {
        $set: {
          code,
          system_code: code,
          name: sourceName,
          firm_code,
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    ).lean();

    return res.status(200).json({
      success: true,
      message: "Firm updated successfully",
      data: updatedMeta,
    });
  } catch (error) {
    console.error("updateUserDirectoryFirm error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update firm",
      error: error.message,
    });
  }
};

exports.getUserDirectoryMetadataByCode = async (req, res) => {
  try {
    const { code } = req.params;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "code is required",
      });
    }

    const [user, actor, metadata] = await Promise.all([
      User.findOne({ code }).lean(),
      ActorCode.findOne({ code }).lean(),
      MetaData.findOne({ code }).lean(),
    ]);

    if (!user && !actor) {
      return res.status(404).json({
        success: false,
        message: "No user/actor found for this code",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Metadata fetched successfully",
      data: {
        code,
        name: metadata?.name || user?.name || actor?.name || "NA",
        metadata: metadata || null,
      },
    });
  } catch (error) {
    console.error("getUserDirectoryMetadataByCode error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch metadata",
      error: error.message,
    });
  }
};

exports.upsertUserDirectoryMetadata = async (req, res) => {
  try {
    const { code } = req.params;
    const payload = { ...req.body };

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "code is required",
      });
    }

    const [user, actor] = await Promise.all([
      User.findOne({ code }).lean(),
      ActorCode.findOne({ code }).lean(),
    ]);

    if (!user && !actor) {
      return res.status(404).json({
        success: false,
        message: "No user/actor found for this code",
      });
    }

    delete payload._id;
    delete payload.__v;
    delete payload.createdAt;
    delete payload.updatedAt;
    delete payload.code;

    const finalPayload = {
      ...payload,
      code,
      system_code: payload.system_code || code,
      name: payload.name || user?.name || actor?.name || "NA",
    };

    const updatedMeta = await MetaData.findOneAndUpdate(
      { code },
      { $set: finalPayload },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    ).lean();

    return res.status(200).json({
      success: true,
      message: "Metadata saved successfully",
      data: updatedMeta,
    });
  } catch (error) {
    console.error("upsertUserDirectoryMetadata error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save metadata",
      error: error.message,
    });
  }
};

exports.updateUserDirectoryStatus = async (req, res) => {
  try {
    const { code } = req.params;
    const { status } = req.body;

    const safeStatus = normalizeStatus(status);

    if (!code || !safeStatus) {
      return res.status(400).json({
        success: false,
        message: "Valid code and status(active/inactive) are required",
      });
    }

    const [updatedUser, updatedActor] = await Promise.all([
      User.findOneAndUpdate(
        { code },
        { $set: { status: safeStatus } },
        { new: true }
      ).lean(),
      ActorCode.findOneAndUpdate(
        { code },
        { $set: { status: safeStatus } },
        { new: true }
      ).lean(),
    ]);

    if (!updatedUser && !updatedActor) {
      return res.status(404).json({
        success: false,
        message: "No user/actor found for this code",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Status updated successfully",
      data: {
        code,
        user_status: updatedUser?.status || "NA",
        actor_status: updatedActor?.status || "NA",
      },
    });
  } catch (error) {
    console.error("updateUserDirectoryStatus error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update status",
      error: error.message,
    });
  }
};

exports.getUserDirectory = async (req, res) => {
  try {
    const { search, position, role, status } = req.query;

    const actorFilter = {
      position: { $nin: ["dealer", "mdd", "spd", "smd"] },
    };

    const userFilter = {};
    const metaFilter = {};

    // 🔍 POSITION FILTER
    if (position) {
      actorFilter.position = String(position).toLowerCase();
      userFilter.position = String(position).toLowerCase();
    }

    // 🔍 ROLE FILTER
    if (role) {
      actorFilter.role = String(role).toLowerCase();
      userFilter.role = String(role).toLowerCase();
    }

    // 🔍 STATUS FILTER
    if (status) {
      const safeStatus = String(status).toLowerCase();
      actorFilter.status = safeStatus;
      userFilter.status = safeStatus;
    }

    // 🔍 SEARCH FILTER
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");

      actorFilter.$or = [
        { code: regex },
        { name: regex },
        { parent_code: regex },
      ];

      userFilter.$or = [
        { code: regex },
        { name: regex },
        { email: regex },
        { phone: regex },
      ];
    }

    const actorCodes = await ActorCode.find(actorFilter).lean();

    const codes = actorCodes.map((x) => x.code).filter(Boolean);

    const [users, metadata] = await Promise.all([
      User.find({
        code: { $in: codes },
        ...(Object.keys(userFilter).length ? userFilter : {}),
      }).lean(),
      MetaData.find({
        code: { $in: codes },
      }).lean(),
    ]);

    const userMap = new Map(users.map((u) => [u.code, u]));
    const metadataMap = new Map(metadata.map((m) => [m.code, m]));

    let rows = actorCodes.map((actor) => {
      const user = userMap.get(actor.code);
      const meta = metadataMap.get(actor.code);

      const finalPosition = user?.position || actor.position;
      const finalRole = user?.role || actor.role;
      const finalStatus = (user?.status || actor?.status || "").toLowerCase();

      return {
        code: actor.code || "NA",
        name: user?.name || actor.name || "NA",
        position: finalPosition || "NA",
        role: finalRole || "NA",
        user_status: user?.status || "NA",
        actor_status: actor?.status || "NA",
        is_active: finalStatus === "active" ? "active" : "inactive",

        firm_code: meta?.firm_code || "NA",
        metadata_available: !!meta,
        metadata: meta || null,

        user_data: user || null,
        actor_data: actor || null,
      };
    });

    // 🔥 FINAL FILTER SAFETY (important because merge happens after DB)
    rows = rows.filter((row) => {
      const pos = String(row.position || "").toLowerCase();
      if (["dealer", "mdd", "spd", "smd"].includes(pos)) return false;

      if (position && pos !== String(position).toLowerCase()) return false;

      if (role && String(row.role).toLowerCase() !== String(role).toLowerCase())
        return false;

      if (status && String(row.is_active) !== String(status).toLowerCase())
        return false;

      if (search) {
        const s = search.toLowerCase();
        const match =
          String(row.code).toLowerCase().includes(s) ||
          String(row.name).toLowerCase().includes(s) ||
          String(row.user_data?.email || "").toLowerCase().includes(s) ||
          String(row.user_data?.phone || "").toLowerCase().includes(s);

        if (!match) return false;
      }

      return true;
    });

    return res.status(200).json({
      success: true,
      rows,
    });
  } catch (error) {
    console.error("getUserDirectory error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user directory",
      error: error.message,
    });
  }
};