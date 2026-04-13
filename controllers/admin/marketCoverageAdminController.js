const moment = require("moment-timezone");
const WeeklyBeatMappingSchedule = require("../../model/WeeklyBeatMappingSchedule");
const User = require("../../model/User");
const ActorTypesHierarchy = require("../../model/ActorTypesHierarchy");
const HierarchyEntries = require("../../model/HierarchyEntries");

const PRIVILEGED_ROLES = new Set(["admin", "super_admin", "hr"]);
const DASHBOARD_BLOCKED_POSITIONS = new Set(["tse", "so"]);
const DEFAULT_FLOW_NAME = "default_sales_flow";

const normalize = (value) => String(value || "").trim().toLowerCase();

const toUniqueStrings = (values = []) => {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => normalize(value))
    .filter(Boolean))];
};

const parseLatLong = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object" && value.$numberDecimal !== undefined) {
    const parsed = Number(value.$numberDecimal);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object" && typeof value.toString === "function") {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toIST = (d) => (d ? moment.utc(d).tz("Asia/Kolkata").format() : null);

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

function collectDealerCodesFromSchedules(scheduleDocs = []) {
  const dealerCodes = new Set();
  for (const doc of scheduleDocs) {
    for (const dealer of doc?.schedule || []) {
      const dealerCode = String(dealer?.code || "").trim();
      if (dealerCode) dealerCodes.add(dealerCode);
    }
  }
  return dealerCodes;
}

function filterSchedulesByDealerSet(scheduleDocs = [], allowedDealerCodes = null) {
  if (!allowedDealerCodes) return scheduleDocs;
  return scheduleDocs.map((doc) => ({
    ...doc,
    schedule: (doc?.schedule || []).filter((dealer) => {
      const dealerCode = String(dealer?.code || "").trim();
      return dealerCode && allowedDealerCodes.has(dealerCode);
    }),
  }));
}

async function getScopedEmployees({ scope, effectivePositions = [], searchRegex = null }) {
  const userQuery = { status: "active" };

  if (effectivePositions.length) {
    userQuery.position = { $in: effectivePositions };
  }

  if (!scope.isPrivileged) {
    userQuery.code = { $in: scope.allowedCodes };
  }

  if (searchRegex) {
    userQuery.$or = [{ code: searchRegex }, { name: searchRegex }];
  }

  return User.find(userQuery, {
    code: 1,
    name: 1,
    position: 1,
    role: 1,
    status: 1,
    firm: 1,
    firmCode: 1,
    _id: 0,
  }).lean();
}

async function getScheduledCodesInRange({ start, end }) {
  if (!start || !end) return [];
  const codes = await WeeklyBeatMappingSchedule.distinct("code", {
    startDate: { $lte: end },
    endDate: { $gte: start },
  });
  return [...new Set((codes || []).map((c) => String(c || "").trim()).filter(Boolean))];
}

async function getUsersByHierarchyScope(scope) {
  if (scope.isPrivileged) {
    return User.find({}, {
      district: 1,
      taluka: 1,
      zone: 1,
      town: 1,
      code: 1,
      position: 1,
      _id: 0,
    }).lean();
  }

  if (!scope.position || !scope.code) return [];

  const hierarchyEntries = await HierarchyEntries.find(
    {
      hierarchy_name: DEFAULT_FLOW_NAME,
      [scope.position]: scope.code,
    },
    { mdd: 1, dealer: 1, _id: 0 }
  ).lean();

  const allowedCodes = new Set();
  for (const entry of hierarchyEntries) {
    const mddCode = String(entry?.mdd || "").trim();
    const dealerCode = String(entry?.dealer || "").trim();
    if (mddCode) allowedCodes.add(mddCode);
    if (dealerCode) allowedCodes.add(dealerCode);
  }

  if (!allowedCodes.size) return [];

  return User.find(
    { code: { $in: [...allowedCodes] } },
    {
      district: 1,
      taluka: 1,
      zone: 1,
      town: 1,
      code: 1,
      position: 1,
      _id: 0,
    }
  ).lean();
}

exports.getMarketCoverageDashboardRoles = async (req, res) => {
  try {
    const hierarchy = await getHierarchy();
    const scope = await getScopeForUser(req.user, hierarchy);
    if (!scope.isPrivileged && DASHBOARD_BLOCKED_POSITIONS.has(scope.position)) {
      return res.status(403).json({
        success: false,
        message: "Dashboard is not available for this position. Use timeline view.",
      });
    }

    const basePositions = scope.isPrivileged
      ? hierarchy.filter((p) => p !== "dealer")
      : [scope.position, ...scope.scopePositions];
    const positions = [...new Set(
      basePositions
        .map((p) => normalize(p))
        .filter((p) => p && p !== "dealer")
    )];

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
    let { startDate, endDate, positions = [], search = "", topOutlet = false } = req.body || {};

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "startDate and endDate are required",
      });
    }

    const hierarchy = await getHierarchy();
    const scope = await getScopeForUser(req.user, hierarchy);
    if (!scope.isPrivileged && DASHBOARD_BLOCKED_POSITIONS.has(scope.position)) {
      return res.status(403).json({
        success: false,
        message: "Dashboard is not available for this position. Use timeline view.",
      });
    }

    const start = moment.tz(startDate, "Asia/Kolkata").startOf("day").toDate();
    const end = moment.tz(endDate, "Asia/Kolkata").endOf("day").toDate();

    const monthStart = moment(start).tz("Asia/Kolkata").startOf("month").startOf("day").toDate();
    const monthEnd = moment(start).tz("Asia/Kolkata").endOf("month").endOf("day").toDate();

    const searchRegex = compileSearchQuery(search);

    const requestedPositions = toUniqueStrings(positions);
    const effectivePositions = requestedPositions;

    const scheduledCodes = await getScheduledCodesInRange({ start, end });
    const scopedScheduledCodes = scope.isPrivileged
      ? scheduledCodes
      : scheduledCodes.filter((code) => scope.allowedCodes.includes(code));

    if (!scopedScheduledCodes.length) {
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

    const users = await User.find(
      {
        status: "active",
        code: { $in: scopedScheduledCodes },
        ...(effectivePositions.length
          ? { position: { $in: effectivePositions } }
          : {}),
        ...(searchRegex
          ? { $or: [{ code: searchRegex }, { name: searchRegex }] }
          : {}),
      },
      {
        code: 1,
        name: 1,
        position: 1,
        role: 1,
        status: 1,
        firm: 1,
        firmCode: 1,
        _id: 0,
      }
    ).lean();

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

    let [rangeSchedules, monthSchedules] = await Promise.all([
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

    const topOnly = topOutlet === true;
    if (topOnly) {
      const dealerCodes = new Set([
        ...collectDealerCodesFromSchedules(rangeSchedules),
        ...collectDealerCodesFromSchedules(monthSchedules),
      ]);
      if (dealerCodes.size) {
        const topDealers = await User.find(
          { code: { $in: [...dealerCodes] }, top_outlet: true },
          { code: 1, _id: 0 }
        ).lean();
        const topDealerCodes = new Set(
          topDealers.map((d) => String(d.code || "").trim()).filter(Boolean)
        );
        rangeSchedules = filterSchedulesByDealerSet(rangeSchedules, topDealerCodes);
        monthSchedules = filterSchedulesByDealerSet(monthSchedules, topDealerCodes);
      } else {
        rangeSchedules = [];
        monthSchedules = [];
      }
    }

    const rangeMap = groupSchedulesByCode(rangeSchedules);
    const monthMap = groupSchedulesByCode(monthSchedules);

    const rawData = users.map((user) => {
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
    const data = topOnly
      ? rawData.filter((row) => (row.total > 0 || row.ovTotal > 0))
      : rawData;

    return res.status(200).json({
      success: true,
      data,
      meta: {
        totalEmployees: data.length,
        startDate,
        endDate,
        topOutlet: topOnly,
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

exports.getMarketCoverageDashboardAnalytics = async (req, res) => {
  try {
    let {
      startDate,
      endDate,
      positions = [],
      search = "",
      recentDays = 7,
      topOutlet = false,
    } = req.body || {};

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "startDate and endDate are required",
      });
    }

    const hierarchy = await getHierarchy();
    const scope = await getScopeForUser(req.user, hierarchy);
    if (!scope.isPrivileged && DASHBOARD_BLOCKED_POSITIONS.has(scope.position)) {
      return res.status(403).json({
        success: false,
        message: "Dashboard is not available for this position. Use timeline view.",
      });
    }

    const start = moment.tz(startDate, "Asia/Kolkata").startOf("day").toDate();
    const end = moment.tz(endDate, "Asia/Kolkata").endOf("day").toDate();

    const todayStart = moment.tz("Asia/Kolkata").startOf("day").toDate();
    const todayEnd = moment.tz("Asia/Kolkata").endOf("day").toDate();
    const safeRecentDays = Math.max(Number(recentDays) || 7, 1);
    const recentStart = moment
      .tz("Asia/Kolkata")
      .subtract(safeRecentDays - 1, "days")
      .startOf("day")
      .toDate();

    const requestedPositions = toUniqueStrings(positions);
    const effectivePositions = requestedPositions;
    const searchRegex = compileSearchQuery(search);
    const scheduledCodes = await getScheduledCodesInRange({ start, end });
    const scopedScheduledCodes = scope.isPrivileged
      ? scheduledCodes
      : scheduledCodes.filter((code) => scope.allowedCodes.includes(code));

    const users = scopedScheduledCodes.length
      ? await User.find(
          {
            status: "active",
            code: { $in: scopedScheduledCodes },
            ...(effectivePositions.length
              ? { position: { $in: effectivePositions } }
              : {}),
            ...(searchRegex
              ? { $or: [{ code: searchRegex }, { name: searchRegex }] }
              : {}),
          },
          {
            code: 1,
            name: 1,
            position: 1,
            role: 1,
            status: 1,
            firm: 1,
            firmCode: 1,
            _id: 0,
          }
        ).lean()
      : [];

    const userCodes = users
      .map((user) => String(user.code || "").trim())
      .filter(Boolean);

    if (!userCodes.length) {
      return res.status(200).json({
        success: true,
        data: {
          summary: {
            employees: 0,
            planned: 0,
            done: 0,
            pending: 0,
            coveragePct: 0,
            activeEmployees: 0,
            notStartedToday: 0,
            noVisitRecently: 0,
            mapVisited: 0,
            mapNotVisited: 0,
          },
          positionPerformance: [],
          employeePerformance: [],
          noVisitToday: [],
          noVisitRecent: [],
          map: {
            center: { lat: 26.9124, lng: 75.7873 },
            pins: [],
            counts: { total: 0, visited: 0, notVisited: 0 },
          },
        },
      });
    }

    const overlapRangeQuery = {
      code: { $in: userCodes },
      startDate: { $lte: end },
      endDate: { $gte: start },
    };
    const overlapTodayQuery = {
      code: { $in: userCodes },
      startDate: { $lte: todayEnd },
      endDate: { $gte: todayStart },
    };
    const overlapRecentQuery = {
      code: { $in: userCodes },
      startDate: { $lte: todayEnd },
      endDate: { $gte: recentStart },
    };

    let [rangeSchedules, todaySchedules, recentSchedules] = await Promise.all([
      WeeklyBeatMappingSchedule.find(overlapRangeQuery).lean(),
      WeeklyBeatMappingSchedule.find(overlapTodayQuery).lean(),
      WeeklyBeatMappingSchedule.find(overlapRecentQuery).lean(),
    ]);

    const topOnly = topOutlet === true;
    if (topOnly) {
      const dealerCodes = new Set([
        ...collectDealerCodesFromSchedules(rangeSchedules),
        ...collectDealerCodesFromSchedules(todaySchedules),
        ...collectDealerCodesFromSchedules(recentSchedules),
      ]);
      if (dealerCodes.size) {
        const topDealers = await User.find(
          { code: { $in: [...dealerCodes] }, top_outlet: true },
          { code: 1, _id: 0 }
        ).lean();
        const topDealerCodes = new Set(
          topDealers.map((d) => String(d.code || "").trim()).filter(Boolean)
        );
        rangeSchedules = filterSchedulesByDealerSet(rangeSchedules, topDealerCodes);
        todaySchedules = filterSchedulesByDealerSet(todaySchedules, topDealerCodes);
        recentSchedules = filterSchedulesByDealerSet(recentSchedules, topDealerCodes);
      } else {
        rangeSchedules = [];
        todaySchedules = [];
        recentSchedules = [];
      }
    }

    const rangeMap = groupSchedulesByCode(rangeSchedules);
    const todayMap = groupSchedulesByCode(todaySchedules);
    const recentMap = groupSchedulesByCode(recentSchedules);

    const positionAgg = new Map();
    const pinAgg = new Map();
    const employeePerformance = [];
    const noVisitToday = [];
    const noVisitRecent = [];

    let totalPlanned = 0;
    let totalDone = 0;
    let activeEmployees = 0;
    let notStartedToday = 0;
    const userNameByCode = new Map(
      users.map((u) => [String(u.code || "").trim(), String(u.name || "").trim()])
    );

    for (const user of users) {
      const userCode = String(user.code || "").trim();
      const userName = String(user.name || "").trim();
      const userPosition = normalize(user.position);
      const userRange = rangeMap.get(userCode) || [];
      const userToday = todayMap.get(userCode) || [];
      const userRecent = recentMap.get(userCode) || [];

      const plannedDealers = new Set();
      const doneDealers = new Set();
      const todayPlanned = new Set();
      const todayDone = new Set();
      const recentDone = new Set();

      let firstVisitAt = null;
      let lastVisitAt = null;

      const consumeSchedules = (docs, plannedSet, doneSet) => {
        for (const doc of docs) {
          for (const dealer of doc.schedule || []) {
            const dealerCode = String(dealer?.code || "").trim();
            if (!dealerCode) continue;
            plannedSet.add(dealerCode);

            const dealerDone = normalize(dealer?.status) === "done";
            if (dealerDone) {
              doneSet.add(dealerCode);
              const markedAt = dealer?.markedDoneAt
                ? new Date(dealer.markedDoneAt)
                : null;
              if (markedAt) {
                if (!firstVisitAt || markedAt < firstVisitAt) firstVisitAt = markedAt;
                if (!lastVisitAt || markedAt > lastVisitAt) lastVisitAt = markedAt;
              }
            }
          }
        }
      };

      consumeSchedules(userRange, plannedDealers, doneDealers);
      consumeSchedules(userToday, todayPlanned, todayDone);
      consumeSchedules(userRecent, new Set(), recentDone);

      if (topOnly && plannedDealers.size === 0 && todayPlanned.size === 0) {
        continue;
      }

      const planned = plannedDealers.size;
      const done = doneDealers.size;
      const pending = Math.max(planned - done, 0);
      const coveragePct = planned ? Number(((done / planned) * 100).toFixed(1)) : 0;

      totalPlanned += planned;
      totalDone += done;
      if (done > 0) activeEmployees += 1;
      if (todayPlanned.size > 0 && todayDone.size === 0) notStartedToday += 1;

      employeePerformance.push({
        code: userCode,
        name: userName,
        position: userPosition,
        planned,
        done,
        pending,
        coveragePct,
        firstVisitAtIST: toIST(firstVisitAt),
        lastVisitAtIST: toIST(lastVisitAt),
        isActiveInRange: done > 0,
      });

      if (todayDone.size === 0) {
        noVisitToday.push({
          code: userCode,
          name: userName,
          position: userPosition,
          plannedToday: todayPlanned.size,
          lastVisitAtIST: toIST(lastVisitAt),
        });
      }

      if (recentDone.size === 0) {
        noVisitRecent.push({
          code: userCode,
          name: userName,
          position: userPosition,
          daysWithoutVisit: safeRecentDays,
          lastVisitAtIST: toIST(lastVisitAt),
        });
      }

      if (!positionAgg.has(userPosition)) {
        positionAgg.set(userPosition, {
          position: userPosition || "unknown",
          users: 0,
          activeUsers: 0,
          planned: 0,
          done: 0,
        });
      }
      const posNode = positionAgg.get(userPosition);
      posNode.users += 1;
      posNode.activeUsers += done > 0 ? 1 : 0;
      posNode.planned += planned;
      posNode.done += done;
    }

    for (const doc of rangeSchedules) {
      const ownerCode = String(doc?.code || "").trim();
      for (const dealer of doc.schedule || []) {
        const dealerCode = String(dealer?.code || "").trim();
        if (!dealerCode) continue;

        const lat = parseLatLong(dealer?.latitude ?? dealer?.lat);
        const lng = parseLatLong(dealer?.longitude ?? dealer?.long);
        if (lat === null || lng === null) continue;

        if (!pinAgg.has(dealerCode)) {
          pinAgg.set(dealerCode, {
            code: dealerCode,
            name: dealer?.name || "",
            lat,
            lng,
            zone: dealer?.zone || "",
            district: dealer?.district || "",
            taluka: dealer?.taluka || "",
            town: dealer?.town || "",
            plannedBy: new Set(),
            visitedBy: new Set(),
            visitCount: 0,
            latestVisitedAt: null,
            visitLogs: [],
          });
        }

        const pin = pinAgg.get(dealerCode);
        pin.plannedBy.add(ownerCode);
        if (normalize(dealer?.status) === "done") {
          pin.visitedBy.add(ownerCode);
          pin.visitCount += 1;
          const markedAt = dealer?.markedDoneAt ? new Date(dealer.markedDoneAt) : null;
          if (markedAt && (!pin.latestVisitedAt || markedAt > pin.latestVisitedAt)) {
            pin.latestVisitedAt = markedAt;
          }
          pin.visitLogs.push({
            byCode: ownerCode,
            byName: userNameByCode.get(ownerCode) || ownerCode,
            visitedAt: markedAt || null,
          });
        }
      }
    }

    const rawPins = [...pinAgg.values()].map((pin) => ({
      code: pin.code,
      name: pin.name,
      lat: pin.lat,
      lng: pin.lng,
      zone: pin.zone,
      district: pin.district,
      taluka: pin.taluka,
      town: pin.town,
      status: pin.visitedBy.size > 0 ? "visited" : "not_visited",
      visitCount: pin.visitCount,
      assignedUsers: [...pin.plannedBy],
      visitedUsers: [...pin.visitedBy],
      visitedByNames: [...pin.visitedBy]
        .map((code) => userNameByCode.get(code) || code)
        .filter(Boolean),
      latestVisitedAtIST: toIST(pin.latestVisitedAt),
      visitLogs: (pin.visitLogs || [])
        .sort((a, b) => {
          const atA = a?.visitedAt ? new Date(a.visitedAt).getTime() : 0;
          const atB = b?.visitedAt ? new Date(b.visitedAt).getTime() : 0;
          return atB - atA;
        })
        .slice(0, 8)
        .map((log) => ({
          byCode: log.byCode,
          byName: log.byName,
          visitedAtIST: toIST(log.visitedAt),
        })),
    }));

    const dealerCodes = rawPins.map((p) => p.code).filter(Boolean);
    const [dealerUsers, dealerHierarchyEntries] = await Promise.all([
      dealerCodes.length
        ? User.find(
            { code: { $in: dealerCodes } },
            {
              code: 1,
              name: 1,
              category: 1,
              town: 1,
              zone: 1,
              top_outlet: 1,
              position: 1,
              role: 1,
              _id: 0,
            }
          ).lean()
        : Promise.resolve([]),
      dealerCodes.length
        ? HierarchyEntries.find(
            {
              hierarchy_name: DEFAULT_FLOW_NAME,
              dealer: { $in: dealerCodes },
            },
            { dealer: 1, mdd: 1, _id: 0 }
          ).lean()
        : Promise.resolve([]),
    ]);

    const dealerByCode = new Map(
      dealerUsers.map((d) => [String(d.code || "").trim(), d])
    );

    const mddCodeByDealer = new Map();
    for (const row of dealerHierarchyEntries) {
      const dealerCode = String(row?.dealer || "").trim();
      const mddCode = String(row?.mdd || "").trim();
      if (!dealerCode || !mddCode) continue;
      if (!mddCodeByDealer.has(dealerCode)) {
        mddCodeByDealer.set(dealerCode, mddCode);
      }
    }

    const mddCodes = [...new Set([...mddCodeByDealer.values()].filter(Boolean))];
    const mddUsers = mddCodes.length
      ? await User.find(
          { code: { $in: mddCodes } },
          { code: 1, name: 1, _id: 0 }
        ).lean()
      : [];
    const mddNameByCode = new Map(
      mddUsers.map((m) => [String(m.code || "").trim(), String(m.name || "").trim()])
    );

    const pins = rawPins.map((pin) => {
      const dealer = dealerByCode.get(pin.code) || {};
      const mddCode = mddCodeByDealer.get(pin.code) || "";
      const mddName = mddCode ? (mddNameByCode.get(mddCode) || "") : "";
      const dealerTown = String(dealer?.town || "").trim();
      const dealerZone = String(dealer?.zone || "").trim();
      const dealerCategory = String(dealer?.category || "").trim();
      const isTopDealer = dealer?.top_outlet === true;

      return {
        ...pin,
        dealerCode: pin.code,
        dealerName: String(dealer?.name || pin.name || "").trim(),
        mddCode,
        mddName,
        topDealer: isTopDealer,
        category: dealerCategory || null,
        town: dealerTown || pin.town || null,
        zone: dealerZone || pin.zone || null,
      };
    });

    const visitedPinCount = pins.filter((p) => p.status === "visited").length;
    const notVisitedPinCount = Math.max(pins.length - visitedPinCount, 0);

    let centerLat = 26.9124;
    let centerLng = 75.7873;
    if (pins.length) {
      centerLat = pins.reduce((sum, p) => sum + p.lat, 0) / pins.length;
      centerLng = pins.reduce((sum, p) => sum + p.lng, 0) / pins.length;
    }

    const positionPerformance = [...positionAgg.values()]
      .map((node) => ({
        ...node,
        pending: Math.max(node.planned - node.done, 0),
        coveragePct: node.planned
          ? Number(((node.done / node.planned) * 100).toFixed(1))
          : 0,
      }))
      .sort((a, b) => {
        if (a.position < b.position) return -1;
        if (a.position > b.position) return 1;
        return 0;
      });

    employeePerformance.sort((a, b) => b.coveragePct - a.coveragePct);

    const totalPending = Math.max(totalPlanned - totalDone, 0);
    const coveragePct = totalPlanned
      ? Number(((totalDone / totalPlanned) * 100).toFixed(1))
      : 0;

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          employees: employeePerformance.length,
          planned: totalPlanned,
          done: totalDone,
          pending: totalPending,
          coveragePct,
          activeEmployees,
          notStartedToday,
          noVisitRecently: noVisitRecent.length,
          mapVisited: visitedPinCount,
          mapNotVisited: notVisitedPinCount,
        },
        positionPerformance,
        employeePerformance,
        noVisitToday,
        noVisitRecent,
        map: {
          center: {
            lat: Number(centerLat.toFixed(6)),
            lng: Number(centerLng.toFixed(6)),
          },
          pins,
          counts: {
            total: pins.length,
            visited: visitedPinCount,
            notVisited: notVisitedPinCount,
          },
        },
      },
      meta: {
        startDate,
        endDate,
        recentDays: safeRecentDays,
        topOutlet: topOnly,
        scope: {
          role: scope.role,
          position: scope.position,
          privileged: scope.isPrivileged,
        },
      },
    });
  } catch (error) {
    console.error("Error in getMarketCoverageDashboardAnalytics:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.getMarketCoverageDashboardDropdown = async (req, res) => {
  try {
    const hierarchy = await getHierarchy();
    const scope = await getScopeForUser(req.user, hierarchy);
    if (!scope.isPrivileged && DASHBOARD_BLOCKED_POSITIONS.has(scope.position)) {
      return res.status(403).json({
        success: false,
        message: "Dashboard is not available for this position. Use timeline view.",
      });
    }
    const users = await getUsersByHierarchyScope(scope);

    const districts = new Set();
    const talukas = new Set();
    const zones = new Set();
    const towns = new Set();
    const positions = new Set();

    for (const user of users) {
      const district = String(user?.district || "").trim();
      const taluka = String(user?.taluka || "").trim();
      const zone = String(user?.zone || "").trim();
      const town = String(user?.town || "").trim();
      const position = normalize(user?.position);

      if (district && district.toUpperCase() !== "NA") districts.add(district);
      if (taluka && taluka.toUpperCase() !== "NA") talukas.add(taluka);
      if (zone && zone.toUpperCase() !== "NA") zones.add(zone);
      if (town && town.toUpperCase() !== "NA") towns.add(town);
      if (["dealer", "mdd"].includes(position)) positions.add(position);
    }

    return res.status(200).json({
      success: true,
      status: ["done", "pending"],
      ["dealer/mdd"]: positions.size ? [...positions].sort() : ["dealer", "mdd"],
      taluka: [...talukas].sort(),
      district: [...districts].sort(),
      zone: [...zones].sort(),
      town: [...towns].sort(),
    });
  } catch (error) {
    console.error("Error in getMarketCoverageDashboardDropdown:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.getMarketCoverageDashboardReport = async (req, res) => {
  try {
    let {
      startDate,
      endDate,
      status = [],
      zone = [],
      district = [],
      taluka = [],
      town = [],
      code,
    } = req.body || {};

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "startDate and endDate are required",
      });
    }

    const hierarchy = await getHierarchy();
    const scope = await getScopeForUser(req.user, hierarchy);

    const targetCode = String(
      scope.isPrivileged ? (code || "") : (code || scope.code || "")
    ).trim();

    if (!targetCode) {
      return res.status(400).json({
        success: false,
        message: "Employee code is required",
      });
    }

    if (!scope.isPrivileged && !scope.allowedCodes.includes(targetCode)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this employee's data",
      });
    }

    const start = moment.tz(startDate, "Asia/Kolkata").startOf("day").toDate();
    const end = moment.tz(endDate, "Asia/Kolkata").endOf("day").toDate();

    const schedules = await WeeklyBeatMappingSchedule.find({
      code: targetCode,
      startDate: { $lte: end },
      endDate: { $gte: start },
    }).lean();

    const dealerMap = {};
    for (const entry of schedules) {
      for (const dealer of entry.schedule || []) {
        const dealerCode = String(dealer?.code || "").trim();
        if (!dealerCode) continue;

        if (!dealerMap[dealerCode]) {
          dealerMap[dealerCode] = {
            code: dealerCode,
            name: dealer?.name || "",
            zone: dealer?.zone || "Unknown",
            district: dealer?.district || "Unknown",
            taluka: dealer?.taluka || "Unknown",
            town: dealer?.town || "Unknown",
            position: dealer?.position || "dealer",
            doneCount: 0,
            latitude: parseLatLong(dealer?.latitude ?? dealer?.lat),
            longitude: parseLatLong(dealer?.longitude ?? dealer?.long),
            latestMarkedDoneAt: null,
          };
        }

        if (normalize(dealer?.status) === "done") {
          dealerMap[dealerCode].doneCount += 1;
          const markedAt = dealer?.markedDoneAt ? new Date(dealer.markedDoneAt) : null;
          if (
            markedAt &&
            (!dealerMap[dealerCode].latestMarkedDoneAt ||
              markedAt > dealerMap[dealerCode].latestMarkedDoneAt)
          ) {
            dealerMap[dealerCode].latestMarkedDoneAt = markedAt;
          }
        }
      }
    }

    const result = Object.values(dealerMap).map((d) => {
      const isDone = d.doneCount > 0;
      return {
        code: d.code,
        name: d.name,
        zone: d.zone,
        district: d.district,
        taluka: d.taluka,
        town: d.town,
        position: d.position,
        status: isDone ? "done" : "pending",
        visits: isDone ? d.doneCount : 0,
        latitude: d.latitude,
        longitude: d.longitude,
        markedDoneAtIST: isDone ? toIST(d.latestMarkedDoneAt) : null,
      };
    });

    const normalizedStatus = toUniqueStrings(status);
    const normalizedZone = toUniqueStrings(zone);
    const normalizedDistrict = toUniqueStrings(district);
    const normalizedTaluka = toUniqueStrings(taluka);
    const normalizedTown = toUniqueStrings(town);

    const filtered = result.filter((entry) => {
      const matchStatus =
        !normalizedStatus.length || normalizedStatus.includes(normalize(entry.status));
      const matchZone =
        !normalizedZone.length || normalizedZone.includes(normalize(entry.zone));
      const matchDistrict =
        !normalizedDistrict.length || normalizedDistrict.includes(normalize(entry.district));
      const matchTaluka =
        !normalizedTaluka.length || normalizedTaluka.includes(normalize(entry.taluka));
      const matchTown =
        !normalizedTown.length || normalizedTown.includes(normalize(entry.town));

      return matchStatus && matchZone && matchDistrict && matchTaluka && matchTown;
    });

    const total = filtered.length;
    const done = filtered.filter((d) => normalize(d.status) === "done").length;
    const pending = Math.max(total - done, 0);

    const monthStart = moment(start).tz("Asia/Kolkata").startOf("month").startOf("day").toDate();
    const monthEnd = moment(start).tz("Asia/Kolkata").endOf("month").endOf("day").toDate();

    const overallSchedules = await WeeklyBeatMappingSchedule.find({
      code: targetCode,
      startDate: { $lte: monthEnd },
      endDate: { $gte: monthStart },
    }).lean();

    const overallDealerMap = {};
    for (const entry of overallSchedules) {
      for (const dealer of entry.schedule || []) {
        const dealerCode = String(dealer?.code || "").trim();
        if (!dealerCode) continue;
        if (!overallDealerMap[dealerCode]) {
          overallDealerMap[dealerCode] = { doneCount: 0 };
        }
        if (normalize(dealer?.status) === "done") {
          overallDealerMap[dealerCode].doneCount += 1;
        }
      }
    }

    const ovTotal = Object.keys(overallDealerMap).length;
    const ovDone = Object.values(overallDealerMap).filter((d) => d.doneCount > 0).length;
    const ovPending = Math.max(ovTotal - ovDone, 0);

    return res.status(200).json({
      success: true,
      total,
      done,
      pending,
      ovTotal,
      ovDone,
      ovPending,
      data: filtered,
    });
  } catch (error) {
    console.error("Error in getMarketCoverageDashboardReport:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.getMarketCoverageUserTimeline = async (req, res) => {
  try {
    let { code, startDate, endDate, status = "all", topOutlet = false } = req.body || {};

    if (!code || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "code, startDate and endDate are required",
      });
    }

    const hierarchy = await getHierarchy();
    const scope = await getScopeForUser(req.user, hierarchy);
    const targetCode = String(code).trim();

    if (!scope.isPrivileged && !scope.allowedCodes.includes(targetCode)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this employee timeline",
      });
    }

    const start = moment.tz(startDate, "Asia/Kolkata").startOf("day").toDate();
    const end = moment.tz(endDate, "Asia/Kolkata").endOf("day").toDate();
    const normalizedStatus = normalize(status || "all");

    const [employee, schedules] = await Promise.all([
      User.findOne({ code: targetCode }, { code: 1, name: 1, position: 1, _id: 0 }).lean(),
      WeeklyBeatMappingSchedule.find({
        code: targetCode,
        startDate: { $lte: end },
        endDate: { $gte: start },
      }).lean(),
    ]);
    const topOnly = topOutlet === true;
    let allowedTopDealerCodes = null;
    if (topOnly) {
      const dealerCodesInRange = [...collectDealerCodesFromSchedules(schedules)];
      if (dealerCodesInRange.length) {
        const topDealers = await User.find(
          { code: { $in: dealerCodesInRange }, top_outlet: true },
          { code: 1, _id: 0 }
        ).lean();
        allowedTopDealerCodes = new Set(
          topDealers.map((d) => String(d.code || "").trim()).filter(Boolean)
        );
      } else {
        allowedTopDealerCodes = new Set();
      }
    }

    const plannedByCode = new Map();
    const visitedByCode = new Map();
    const dayBuckets = new Map();

    for (const doc of schedules) {
      const dayLabel = moment(doc.startDate).tz("Asia/Kolkata").format("YYYY-MM-DD");

      if (!dayBuckets.has(dayLabel)) {
        dayBuckets.set(dayLabel, []);
      }

      for (const dealer of doc.schedule || []) {
        const dealerCode = String(dealer?.code || "").trim();
        if (!dealerCode) continue;
        if (topOnly && !allowedTopDealerCodes?.has(dealerCode)) continue;

        const eventStatus = normalize(dealer?.status) === "done" ? "done" : "pending";

        if (!plannedByCode.has(dealerCode)) {
          plannedByCode.set(dealerCode, {
            code: dealerCode,
            name: dealer?.name || "",
            town: dealer?.town || "",
            zone: dealer?.zone || "",
            category: null,
            topDealer: false,
          });
        }

        const visitedAt = dealer?.markedDoneAt ? new Date(dealer.markedDoneAt) : null;
        if (eventStatus === "done") {
          if (!visitedByCode.has(dealerCode)) {
            visitedByCode.set(dealerCode, {
              count: 0,
              lastVisitedAt: null,
            });
          }
          const node = visitedByCode.get(dealerCode);
          node.count += 1;
          if (visitedAt && (!node.lastVisitedAt || visitedAt > node.lastVisitedAt)) {
            node.lastVisitedAt = visitedAt;
          }
        }

        if (normalizedStatus !== "all" && normalizedStatus !== eventStatus) {
          continue;
        }

        dayBuckets.get(dayLabel).push({
          dealerCode,
          dealerName: dealer?.name || "",
          status: eventStatus,
          town: dealer?.town || "",
          zone: dealer?.zone || "",
          latitude: parseLatLong(dealer?.latitude ?? dealer?.lat),
          longitude: parseLatLong(dealer?.longitude ?? dealer?.long),
          visitedAtIST: toIST(visitedAt),
          sortAt: visitedAt || doc.startDate,
          sortTs: (visitedAt || doc.startDate)?.getTime?.() || 0,
        });
      }
    }

    const dealerCodes = [...plannedByCode.keys()];
    const [dealerUsers, hierarchyEntries] = await Promise.all([
      dealerCodes.length
        ? User.find(
            { code: { $in: dealerCodes } },
            { code: 1, category: 1, top_outlet: 1, town: 1, zone: 1, _id: 0 }
          ).lean()
        : Promise.resolve([]),
      dealerCodes.length
        ? HierarchyEntries.find(
            { hierarchy_name: DEFAULT_FLOW_NAME, dealer: { $in: dealerCodes } },
            { dealer: 1, mdd: 1, _id: 0 }
          ).lean()
        : Promise.resolve([]),
    ]);

    const dealerUserByCode = new Map(dealerUsers.map((d) => [String(d.code || "").trim(), d]));
    const mddByDealer = new Map();
    for (const row of hierarchyEntries) {
      const dCode = String(row?.dealer || "").trim();
      const mddCode = String(row?.mdd || "").trim();
      if (dCode && mddCode && !mddByDealer.has(dCode)) mddByDealer.set(dCode, mddCode);
    }

    const mddCodes = [...new Set([...mddByDealer.values()].filter(Boolean))];
    const mddUsers = mddCodes.length
      ? await User.find({ code: { $in: mddCodes } }, { code: 1, name: 1, _id: 0 }).lean()
      : [];
    const mddNameByCode = new Map(
      mddUsers.map((m) => [String(m.code || "").trim(), String(m.name || "").trim()])
    );

    for (const [dealerCode, dealer] of plannedByCode.entries()) {
      const u = dealerUserByCode.get(dealerCode) || {};
      dealer.category = u?.category || null;
      dealer.topDealer = u?.top_outlet === true;
      dealer.town = u?.town || dealer.town || "";
      dealer.zone = u?.zone || dealer.zone || "";
      dealer.mddCode = mddByDealer.get(dealerCode) || "";
      dealer.mddName = dealer.mddCode ? (mddNameByCode.get(dealer.mddCode) || "") : "";
    }

    const timelineDays = [...dayBuckets.entries()]
      .map(([date, events]) => ({
        date,
        dayLabel: moment.tz(date, "Asia/Kolkata").format("ddd, DD MMM"),
        events: (() => {
          const sorted = events
            .sort((a, b) => (a.sortTs || 0) - (b.sortTs || 0));

          return sorted.map((e, idx) => {
            const dealer = plannedByCode.get(e.dealerCode) || {};
            const prev = idx > 0 ? sorted[idx - 1] : null;
            const gapMinutes = prev
              ? Math.max(
                  0,
                  Math.round(((e.sortTs || 0) - (prev.sortTs || 0)) / 60000)
                )
              : null;
            return {
              dealerCode: e.dealerCode,
              dealerName: e.dealerName,
              status: e.status,
              town: dealer.town || e.town || "",
              zone: dealer.zone || e.zone || "",
              category: dealer.category || null,
              topDealer: dealer.topDealer === true,
              mddCode: dealer.mddCode || "",
              mddName: dealer.mddName || "",
              latitude: e.latitude,
              longitude: e.longitude,
              visitedAtIST: e.visitedAtIST,
              dealerTotalVisits: (visitedByCode.get(e.dealerCode)?.count || 0),
              visitOrder: idx + 1,
              isFirstVisit: idx == 0,
              isLastVisit: idx == (sorted.length - 1),
              gapFromPrevMinutes: gapMinutes,
            };
          });
        })(),
      }))
      .sort((a, b) => (a.date > b.date ? 1 : -1));

    const untouchedDealers = [...plannedByCode.values()]
      .filter((dealer) => !visitedByCode.has(dealer.code))
      .map((dealer) => ({
        code: dealer.code,
        name: dealer.name,
        mddCode: dealer.mddCode || "",
        mddName: dealer.mddName || "",
        topDealer: dealer.topDealer === true,
        category: dealer.category || null,
        town: dealer.town || null,
        zone: dealer.zone || null,
      }));

    const dealerVisitCounts = [...plannedByCode.values()]
      .map((dealer) => {
        const visitMeta = visitedByCode.get(dealer.code) || {
          count: 0,
          lastVisitedAt: null,
        };
        return {
          code: dealer.code,
          name: dealer.name,
          visits: visitMeta.count || 0,
          lastVisitedAtIST: toIST(visitMeta.lastVisitedAt),
          mddCode: dealer.mddCode || "",
          mddName: dealer.mddName || "",
          topDealer: dealer.topDealer === true,
          category: dealer.category || null,
          town: dealer.town || null,
          zone: dealer.zone || null,
        };
      })
      .sort((a, b) => b.visits - a.visits);

    const visitedDealers = visitedByCode.size;
    const plannedDealers = plannedByCode.size;
    const untouchedCount = Math.max(plannedDealers - visitedDealers, 0);
    const coveragePct = plannedDealers
      ? Number(((visitedDealers / plannedDealers) * 100).toFixed(1))
      : 0;

    const allVisitedAt = [...visitedByCode.values()]
      .map((v) => v.lastVisitedAt)
      .filter(Boolean)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    return res.status(200).json({
      success: true,
      data: {
        user: {
          code: targetCode,
          name: employee?.name || "",
          position: normalize(employee?.position),
        },
        summary: {
          plannedDealers,
          visitedDealers,
          untouchedDealers: untouchedCount,
          coveragePct,
          totalVisitEvents: [...visitedByCode.values()].reduce((s, x) => s + x.count, 0),
          firstVisitAtIST: toIST(allVisitedAt[0] || null),
          lastVisitAtIST: toIST(allVisitedAt[allVisitedAt.length - 1] || null),
        },
        timelineDays,
        untouchedDealers,
        dealerVisitCounts,
      },
      meta: {
        startDate,
        endDate,
        status: normalizedStatus,
        topOutlet: topOnly,
      },
    });
  } catch (error) {
    console.error("Error in getMarketCoverageUserTimeline:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
