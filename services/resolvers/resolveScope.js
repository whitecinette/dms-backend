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
  return [
    ...new Set(
      values.map((v) => normalizeString(v)).filter(Boolean)
    ),
  ];
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

function groupCodesFromRows(rows, hierarchy, excludePositions = []) {
  const excludeSet = new Set(
    (excludePositions || []).map((p) => normalizeLower(p))
  );

  const grouped = {};
  const tempSets = {};

  hierarchy.forEach((pos) => {
    if (excludeSet.has(pos)) {
      grouped[pos] = [];
      return;
    }
    tempSets[pos] = new Set();
  });

  for (const row of rows) {
    for (const pos of hierarchy) {
      if (!tempSets[pos]) continue;
      const value = normalizeString(row[pos]);
      if (value) tempSets[pos].add(value);
    }
  }

  hierarchy.forEach((pos) => {
    if (excludeSet.has(pos)) return;
    grouped[pos] = Array.from(tempSets[pos] || []);
  });

  return grouped;
}

function intersectRowsByDealer(rows, allowedDealerCodes) {
  const allowedSet = new Set(uniqueNonEmpty(allowedDealerCodes));
  return rows.filter((row) => allowedSet.has(normalizeString(row.dealer)));
}

async function resolveScope({
  user,
  flow_name = "default_sales_flow",
  subordinate_filters = {},
  dealer_filters = {},
  exclude_positions = ["dealer"],
}) {
  const requestStart = Date.now();

  const logStep = (label, extra = {}) => {
    console.log(`⏱ [resolveScope] ${label}`, {
      elapsedMs: Date.now() - requestStart,
      flow_name,
      userCode: user?.code,
      userPosition: user?.position,
      userRole: user?.role,
      ...extra,
    });
  };

  try {
    logStep("START");

    if (!user?.code || !user?.position || !user?.role) {
      logStep("ERROR_INVALID_USER");
      throw new Error("Authenticated user with code, position, role is required");
    }

    const hierarchyStart = Date.now();
    const hierarchy = await resolveFlowHierarchy(flow_name);
    console.log("⏱ [resolveScope] HIERARCHY_DONE", {
      hierarchyMs: Date.now() - hierarchyStart,
      elapsedMs: Date.now() - requestStart,
      hierarchy,
    });

    const normalizeStart = Date.now();
    const rootCode = normalizeString(user.code);
    const rootPosition = normalizeLower(user.position);
    const userRole = normalizeLower(user.role);

    const subordinateFilters = normalizeFilterObject(subordinate_filters);
    const dealerFilters = normalizeFilterObject(dealer_filters);

    console.log("⏱ [resolveScope] NORMALIZATION_DONE", {
      normalizeMs: Date.now() - normalizeStart,
      elapsedMs: Date.now() - requestStart,
      rootCode,
      rootPosition,
      userRole,
      subordinateFilterKeys: Object.keys(subordinateFilters),
      dealerFilterKeys: Object.keys(dealerFilters),
    });

    const adminCheckStart = Date.now();
    const isAdmin =
      userRole === "admin" ||
      userRole === "super_admin" ||
      userRole === "hr";

    console.log("⏱ [resolveScope] ADMIN_CHECK_DONE", {
      adminCheckMs: Date.now() - adminCheckStart,
      elapsedMs: Date.now() - requestStart,
      isAdmin,
    });

    const baseQueryBuildStart = Date.now();
    const baseQuery = {
      hierarchy_name: normalizeString(flow_name),
    };

    if (!isAdmin) {
      if (!hierarchy.includes(rootPosition)) {
        logStep("ERROR_POSITION_NOT_IN_HIERARCHY", { rootPosition });
        throw new Error(
          `User position "${rootPosition}" is not part of flow "${flow_name}"`
        );
      }

      baseQuery[rootPosition] = rootCode;
    }

    Object.keys(subordinateFilters).forEach((position) => {
      const values = uniqueNonEmpty(subordinateFilters[position]);

      if (!values.length) return;
      if (!hierarchy.includes(position)) return;

      baseQuery[position] = { $in: values };
    });

    console.log("⏱ [resolveScope] BASE_QUERY_READY", {
      baseQueryBuildMs: Date.now() - baseQueryBuildStart,
      elapsedMs: Date.now() - requestStart,
      baseQuery,
    });

    const hierarchyQueryStart = Date.now();
    let rows = await HierarchyEntries.find(baseQuery).lean();

    console.log("⏱ [resolveScope] HIERARCHY_ROWS_FETCHED", {
      hierarchyQueryMs: Date.now() - hierarchyQueryStart,
      elapsedMs: Date.now() - requestStart,
      rowCount: rows.length,
    });

    if (!rows.length) {
      const emptyGroupStart = Date.now();
      const grouped = groupCodesFromRows([], hierarchy, exclude_positions);

      console.log("⏱ [resolveScope] EARLY_RETURN_NO_ROWS", {
        groupMs: Date.now() - emptyGroupStart,
        elapsedMs: Date.now() - requestStart,
      });

      return grouped;
    }

    const dealerFilterPrepStart = Date.now();
    const requestedDealerFilters = Object.keys(dealerFilters).filter(
      (field) => (dealerFilters[field] || []).length
    );

    console.log("⏱ [resolveScope] DEALER_FILTER_PREP_DONE", {
      dealerFilterPrepMs: Date.now() - dealerFilterPrepStart,
      elapsedMs: Date.now() - requestStart,
      requestedDealerFilters,
    });

    if (requestedDealerFilters.length) {
      const dealerCodesExtractStart = Date.now();
      const dealerCodesFromRows = uniqueNonEmpty(rows.map((row) => row.dealer));

      console.log("⏱ [resolveScope] DEALER_CODES_FROM_ROWS_READY", {
        dealerCodesExtractMs: Date.now() - dealerCodesExtractStart,
        elapsedMs: Date.now() - requestStart,
        dealerCodesFromRowsCount: dealerCodesFromRows.length,
      });

      if (!dealerCodesFromRows.length) {
        const emptyGroupStart = Date.now();
        const grouped = groupCodesFromRows([], hierarchy, exclude_positions);

        console.log("⏱ [resolveScope] EARLY_RETURN_NO_DEALER_CODES", {
          groupMs: Date.now() - emptyGroupStart,
          elapsedMs: Date.now() - requestStart,
        });

        return grouped;
      }

      const dealerQueryBuildStart = Date.now();
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

      console.log("⏱ [resolveScope] DEALER_QUERY_READY", {
        dealerQueryBuildMs: Date.now() - dealerQueryBuildStart,
        elapsedMs: Date.now() - requestStart,
        dealerQuery,
      });

      const matchedDealersStart = Date.now();
      const matchedDealers = await User.find(dealerQuery)
        .select("code")
        .lean();

      console.log("⏱ [resolveScope] MATCHED_DEALERS_FETCHED", {
        matchedDealersMs: Date.now() - matchedDealersStart,
        elapsedMs: Date.now() - requestStart,
        matchedDealersCount: matchedDealers.length,
      });

      const allowedCodesMapStart = Date.now();
      const allowedDealerCodes = matchedDealers.map((d) => d.code);

      console.log("⏱ [resolveScope] ALLOWED_DEALER_CODES_READY", {
        allowedCodesMapMs: Date.now() - allowedCodesMapStart,
        elapsedMs: Date.now() - requestStart,
        allowedDealerCodesCount: allowedDealerCodes.length,
      });

      if (!allowedDealerCodes.length) {
        const emptyGroupStart = Date.now();
        const grouped = groupCodesFromRows([], hierarchy, exclude_positions);

        console.log("⏱ [resolveScope] EARLY_RETURN_NO_ALLOWED_DEALERS", {
          groupMs: Date.now() - emptyGroupStart,
          elapsedMs: Date.now() - requestStart,
        });

        return grouped;
      }

      const intersectStart = Date.now();
      rows = intersectRowsByDealer(rows, allowedDealerCodes);

      console.log("⏱ [resolveScope] DEALER_INTERSECTION_DONE", {
        intersectMs: Date.now() - intersectStart,
        elapsedMs: Date.now() - requestStart,
        remainingRowCount: rows.length,
      });

      if (!rows.length) {
        const emptyGroupStart = Date.now();
        const grouped = groupCodesFromRows([], hierarchy, exclude_positions);

        console.log("⏱ [resolveScope] EARLY_RETURN_NO_ROWS_AFTER_INTERSECTION", {
          groupMs: Date.now() - emptyGroupStart,
          elapsedMs: Date.now() - requestStart,
        });

        return grouped;
      }
    }

    const finalGroupStart = Date.now();
    const grouped = groupCodesFromRows(rows, hierarchy, exclude_positions);

    console.log("⏱ [resolveScope] FINAL_GROUPING_DONE", {
      finalGroupMs: Date.now() - finalGroupStart,
      elapsedMs: Date.now() - requestStart,
      groupedCounts: Object.fromEntries(
        Object.entries(grouped).map(([key, value]) => [key, value.length])
      ),
    });

    logStep("DONE", {
      totalMs: Date.now() - requestStart,
      finalRowCount: rows.length,
    });

    return grouped;
  } catch (error) {
    console.error("❌ [resolveScope] ERROR", {
      message: error.message,
      stack: error.stack,
      elapsedMs: Date.now() - requestStart,
      flow_name,
      userCode: user?.code,
      userPosition: user?.position,
      userRole: user?.role,
    });
    throw error;
  }
}

module.exports = resolveScope;