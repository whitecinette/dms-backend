const moment = require("moment-timezone");
const WeeklyBeatMappingSchedule = require("../../model/WeeklyBeatMappingSchedule");
const User = require("../../model/User");
const ActorTypesHierarchy = require("../../model/ActorTypesHierarchy");
const HierarchyEntries = require("../../model/HierarchyEntries");

const PRIVILEGED_ROLES = new Set(["admin", "super_admin", "hr"]);
const DEFAULT_FLOW_NAME = "default_sales_flow";

const normalize = (value) => String(value || "").trim().toLowerCase();

const toUniqueStrings = (values = []) => {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => normalize(value))
    .filter(Boolean))];
};

async function getHierarchy() {
  const doc = await ActorTypesHierarchy.findOne(
    { name: DEFAULT_FLOW_NAME },
    { hierarchy: 1 }
  ).lean();

  return toUniqueStrings(doc?.hierarchy || []);
}

async function getScopeForUser(authUser, hierarchy) {
  const role = normalize(authUser?.role);
  const position = normalize(authUser?.position);
  const code = String(authUser?.code || "").trim();

  if (PRIVILEGED_ROLES.has(role)) {
    return {
      role,
      position,
      code,
      isPrivileged: true,
      scopePositions: hierarchy.filter((p) => p !== "dealer"),
      allowedCodes: [],
    };
  }

  if (!position || !code || !hierarchy.length) {
    return {
      role,
      position,
      code,
      isPrivileged: false,
      scopePositions: [],
      allowedCodes: code ? [code] : [],
    };
  }

  const currentIndex = hierarchy.indexOf(position);
  if (currentIndex === -1) {
    return {
      role,
      position,
      code,
      isPrivileged: false,
      scopePositions: [],
      allowedCodes: [code],
    };
  }

  const subordinatePositions = hierarchy
    .slice(currentIndex + 1)
    .filter((pos) => pos !== "dealer");

  if (!subordinatePositions.length) {
    return {
      role,
      position,
      code,
      isPrivileged: false,
      scopePositions: [],
      allowedCodes: [code],
    };
  }

  const hierarchyEntries = await HierarchyEntries.find(
    {
      hierarchy_name: DEFAULT_FLOW_NAME,
      [position]: code,
    },
    subordinatePositions.reduce((acc, pos) => {
      acc[pos] = 1;
      return acc;
    }, {})
  ).lean();

  const subordinateCodes = new Set();
  for (const entry of hierarchyEntries) {
    for (const pos of subordinatePositions) {
      const subCode = String(entry?.[pos] || "").trim();
      if (subCode) subordinateCodes.add(subCode);
    }
  }

  // Include self so managers can still see their own schedule row.
  subordinateCodes.add(code);

  return {
    role,
    position,
    code,
    isPrivileged: false,
    scopePositions: subordinatePositions,
    allowedCodes: [...subordinateCodes],
  };
}

function compileSearchQuery(search = "") {
  const term = String(search || "").trim();
  if (!term) return null;

  const safe = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(safe, "i");
}

function groupSchedulesByCode(scheduleDocs = []) {
  const map = new Map();
  for (const doc of scheduleDocs) {
    const code = String(doc?.code || "").trim();
    if (!code) continue;
    if (!map.has(code)) map.set(code, []);
    map.get(code).push(doc);
  }
  return map;
}

function getDoneVsTotal(scheduleDocs = []) {
  const dealerState = new Map();

  for (const doc of scheduleDocs) {
    const dealers = Array.isArray(doc?.schedule) ? doc.schedule : [];
    for (const dealer of dealers) {
      const dealerCode = String(dealer?.code || "").trim();
      if (!dealerCode) continue;

      const alreadyDone = dealerState.get(dealerCode) === true;
      const nowDone = normalize(dealer?.status) === "done";

      dealerState.set(dealerCode, alreadyDone || nowDone);
    }
  }

  const total = dealerState.size;
  const done = [...dealerState.values()].filter(Boolean).length;

  return {
    total,
    done,
    pending: Math.max(total - done, 0),
  };
}

exports.getMarketCoverageDashboardRoles = async (req, res) => {
  try {
    const hierarchy = await getHierarchy();
    const scope = await getScopeForUser(req.user, hierarchy);

    const positions = scope.isPrivileged
      ? hierarchy.filter((p) => p !== "dealer")
      : scope.scopePositions;

    return res.status(200).json({
      success: true,
      positions,
      viewer: {
        code: scope.code,
        role: scope.role,
        position: scope.position,
        privileged: scope.isPrivileged,
      },
    });
  } catch (error) {
    console.error("Error in getMarketCoverageDashboardRoles:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.getMarketCoverageDashboardOverview = async (req, res) => {
  try {
    let { startDate, endDate, positions = [], search = "" } = req.body || {};

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "startDate and endDate are required",
      });
    }

    const hierarchy = await getHierarchy();
    const scope = await getScopeForUser(req.user, hierarchy);

    const start = moment.tz(startDate, "Asia/Kolkata").startOf("day").toDate();
    const end = moment.tz(endDate, "Asia/Kolkata").endOf("day").toDate();

    const monthStart = moment(start).tz("Asia/Kolkata").startOf("month").startOf("day").toDate();
    const monthEnd = moment(start).tz("Asia/Kolkata").endOf("month").endOf("day").toDate();

    const searchRegex = compileSearchQuery(search);

    const requestedPositions = toUniqueStrings(positions);
    const effectivePositions = requestedPositions.length
      ? requestedPositions
      : (scope.isPrivileged ? ["asm"] : scope.scopePositions);

    const userQuery = {
      status: "active",
    };

    if (effectivePositions.length) {
      userQuery.position = { $in: effectivePositions };
    }

    if (!scope.isPrivileged) {
      userQuery.code = { $in: scope.allowedCodes };
    }

    if (searchRegex) {
      userQuery.$or = [
        { code: searchRegex },
        { name: searchRegex },
      ];
    }

    const users = await User.find(userQuery, {
      code: 1,
      name: 1,
      position: 1,
      role: 1,
      status: 1,
      firm: 1,
      firmCode: 1,
      _id: 0,
    }).lean();

    const userCodes = users.map((user) => String(user.code || "").trim()).filter(Boolean);

    if (!userCodes.length) {
      return res.status(200).json({
        success: true,
        data: [],
        meta: {
          totalEmployees: 0,
          startDate,
          endDate,
          scope: {
            role: scope.role,
            position: scope.position,
            privileged: scope.isPrivileged,
          },
        },
      });
    }

    const [rangeSchedules, monthSchedules] = await Promise.all([
      WeeklyBeatMappingSchedule.find({
        code: { $in: userCodes },
        startDate: { $lte: end },
        endDate: { $gte: start },
      }).lean(),
      WeeklyBeatMappingSchedule.find({
        code: { $in: userCodes },
        startDate: { $lte: monthEnd },
        endDate: { $gte: monthStart },
      }).lean(),
    ]);

    const rangeMap = groupSchedulesByCode(rangeSchedules);
    const monthMap = groupSchedulesByCode(monthSchedules);

    const data = users.map((user) => {
      const code = String(user.code || "").trim();
      const todayCounts = getDoneVsTotal(rangeMap.get(code) || []);
      const monthCounts = getDoneVsTotal(monthMap.get(code) || []);

      return {
        code,
        name: user.name || "",
        position: normalize(user.position),
        role: normalize(user.role),
        firm: user.firm || user.firmCode || "",
        total: todayCounts.total,
        done: todayCounts.done,
        pending: todayCounts.pending,
        ovTotal: monthCounts.total,
        ovDone: monthCounts.done,
        ovPending: monthCounts.pending,
      };
    });

    return res.status(200).json({
      success: true,
      data,
      meta: {
        totalEmployees: data.length,
        startDate,
        endDate,
        scope: {
          role: scope.role,
          position: scope.position,
          privileged: scope.isPrivileged,
        },
      },
    });
  } catch (error) {
    console.error("Error in getMarketCoverageDashboardOverview:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
