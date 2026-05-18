const moment = require("moment-timezone");

const ActivationData = require("../../model/ActivationData");
const TertiaryData = require("../../model/TertiaryData");
const SecondaryData = require("../../model/SecondaryData");
const SalesData = require("../../model/SalesData");
const WeeklyBeatMappingSchedule = require("../../model/WeeklyBeatMappingSchedule");
const ExtractionRecord = require("../../model/ExtractionRecord");
const Attendance = require("../../model/Attendance");
const User = require("../../model/User");
const Firm = require("../../model/Firm");
const MetaData = require("../../model/MetaData");
const DealerHierarchy = require("../../model/DealerHierarchy");

const { resolveScope, resolveSubordinatePositions } = require("../../services/resolvers");

const IST = "Asia/Kolkata";
const SALES_TYPES_SELL_IN = ["Sell In", "Sell Thru2"];
const SALES_TYPES_SELL_OUT = ["Sell Out"];
const BRAND_ORDER = [
  "Samsung",
  "Vivo",
  "Oppo",
  "Xiaomi",
  "Apple",
  "OnePlus",
  "Realme",
  "Motorola",
  "Others",
];

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeString(value).toLowerCase();
}

function uniqueStrings(values = []) {
  return [...new Set(values.map(normalizeString).filter(Boolean))];
}

function buildPositionQuery(values = []) {
  const normalized = uniqueStrings(values);
  if (!normalized.length) return null;

  const variants = uniqueStrings(
    normalized.flatMap((v) => [v, v.toLowerCase(), v.toUpperCase()])
  );
  return { $in: variants };
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(value) {
  return Math.round((safeNumber(value) + Number.EPSILON) * 100) / 100;
}

function pct(curr, prev) {
  const c = safeNumber(curr);
  const p = safeNumber(prev);
  if (!p) return 0;
  return round2(((c - p) / p) * 100);
}

function parseBodyDateRange({ startDate, endDate }) {
  if (!startDate || !endDate) {
    const now = moment.tz(IST);
    const defaultStart = now.clone().startOf("month");
    const defaultEnd = now.clone().endOf("day");

    return {
      startMoment: defaultStart,
      endMoment: defaultEnd,
      startDate: defaultStart.format("YYYY-MM-DD"),
      endDate: defaultEnd.format("YYYY-MM-DD"),
    };
  }

  const startMoment = moment.tz(String(startDate), "YYYY-MM-DD", true, IST).startOf("day");
  const endMoment = moment.tz(String(endDate), "YYYY-MM-DD", true, IST).endOf("day");

  if (!startMoment.isValid() || !endMoment.isValid()) {
    throw new Error("startDate and endDate must be in YYYY-MM-DD format");
  }

  if (startMoment.isAfter(endMoment)) {
    throw new Error("startDate cannot be after endDate");
  }

  return {
    startMoment,
    endMoment,
    startDate: startMoment.format("YYYY-MM-DD"),
    endDate: endMoment.format("YYYY-MM-DD"),
  };
}

function parseRawDateToMoment(dateValue) {
  if (!dateValue) return null;

  if (dateValue instanceof Date) {
    const m = moment(dateValue).tz(IST);
    return m.isValid() ? m : null;
  }

  const raw = String(dateValue).trim();
  if (!raw) return null;

  const formats = ["M/D/YY", "M/D/YYYY", "MM/DD/YY", "MM/DD/YYYY", "YYYY-MM-DD"];
  for (const fmt of formats) {
    const m = moment.tz(raw, fmt, true, IST);
    if (m.isValid()) return m;
  }

  const fallback = moment.tz(raw, IST);
  return fallback.isValid() ? fallback : null;
}

function bucketLabel(momentObj, granularity) {
  if (!momentObj) return null;

  if (granularity === "day") return momentObj.format("YYYY-MM-DD");
  if (granularity === "week") return momentObj.clone().startOf("isoWeek").format("YYYY-[W]WW");
  if (granularity === "month") return momentObj.format("YYYY-MM");
  if (granularity === "year") return momentObj.format("YYYY");
  return momentObj.format("YYYY-MM-DD");
}

function sortBucketLabels(labels = [], granularity = "day") {
  return [...labels].sort((a, b) => {
    if (granularity === "week") {
      const ma = moment.tz(a, "YYYY-[W]WW", true, IST);
      const mb = moment.tz(b, "YYYY-[W]WW", true, IST);
      return ma.valueOf() - mb.valueOf();
    }

    if (granularity === "month") {
      const ma = moment.tz(a, "YYYY-MM", true, IST);
      const mb = moment.tz(b, "YYYY-MM", true, IST);
      return ma.valueOf() - mb.valueOf();
    }

    if (granularity === "year") {
      return Number(a) - Number(b);
    }

    return a.localeCompare(b);
  });
}

function initStatusBucket(totalEligible = 0) {
  return {
    totalEligible,
    present: 0,
    absent: totalEligible,
    halfDay: 0,
    leave: 0,
    pending: 0,
    notPunchedOut: 0,
    hoursTotal: 0,
    hoursCount: 0,
  };
}

function applyAttendanceStatus(bucket, record) {
  if (!bucket || !record) return;

  const status = normalizeString(record.status || "Pending");

  bucket.absent = Math.max(bucket.absent - 1, 0);

  if (status === "Present") bucket.present += 1;
  else if (status === "Half Day") bucket.halfDay += 1;
  else if (status === "Leave") bucket.leave += 1;
  else if (status === "Absent") bucket.absent += 1;
  else bucket.pending += 1;

  if (record.punchIn && !record.punchOut) {
    bucket.notPunchedOut += 1;
  }

  const hrs = safeNumber(record.hoursWorked);
  if (hrs > 0) {
    bucket.hoursTotal += hrs;
    bucket.hoursCount += 1;
  }
}

function statusBucketToSummary(bucket) {
  const avgHoursWorked = bucket.hoursCount > 0 ? round2(bucket.hoursTotal / bucket.hoursCount) : 0;

  return {
    totalEligible: bucket.totalEligible,
    present: bucket.present,
    absent: bucket.absent,
    halfDay: bucket.halfDay,
    leave: bucket.leave,
    pending: bucket.pending,
    notPunchedOut: bucket.notPunchedOut,
    avgHoursWorked,
  };
}

async function resolveDashboardScope({
  user,
  flow_name = "default_sales_flow",
  subordinate_filters = {},
  dealer_filters = {},
}) {
  const scoped = await resolveScope({
    user,
    flow_name,
    subordinate_filters,
    dealer_filters,
    exclude_positions: [],
  });

  const dealerCodes = uniqueStrings(scoped?.dealer || []);

  let mddCodes = [];
  if (dealerCodes.length) {
    const rows = await DealerHierarchy.find(
      { dealer_code: { $in: dealerCodes } },
      { mdd_code: 1, beat_code: 1 }
    ).lean();

    mddCodes = uniqueStrings(
      rows.flatMap((row) => [row?.mdd_code, row?.beat_code]).filter(Boolean)
    );
  }

  const actorCodes = uniqueStrings(
    Object.entries(scoped || {})
      .filter(([position]) => position !== "dealer")
      .flatMap(([, values]) => toArray(values))
  );

  return {
    flow_name,
    subordinate_filters,
    dealer_filters,
    scoped,
    dealerCodes,
    mddCodes,
    actorCodes,
  };
}

function getAdminBypass(user, subordinate_filters = {}, dealer_filters = {}) {
  const role = normalizeLower(user?.role);
  const isAdmin = ["admin", "super_admin", "hr"].includes(role);

  const hasSubordinate = Object.values(subordinate_filters || {}).some((v) => toArray(v).length > 0);
  const hasDealerFilters = Object.values(dealer_filters || {}).some((v) => toArray(v).length > 0);

  return isAdmin && !hasSubordinate && !hasDealerFilters;
}

async function fetchSalesCards({
  start,
  end,
  dealerCodes,
  metric,
  allowAll,
}) {
  const previousStart = moment(start).subtract(1, "month").toDate();
  const previousEnd = moment(end).subtract(1, "month").toDate();

  const buyerQuery = allowAll
    ? {}
    : { buyer_code: { $in: dealerCodes.length ? dealerCodes : ["__NO_CODES__"] } };

  const fetchTotal = async (salesTypes, rangeStart, rangeEnd) => {
    const rows = await SalesData.aggregate([
      {
        $match: {
          ...buyerQuery,
          sales_type: { $in: salesTypes },
          date: { $gte: rangeStart, $lte: rangeEnd },
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $toDouble: `$${metric === "value" ? "total_amount" : "quantity"}`,
            },
          },
        },
      },
    ]);

    return safeNumber(rows?.[0]?.total);
  };

  const [mtdSellIn, lmtdSellIn, mtdSellOut, lmtdSellOut] = await Promise.all([
    fetchTotal(SALES_TYPES_SELL_IN, start, end),
    fetchTotal(SALES_TYPES_SELL_IN, previousStart, previousEnd),
    fetchTotal(SALES_TYPES_SELL_OUT, start, end),
    fetchTotal(SALES_TYPES_SELL_OUT, previousStart, previousEnd),
  ]);

  return {
    mtdSellIn,
    lmtdSellIn,
    mtdSellOut,
    lmtdSellOut,
    sellInGrowthPct: pct(mtdSellIn, lmtdSellIn),
    sellOutGrowthPct: pct(mtdSellOut, lmtdSellOut),
  };
}

async function fetchSalesTrendCharts({
  startMoment,
  endMoment,
  dealerCodes,
  mddCodes,
  metric,
  allowAll,
}) {
  const yearMonths = [];
  const cursor = startMoment.clone().startOf("month");
  const endMonth = endMoment.clone().endOf("month");

  while (cursor.isSameOrBefore(endMonth)) {
    yearMonths.push(cursor.format("YYYY-MM"));
    cursor.add(1, "month");
  }

  const activationMatch = {
    year_month: { $in: yearMonths },
    ...(allowAll ? {} : { tertiary_buyer_code: { $in: dealerCodes.length ? dealerCodes : ["__NO_CODES__"] } }),
  };

  const tertiaryMatch = {
    year_month: { $in: yearMonths },
    ...(allowAll ? {} : { dealer_code: { $in: dealerCodes.length ? dealerCodes : ["__NO_CODES__"] } }),
  };

  const secondaryMatch = {
    year_month: { $in: yearMonths },
    ...(allowAll ? {} : { mdd_code: { $in: mddCodes.length ? mddCodes : ["__NO_CODES__"] } }),
  };

  const [activationRows, tertiaryRows, secondaryRows] = await Promise.all([
    ActivationData.find(activationMatch).lean(),
    TertiaryData.find(tertiaryMatch).lean(),
    SecondaryData.find(secondaryMatch).lean(),
  ]);

  const inRange = (m) => m && m.isSameOrAfter(startMoment) && m.isSameOrBefore(endMoment);

  const granularityList = ["day", "week", "month", "year"];
  const seriesMaps = Object.fromEntries(
    granularityList.map((g) => [
      g,
      {
        activation: new Map(),
        tertiary: new Map(),
        secondary: new Map(),
      },
    ])
  );

  function addToMap(targetMap, label, value) {
    targetMap.set(label, safeNumber(targetMap.get(label)) + safeNumber(value));
  }

  for (const row of activationRows) {
    const m = parseRawDateToMoment(row.activation_date_raw);
    if (!inRange(m)) continue;

    const value = metric === "value" ? safeNumber(row.val) : safeNumber(row.qty);
    for (const granularity of granularityList) {
      const label = bucketLabel(m, granularity);
      addToMap(seriesMaps[granularity].activation, label, value);
    }
  }

  for (const row of tertiaryRows) {
    const m = parseRawDateToMoment(row.invoice_date_raw);
    if (!inRange(m)) continue;

    const value = metric === "value" ? safeNumber(row.net_value) : safeNumber(row.qty);
    for (const granularity of granularityList) {
      const label = bucketLabel(m, granularity);
      addToMap(seriesMaps[granularity].tertiary, label, value);
    }
  }

  for (const row of secondaryRows) {
    const m = parseRawDateToMoment(row.invoice_date_raw);
    if (!inRange(m)) continue;

    const value = metric === "value" ? safeNumber(row.net_value) : safeNumber(row.qty);
    for (const granularity of granularityList) {
      const label = bucketLabel(m, granularity);
      addToMap(seriesMaps[granularity].secondary, label, value);
    }
  }

  function buildSeries(granularity) {
    const activationMap = seriesMaps[granularity].activation;
    const tertiaryMap = seriesMaps[granularity].tertiary;
    const secondaryMap = seriesMaps[granularity].secondary;

    const labels = sortBucketLabels(
      uniqueStrings([
        ...activationMap.keys(),
        ...tertiaryMap.keys(),
        ...secondaryMap.keys(),
      ]),
      granularity
    );

    return labels.map((label) => {
      const activation = safeNumber(activationMap.get(label));
      const tertiary = safeNumber(tertiaryMap.get(label));
      const secondary = safeNumber(secondaryMap.get(label));

      return {
        period: label,
        activation,
        tertiary,
        secondary,
        total: round2(activation + tertiary + secondary),
      };
    });
  }

  return {
    daily: buildSeries("day"),
    weekly: buildSeries("week"),
    monthly: buildSeries("month"),
    yearly: buildSeries("year"),
  };
}

async function fetchSalesRegionHeatmap({
  startMoment,
  endMoment,
  dealerCodes,
  metric,
  allowAll,
}) {
  const yearMonths = [];
  const cursor = startMoment.clone().startOf("month");
  const endMonth = endMoment.clone().endOf("month");

  while (cursor.isSameOrBefore(endMonth)) {
    yearMonths.push(cursor.format("YYYY-MM"));
    cursor.add(1, "month");
  }

  const activationMatch = {
    year_month: { $in: yearMonths },
    ...(allowAll ? {} : { tertiary_buyer_code: { $in: dealerCodes.length ? dealerCodes : ["__NO_CODES__"] } }),
  };

  const tertiaryMatch = {
    year_month: { $in: yearMonths },
    ...(allowAll ? {} : { dealer_code: { $in: dealerCodes.length ? dealerCodes : ["__NO_CODES__"] } }),
  };

  const [activationRows, tertiaryRows] = await Promise.all([
    ActivationData.find(activationMatch).lean(),
    TertiaryData.find(tertiaryMatch).lean(),
  ]);

  const dealerUniverse = uniqueStrings([
    ...activationRows.map((r) => normalizeString(r.tertiary_buyer_code)),
    ...tertiaryRows.map((r) => normalizeString(r.dealer_code)),
  ]);

  const dealerUsers = dealerUniverse.length
    ? await User.find(
        { code: { $in: dealerUniverse } },
        { code: 1, district: 1, zone: 1, town: 1, latitude: 1, longitude: 1 }
      ).lean()
    : [];

  const dealerMetaMap = new Map(
    dealerUsers.map((u) => [normalizeString(u.code), u])
  );

  const inRange = (m) => m && m.isSameOrAfter(startMoment) && m.isSameOrBefore(endMoment);

  const districtMap = new Map();

  const getDistrictBucket = (dealerCode) => {
    const meta = dealerMetaMap.get(normalizeString(dealerCode)) || {};
    const district = normalizeString(meta.district) || "Unmapped";

    if (!districtMap.has(district)) {
      districtMap.set(district, {
        district,
        zone: normalizeString(meta.zone) || null,
        townSample: normalizeString(meta.town) || null,
        lat: safeNumber(meta.latitude?.$numberDecimal ?? meta.latitude) || null,
        lng: safeNumber(meta.longitude?.$numberDecimal ?? meta.longitude) || null,
        activation: 0,
        tertiary: 0,
        secondary: 0,
        total: 0,
      });
    }

    return districtMap.get(district);
  };

  for (const row of activationRows) {
    const m = parseRawDateToMoment(row.activation_date_raw);
    if (!inRange(m)) continue;

    const val = metric === "value" ? safeNumber(row.val) : safeNumber(row.qty);
    const bucket = getDistrictBucket(row.tertiary_buyer_code);
    bucket.activation += val;
    bucket.total += val;
  }

  for (const row of tertiaryRows) {
    const m = parseRawDateToMoment(row.invoice_date_raw);
    if (!inRange(m)) continue;

    const val = metric === "value" ? safeNumber(row.net_value) : safeNumber(row.qty);
    const bucket = getDistrictBucket(row.dealer_code);
    bucket.tertiary += val;
    bucket.total += val;
  }

  return [...districtMap.values()]
    .map((row) => ({
      ...row,
      activation: round2(row.activation),
      tertiary: round2(row.tertiary),
      secondary: round2(row.secondary),
      total: round2(row.total),
    }))
    .sort((a, b) => b.total - a.total);
}

function getDoneVsTotal(scheduleDocs = []) {
  const dealerState = new Map();

  for (const doc of scheduleDocs) {
    const dealers = Array.isArray(doc?.schedule) ? doc.schedule : [];

    for (const dealer of dealers) {
      const dealerCode = normalizeString(dealer?.code);
      if (!dealerCode) continue;

      const alreadyDone = dealerState.get(dealerCode) === true;
      const nowDone = normalizeLower(dealer?.status) === "done";
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

async function fetchCoverageSummaryAndCharts({
  start,
  end,
  actorCodes,
  selectedPositions = [],
  search = "",
  recentDays = 7,
}) {
  const safeRecentDays = Math.max(Number(recentDays) || 7, 1);

  let usersQuery = { status: "active" };
  if (actorCodes.length) {
    usersQuery.code = { $in: actorCodes };
  }

  if (selectedPositions.length) {
    const positionQuery = buildPositionQuery(selectedPositions);
    if (positionQuery) usersQuery.position = positionQuery;
  }

  const searchText = normalizeString(search);
  if (searchText) {
    const searchRegex = new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    usersQuery.$or = [{ code: searchRegex }, { name: searchRegex }];
  }

  const users = await User.find(usersQuery, { code: 1, name: 1, position: 1, _id: 0 }).lean();
  const userCodes = uniqueStrings(users.map((u) => u.code));

  if (!userCodes.length) {
    return {
      summary: {
        employees: 0,
        planned: 0,
        done: 0,
        pending: 0,
        coveragePct: 0,
        activeEmployees: 0,
        notStartedToday: 0,
        noVisitRecently: 0,
      },
      coverageTrend: [],
      regionHeatmap: [],
      positionPerformance: [],
    };
  }

  const todayStart = moment.tz(IST).startOf("day").toDate();
  const todayEnd = moment.tz(IST).endOf("day").toDate();
  const recentStart = moment.tz(IST).subtract(safeRecentDays - 1, "days").startOf("day").toDate();

  const [rangeSchedules, todaySchedules, recentSchedules] = await Promise.all([
    WeeklyBeatMappingSchedule.find({
      code: { $in: userCodes },
      startDate: { $lte: end },
      endDate: { $gte: start },
    }).lean(),
    WeeklyBeatMappingSchedule.find({
      code: { $in: userCodes },
      startDate: { $lte: todayEnd },
      endDate: { $gte: todayStart },
    }).lean(),
    WeeklyBeatMappingSchedule.find({
      code: { $in: userCodes },
      startDate: { $lte: todayEnd },
      endDate: { $gte: recentStart },
    }).lean(),
  ]);

  const rangeByCode = new Map();
  const todayByCode = new Map();
  const recentByCode = new Map();

  for (const code of userCodes) {
    rangeByCode.set(code, []);
    todayByCode.set(code, []);
    recentByCode.set(code, []);
  }

  for (const row of rangeSchedules) {
    const code = normalizeString(row.code);
    if (rangeByCode.has(code)) rangeByCode.get(code).push(row);
  }
  for (const row of todaySchedules) {
    const code = normalizeString(row.code);
    if (todayByCode.has(code)) todayByCode.get(code).push(row);
  }
  for (const row of recentSchedules) {
    const code = normalizeString(row.code);
    if (recentByCode.has(code)) recentByCode.get(code).push(row);
  }

  let totalPlanned = 0;
  let totalDone = 0;
  let activeEmployees = 0;
  let notStartedToday = 0;
  let noVisitRecently = 0;

  const positionMap = new Map();

  for (const user of users) {
    const code = normalizeString(user.code);
    const position = normalizeLower(user.position) || "unknown";

    const rangeCounts = getDoneVsTotal(rangeByCode.get(code) || []);
    const todayCounts = getDoneVsTotal(todayByCode.get(code) || []);
    const recentCounts = getDoneVsTotal(recentByCode.get(code) || []);

    totalPlanned += rangeCounts.total;
    totalDone += rangeCounts.done;
    if (rangeCounts.done > 0) activeEmployees += 1;
    if (todayCounts.total > 0 && todayCounts.done === 0) notStartedToday += 1;
    if (recentCounts.done === 0) noVisitRecently += 1;

    if (!positionMap.has(position)) {
      positionMap.set(position, {
        position,
        users: 0,
        planned: 0,
        done: 0,
      });
    }

    const pos = positionMap.get(position);
    pos.users += 1;
    pos.planned += rangeCounts.total;
    pos.done += rangeCounts.done;
  }

  const coveragePct = totalPlanned ? round2((totalDone / totalPlanned) * 100) : 0;

  const coverageTrendMap = new Map();
  const regionMap = new Map();

  for (const schedule of rangeSchedules) {
    const day = moment(schedule.startDate).tz(IST).format("YYYY-MM-DD");
    if (!coverageTrendMap.has(day)) {
      coverageTrendMap.set(day, { day, plannedDealers: new Set(), doneDealers: new Set() });
    }

    const dayNode = coverageTrendMap.get(day);

    for (const dealer of schedule.schedule || []) {
      const dealerCode = normalizeString(dealer.code);
      if (!dealerCode) continue;

      dayNode.plannedDealers.add(dealerCode);
      if (normalizeLower(dealer.status) === "done") {
        dayNode.doneDealers.add(dealerCode);
      }

      const district = normalizeString(dealer.district) || "Unmapped";
      if (!regionMap.has(district)) {
        regionMap.set(district, {
          district,
          zone: normalizeString(dealer.zone) || null,
          townSample: normalizeString(dealer.town) || null,
          lat: safeNumber(dealer.latitude?.$numberDecimal ?? dealer.latitude) || null,
          lng: safeNumber(dealer.longitude?.$numberDecimal ?? dealer.longitude) || null,
          plannedDealers: new Set(),
          doneDealers: new Set(),
        });
      }

      const region = regionMap.get(district);
      region.plannedDealers.add(dealerCode);
      if (normalizeLower(dealer.status) === "done") {
        region.doneDealers.add(dealerCode);
      }
    }
  }

  const coverageTrend = [...coverageTrendMap.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((item) => {
      const planned = item.plannedDealers.size;
      const done = item.doneDealers.size;
      const pending = Math.max(planned - done, 0);

      return {
        period: item.day,
        planned,
        done,
        pending,
        coveragePct: planned ? round2((done / planned) * 100) : 0,
      };
    });

  const regionHeatmap = [...regionMap.values()]
    .map((item) => {
      const planned = item.plannedDealers.size;
      const done = item.doneDealers.size;
      const pending = Math.max(planned - done, 0);

      return {
        district: item.district,
        zone: item.zone,
        townSample: item.townSample,
        lat: item.lat,
        lng: item.lng,
        planned,
        done,
        pending,
        coveragePct: planned ? round2((done / planned) * 100) : 0,
      };
    })
    .sort((a, b) => b.planned - a.planned);

  const positionPerformance = [...positionMap.values()]
    .map((item) => ({
      ...item,
      pending: Math.max(item.planned - item.done, 0),
      coveragePct: item.planned ? round2((item.done / item.planned) * 100) : 0,
    }))
    .sort((a, b) => b.coveragePct - a.coveragePct);

  return {
    summary: {
      employees: users.length,
      planned: totalPlanned,
      done: totalDone,
      pending: Math.max(totalPlanned - totalDone, 0),
      coveragePct,
      activeEmployees,
      notStartedToday,
      noVisitRecently,
    },
    coverageTrend,
    regionHeatmap,
    positionPerformance,
  };
}

function normalizeBrand(brand) {
  const b = normalizeString(brand);
  if (!b) return "Others";

  const formatted = b
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

  return BRAND_ORDER.includes(formatted) ? formatted : "Others";
}

async function fetchExtractionCharts({
  start,
  end,
  dealerCodes,
  metric,
  allowAll,
}) {
  const query = {
    createdAt: { $gte: start, $lte: end },
    ...(allowAll ? {} : { dealer: { $in: dealerCodes.length ? dealerCodes : ["__NO_CODES__"] } }),
  };

  const records = await ExtractionRecord.find(query).lean();

  if (!records.length) {
    return {
      kpis: {
        totalMarketValue: 0,
        totalMarketVolume: 0,
      },
      brandShare: [],
      brandTrendDaily: [],
      brandTrendWeekly: [],
      brandTrendMonthly: [],
      segmentBrandComparison: [],
    };
  }

  const brandTotals = new Map();
  const trendMaps = {
    day: new Map(),
    week: new Map(),
    month: new Map(),
  };
  const segmentMap = new Map();

  let totalMarketValue = 0;
  let totalMarketVolume = 0;

  function addTrend(granularity, period, brand, value) {
    if (!trendMaps[granularity].has(period)) {
      trendMaps[granularity].set(period, new Map());
    }
    const periodMap = trendMaps[granularity].get(period);
    periodMap.set(brand, safeNumber(periodMap.get(brand)) + safeNumber(value));
  }

  for (const row of records) {
    const brand = normalizeBrand(row.brand);
    const quantity = safeNumber(row.quantity);
    const amount = row.amount !== undefined && row.amount !== null
      ? safeNumber(row.amount)
      : safeNumber(row.price) * quantity;

    totalMarketValue += amount;
    totalMarketVolume += quantity;

    if (!brandTotals.has(brand)) {
      brandTotals.set(brand, { brand, value: 0, volume: 0 });
    }

    const brandNode = brandTotals.get(brand);
    brandNode.value += amount;
    brandNode.volume += quantity;

    const m = moment(row.createdAt).tz(IST);
    const day = m.clone().format("YYYY-MM-DD");
    const week = m.clone().startOf("isoWeek").format("YYYY-[W]WW");
    const month = m.clone().format("YYYY-MM");

    const trendValue = metric === "value" ? amount : quantity;
    addTrend("day", day, brand, trendValue);
    addTrend("week", week, brand, trendValue);
    addTrend("month", month, brand, trendValue);

    const segment = normalizeString(row.segment) || "Unmapped";
    if (!segmentMap.has(segment)) {
      segmentMap.set(segment, {
        segment,
        brands: {},
        totalValue: 0,
        totalVolume: 0,
      });
    }

    const segmentNode = segmentMap.get(segment);
    segmentNode.brands[brand] = safeNumber(segmentNode.brands[brand]) + trendValue;
    segmentNode.totalValue += amount;
    segmentNode.totalVolume += quantity;
  }

  const brandShare = [...brandTotals.values()]
    .map((row) => ({
      brand: row.brand,
      value: round2(row.value),
      volume: round2(row.volume),
      sharePct: metric === "value"
        ? (totalMarketValue ? round2((row.value / totalMarketValue) * 100) : 0)
        : (totalMarketVolume ? round2((row.volume / totalMarketVolume) * 100) : 0),
    }))
    .sort((a, b) => b.sharePct - a.sharePct);

  function mapTrend(granularity) {
    const sortedPeriods = sortBucketLabels([...trendMaps[granularity].keys()], granularity === "month" ? "month" : granularity);

    return sortedPeriods.map((period) => {
      const periodMap = trendMaps[granularity].get(period);
      const row = { period };

      for (const brandName of BRAND_ORDER) {
        row[brandName] = round2(safeNumber(periodMap.get(brandName)));
      }

      row.total = round2(
        BRAND_ORDER.reduce((sum, brandName) => sum + safeNumber(row[brandName]), 0)
      );

      return row;
    });
  }

  const segmentBrandComparison = [...segmentMap.values()]
    .map((row) => ({
      segment: row.segment,
      brands: BRAND_ORDER.reduce((acc, brandName) => {
        acc[brandName] = round2(safeNumber(row.brands[brandName]));
        return acc;
      }, {}),
      totalValue: round2(row.totalValue),
      totalVolume: round2(row.totalVolume),
    }))
    .sort((a, b) => b.totalValue - a.totalValue);

  return {
    kpis: {
      totalMarketValue: round2(totalMarketValue),
      totalMarketVolume: round2(totalMarketVolume),
    },
    brandShare,
    brandTrendDaily: mapTrend("day"),
    brandTrendWeekly: mapTrend("week"),
    brandTrendMonthly: mapTrend("month"),
    segmentBrandComparison,
  };
}

async function fetchAttendanceSummaryAndCharts({
  startMoment,
  endMoment,
  attendanceFirmCodes = [],
  attendancePositions = [],
  search = "",
}) {
  const metaQuery = { attendance: true };

  if (attendanceFirmCodes.length) {
    metaQuery.firm_code = { $in: attendanceFirmCodes };
  }

  const metaRows = await MetaData.find(metaQuery).lean();
  const eligibleCodes = uniqueStrings(metaRows.map((m) => m.code));

  if (!eligibleCodes.length) {
    return {
      kpis: {
        totalEligible: 0,
        present: 0,
        absent: 0,
        halfDay: 0,
        leave: 0,
        pending: 0,
        notPunchedOut: 0,
        avgHoursWorked: 0,
      },
      dailyTrend: [],
      firmBreakdown: [],
      geoHeatmap: [],
    };
  }

  const userQuery = { code: { $in: eligibleCodes }, status: "active" };

  if (attendancePositions.length) {
    const positionQuery = buildPositionQuery(attendancePositions);
    if (positionQuery) userQuery.position = positionQuery;
  }

  const searchText = normalizeString(search);
  if (searchText) {
    const searchRegex = new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    userQuery.$or = [{ code: searchRegex }, { name: searchRegex }, { position: searchRegex }];
  }

  const users = await User.find(
    userQuery,
    { code: 1, name: 1, position: 1, district: 1, _id: 0 }
  ).lean();

  const finalCodes = uniqueStrings(users.map((u) => u.code));
  const userMap = new Map(users.map((u) => [normalizeString(u.code), u]));

  if (!finalCodes.length) {
    return {
      kpis: {
        totalEligible: 0,
        present: 0,
        absent: 0,
        halfDay: 0,
        leave: 0,
        pending: 0,
        notPunchedOut: 0,
        avgHoursWorked: 0,
      },
      dailyTrend: [],
      firmBreakdown: [],
      geoHeatmap: [],
    };
  }

  const metaMap = new Map(metaRows.map((m) => [normalizeString(m.code), m]));

  const firmCodesUsed = uniqueStrings(
    finalCodes.map((code) => normalizeString(metaMap.get(code)?.firm_code))
  );

  const firms = firmCodesUsed.length
    ? await Firm.find({ code: { $in: firmCodesUsed } }, { code: 1, name: 1, _id: 0 }).lean()
    : [];
  const firmMap = new Map(firms.map((f) => [normalizeString(f.code), f]));

  const start = startMoment.clone().startOf("day").toDate();
  const end = endMoment.clone().endOf("day").toDate();
  const selectedDayKey = endMoment.clone().format("YYYY-MM-DD");

  const attendanceRows = await Attendance.find({
    code: { $in: finalCodes },
    date: { $gte: start, $lte: end },
  }).lean();

  const recordByCodeDay = new Map();

  for (const row of attendanceRows) {
    const code = normalizeString(row.code);
    const day = moment(row.date).tz(IST).format("YYYY-MM-DD");
    const key = `${code}__${day}`;
    const prev = recordByCodeDay.get(key);

    if (!prev) {
      recordByCodeDay.set(key, row);
      continue;
    }

    const prevTime = new Date(prev.updatedAt || prev.date || 0).getTime();
    const nextTime = new Date(row.updatedAt || row.date || 0).getTime();
    if (nextTime >= prevTime) {
      recordByCodeDay.set(key, row);
    }
  }

  const dayKeys = [];
  const cursor = startMoment.clone().startOf("day");
  const endDay = endMoment.clone().startOf("day");
  while (cursor.isSameOrBefore(endDay)) {
    dayKeys.push(cursor.format("YYYY-MM-DD"));
    cursor.add(1, "day");
  }

  const trendMap = new Map(dayKeys.map((day) => [day, initStatusBucket(finalCodes.length)]));

  const selectedDayBucket = initStatusBucket(finalCodes.length);
  const firmBuckets = new Map();

  for (const code of finalCodes) {
    const firmCode = normalizeString(metaMap.get(code)?.firm_code);
    if (!firmBuckets.has(firmCode || "NA")) {
      firmBuckets.set(firmCode || "NA", {
        firmCode: firmCode || "NA",
        firmName: normalizeString(firmMap.get(firmCode)?.name) || firmCode || "NA",
        bucket: initStatusBucket(0),
      });
    }

    const firmNode = firmBuckets.get(firmCode || "NA");
    firmNode.bucket.totalEligible += 1;
    firmNode.bucket.absent += 1;
  }

  for (const [key, row] of recordByCodeDay.entries()) {
    const [, day] = key.split("__");
    const trendBucket = trendMap.get(day);
    if (trendBucket) {
      applyAttendanceStatus(trendBucket, row);
    }

    if (day === selectedDayKey) {
      applyAttendanceStatus(selectedDayBucket, row);

      const code = normalizeString(row.code);
      const firmCode = normalizeString(metaMap.get(code)?.firm_code) || "NA";
      const firmNode = firmBuckets.get(firmCode);
      if (firmNode) {
        applyAttendanceStatus(firmNode.bucket, row);
      }
    }
  }

  const dailyTrend = dayKeys.map((day) => ({
    period: day,
    ...statusBucketToSummary(trendMap.get(day)),
  }));

  const firmBreakdown = [...firmBuckets.values()]
    .map((item) => ({
      firmCode: item.firmCode,
      firmName: item.firmName,
      ...statusBucketToSummary(item.bucket),
    }))
    .sort((a, b) => b.totalEligible - a.totalEligible);

  const geoRows = await Attendance.find({
    code: { $in: finalCodes },
    date: { $gte: start, $lte: end },
    $or: [
      { punchOutLatitude: { $ne: null }, punchOutLongitude: { $ne: null } },
      { punchInLatitude: { $ne: null }, punchInLongitude: { $ne: null } },
    ],
  }).lean();

  const districtGeoMap = new Map();

  for (const row of geoRows) {
    const code = normalizeString(row.code);
    const district = normalizeString(userMap.get(code)?.district) || "Unmapped";

    if (!districtGeoMap.has(district)) {
      districtGeoMap.set(district, {
        district,
        points: 0,
        present: 0,
        halfDay: 0,
        leave: 0,
        pending: 0,
        absent: 0,
        hoursTotal: 0,
        hoursCount: 0,
      });
    }

    const node = districtGeoMap.get(district);
    node.points += 1;

    const status = normalizeString(row.status || "Pending");
    if (status === "Present") node.present += 1;
    else if (status === "Half Day") node.halfDay += 1;
    else if (status === "Leave") node.leave += 1;
    else if (status === "Absent") node.absent += 1;
    else node.pending += 1;

    const hrs = safeNumber(row.hoursWorked);
    if (hrs > 0) {
      node.hoursTotal += hrs;
      node.hoursCount += 1;
    }
  }

  const geoHeatmap = [...districtGeoMap.values()]
    .map((row) => ({
      district: row.district,
      points: row.points,
      present: row.present,
      halfDay: row.halfDay,
      leave: row.leave,
      pending: row.pending,
      absent: row.absent,
      avgHoursWorked: row.hoursCount ? round2(row.hoursTotal / row.hoursCount) : 0,
    }))
    .sort((a, b) => b.points - a.points);

  return {
    kpis: statusBucketToSummary(selectedDayBucket),
    dailyTrend,
    firmBreakdown,
    geoHeatmap,
  };
}

exports.getMainDashboardOverview = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      flow_name = "default_sales_flow",
      metric = "value",
      subordinate_filters = {},
      dealer_filters = {},
      attendance_filters = {},
      coverage_filters = {},
      recent_days = 7,
      search = "",
    } = req.body || {};

    const range = parseBodyDateRange({ startDate, endDate });

    const scope = await resolveDashboardScope({
      user: req.user,
      flow_name,
      subordinate_filters,
      dealer_filters,
    });

    const allowAll = getAdminBypass(req.user, subordinate_filters, dealer_filters);

    const attendanceFirmCodes = uniqueStrings(attendance_filters?.firmCodes || []);
    const attendancePositions = uniqueStrings(attendance_filters?.positions || []);

    const coveragePositions = uniqueStrings(coverage_filters?.positions || []);
    const coverageSearch = normalizeString(coverage_filters?.search || search);

    const [
      salesCards,
      salesTrend,
      salesRegionHeatmap,
      coverage,
      extraction,
      attendance,
    ] = await Promise.all([
      fetchSalesCards({
        start: range.startMoment.toDate(),
        end: range.endMoment.toDate(),
        dealerCodes: scope.dealerCodes,
        metric,
        allowAll,
      }),
      fetchSalesTrendCharts({
        startMoment: range.startMoment,
        endMoment: range.endMoment,
        dealerCodes: scope.dealerCodes,
        mddCodes: scope.mddCodes,
        metric,
        allowAll,
      }),
      fetchSalesRegionHeatmap({
        startMoment: range.startMoment,
        endMoment: range.endMoment,
        dealerCodes: scope.dealerCodes,
        metric,
        allowAll,
      }),
      fetchCoverageSummaryAndCharts({
        start: range.startMoment.toDate(),
        end: range.endMoment.toDate(),
        actorCodes: scope.actorCodes,
        selectedPositions: coveragePositions,
        search: coverageSearch,
        recentDays: recent_days,
      }),
      fetchExtractionCharts({
        start: range.startMoment.toDate(),
        end: range.endMoment.toDate(),
        dealerCodes: scope.dealerCodes,
        metric,
        allowAll,
      }),
      fetchAttendanceSummaryAndCharts({
        startMoment: range.startMoment,
        endMoment: range.endMoment,
        attendanceFirmCodes,
        attendancePositions,
        search: normalizeString(attendance_filters?.search || search),
      }),
    ]);

    return res.status(200).json({
      success: true,
      meta: {
        generatedAt: moment.tz(IST).format(),
        timezone: IST,
        startDate: range.startDate,
        endDate: range.endDate,
        metric,
        flow_name,
      },
      appliedFilters: {
        subordinate_filters,
        dealer_filters,
        attendance_filters,
        coverage_filters,
        recent_days,
      },
      kpis: {
        sales: salesCards,
        coverage: coverage.summary,
        extraction: extraction.kpis,
        attendance: attendance.kpis,
      },
      charts: {
        salesTrend,
        salesRegionHeatmap,
        coverageTrend: coverage.coverageTrend,
        coverageRegionHeatmap: coverage.regionHeatmap,
        coveragePositionPerformance: coverage.positionPerformance,
        extractionBrandShare: extraction.brandShare,
        extractionBrandTrendDaily: extraction.brandTrendDaily,
        extractionBrandTrendWeekly: extraction.brandTrendWeekly,
        extractionBrandTrendMonthly: extraction.brandTrendMonthly,
        extractionSegmentComparison: extraction.segmentBrandComparison,
        attendanceDailyTrend: attendance.dailyTrend,
        attendanceFirmBreakdown: attendance.firmBreakdown,
        attendanceGeoHeatmap: attendance.geoHeatmap,
      },
    });
  } catch (error) {
    console.error("Error in getMainDashboardOverview:", error);

    const msg = String(error?.message || "");
    const badRequest =
      msg.includes("required") ||
      msg.includes("must be") ||
      msg.includes("cannot be after") ||
      msg.includes("format");

    return res.status(badRequest ? 400 : 500).json({
      success: false,
      message: error.message || "Failed to build dashboard overview",
    });
  }
};

exports.getMainDashboardFilterOptions = async (req, res) => {
  try {
    const {
      flow_name = "default_sales_flow",
      subordinate_filters = {},
      dealer_filters = {},
    } = req.body || {};

    const scope = await resolveDashboardScope({
      user: req.user,
      flow_name,
      subordinate_filters,
      dealer_filters,
    });

    const allowAll = getAdminBypass(req.user, subordinate_filters, dealer_filters);

    const dealerQuery = allowAll
      ? { role: "dealer", status: "active" }
      : { code: { $in: scope.dealerCodes.length ? scope.dealerCodes : ["__NO_CODES__"] }, role: "dealer", status: "active" };

    const [
      actorPositions,
      dealers,
      brands,
      segments,
      firmCodes,
    ] = await Promise.all([
      resolveSubordinatePositions({
        flow_name,
        position: req.user?.position,
        user_role: req.user?.role,
      }),
      User.find(dealerQuery, { code: 1, name: 1, zone: 1, district: 1, town: 1, category: 1, top_outlet: 1 }).lean(),
      ExtractionRecord.distinct("brand", {}),
      ExtractionRecord.distinct("segment", {}),
      MetaData.distinct("firm_code", { attendance: true }),
    ]);

    const firms = firmCodes.length
      ? await Firm.find({ code: { $in: firmCodes } }, { code: 1, name: 1, _id: 0 }).lean()
      : [];

    const zoneSet = new Set();
    const districtSet = new Set();
    const townSet = new Set();
    const categorySet = new Set();

    for (const d of dealers) {
      const zone = normalizeString(d.zone);
      const district = normalizeString(d.district);
      const town = normalizeString(d.town);
      const category = normalizeString(d.category);

      if (zone) zoneSet.add(zone);
      if (district) districtSet.add(district);
      if (town) townSet.add(town);
      if (category) categorySet.add(category);
    }

    return res.status(200).json({
      success: true,
      data: {
        actorPositions: uniqueStrings(actorPositions).map((value) => ({
          value,
          label: String(value).toUpperCase(),
        })),
        dealers: dealers.map((d) => ({ code: d.code, name: d.name })),
        dealerFilters: {
          zones: [...zoneSet].sort(),
          districts: [...districtSet].sort(),
          towns: [...townSet].sort(),
          categories: [...categorySet].sort(),
          topOutlet: [
            { label: "Yes", value: true },
            { label: "No", value: false },
          ],
        },
        brands: uniqueStrings(brands).sort(),
        segments: uniqueStrings(segments).sort(),
        firms: firms.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
      },
    });
  } catch (error) {
    console.error("Error in getMainDashboardFilterOptions:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch dashboard filter options",
    });
  }
};
