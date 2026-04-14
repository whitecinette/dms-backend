const HierarchyEntries = require("../../model/HierarchyEntries");
const User = require("../../model/User");
const resolveFlowHierarchy = require("./resolveFlowHierarchy");

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function uniqueNonEmpty(values = []) {
  return [...new Set(
    values
      .map((v) => normalizeString(v))
      .filter(Boolean)
  )];
}

function normalizeFilterObject(obj = {}) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};

  const result = {};
  Object.entries(obj).forEach(([key, value]) => {
    const normalizedKey = normalizeLower(key);

    if (Array.isArray(value)) {
      const cleaned = value
        .map((v) => (typeof v === "string" ? v.trim() : v))
        .filter((v) => v !== undefined && v !== null && v !== "");
      if (cleaned.length) result[normalizedKey] = cleaned;
      return;
    }

    if (value !== undefined && value !== null && value !== "") {
      result[normalizedKey] = [value];
    }
  });

  return result;
}

function applySubordinateFilters(rows, subordinateFilters, hierarchy) {
  if (!rows.length) return rows;

  const validFilterKeys = Object.keys(subordinateFilters).filter(
    (key) => hierarchy.includes(key) && (subordinateFilters[key] || []).length
  );

  if (!validFilterKeys.length) return rows;

  return rows.filter((row) => {
    return validFilterKeys.every((position) => {
      const allowedValues = new Set(
        subordinateFilters[position].map((v) => normalizeString(v))
      );
      const rowValue = normalizeString(row[position]);
      return allowedValues.has(rowValue);
    });
  });
}

function groupCodesFromRows(rows, hierarchy, excludePositions = []) {
  const excludeSet = new Set(
    (excludePositions || []).map((p) => normalizeLower(p))
  );

  const grouped = {};
  hierarchy.forEach((pos) => {
    if (excludeSet.has(pos)) {
      grouped[pos] = [];
      return;
    }

    grouped[pos] = uniqueNonEmpty(rows.map((row) => row[pos]));
  });

  return grouped;
}

function intersectRowsByDealer(rows, allowedDealerCodes) {
  const allowedSet = new Set(
    uniqueNonEmpty(allowedDealerCodes)
  );

  return rows.filter((row) => allowedSet.has(normalizeString(row.dealer)));
}

async function resolveScope({
  user,
  flow_name,
  subordinate_filters = {},
  dealer_filters = {},
  exclude_positions = ["dealer"],
}) {
  if (!user?.code || !user?.position || !user?.role) {
    throw new Error("Authenticated user with code, position, role is required");
  }

  if (!flow_name) {
    throw new Error("flow_name is required");
  }

  const hierarchy = await resolveFlowHierarchy(flow_name);

  const rootCode = normalizeString(user.code);
  const rootPosition = normalizeLower(user.position);
  const userRole = normalizeLower(user.role);

  const subordinateFilters = normalizeFilterObject(subordinate_filters);
  const dealerFilters = normalizeFilterObject(dealer_filters);

  const isAdmin =
    userRole === "admin" || userRole === "super_admin" || userRole === "hr";

  let baseQuery = {
    hierarchy_name: normalizeString(flow_name),
  };

  if (!isAdmin) {
    if (!hierarchy.includes(rootPosition)) {
      throw new Error(
        `User position "${rootPosition}" is not part of flow "${flow_name}"`
      );
    }

    baseQuery[rootPosition] = rootCode;
  }

  let rows = await HierarchyEntries.find(baseQuery).lean();

  rows = applySubordinateFilters(rows, subordinateFilters, hierarchy);

  if (!rows.length) {
    return groupCodesFromRows([], hierarchy, exclude_positions);
  }

  const requestedDealerFilters = Object.keys(dealerFilters);
  if (requestedDealerFilters.length) {
    const dealerCodesFromRows = uniqueNonEmpty(rows.map((row) => row.dealer));

    if (!dealerCodesFromRows.length) {
      return groupCodesFromRows([], hierarchy, exclude_positions);
    }

    const dealerQuery = {
      code: { $in: dealerCodesFromRows },
      role: "dealer",
      status: "active",
    };

    requestedDealerFilters.forEach((field) => {
      const values = dealerFilters[field];

      if (!values?.length) return;

      dealerQuery[field] = { $in: values };
    });

    const matchedDealers = await User.find(dealerQuery)
      .select("code")
      .lean();

    const allowedDealerCodes = matchedDealers.map((d) => d.code);

    if (!allowedDealerCodes.length) {
      return groupCodesFromRows([], hierarchy, exclude_positions);
    }

    rows = intersectRowsByDealer(rows, allowedDealerCodes);
  }

  return groupCodesFromRows(rows, hierarchy, exclude_positions);
}

module.exports = resolveScope;
