const HierarchyEntries = require("../../model/HierarchyEntries");
const User = require("../../model/User");
const Product = require("../../model/Product");



function resolveFlowHierarchy(flow_name) {
  if (flow_name === "default_sales_flow") {
    return ["smd", "zsm", "asm", "mdd", "tse", "so", "dealer"];
  }

  return [];
};

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

function buildHierarchyBaseQuery({
  flow_name,
  user,
  hierarchy,
  subordinateFilters = {},
  excludeTargetKey = null,
}) {
  const rootCode = normalizeString(user.code);
  const rootPosition = normalizeLower(user.position);
  const userRole = normalizeLower(user.role);

  const isAdmin =
    userRole === "admin" ||
    userRole === "super_admin" ||
    userRole === "hr";

  const query = {
    hierarchy_name: normalizeString(flow_name),
  };

  if (!isAdmin) {
    if (!hierarchy.includes(rootPosition)) {
      throw new Error(
        `User position "${rootPosition}" is not part of flow "${flow_name}"`
      );
    }
    query[rootPosition] = rootCode;
  }

  Object.entries(subordinateFilters).forEach(([key, values]) => {
    if (key === excludeTargetKey) return;
    if (!hierarchy.includes(key)) return;

    const cleaned = uniqueNonEmpty(values);
    if (!cleaned.length) return;

    query[key] = { $in: cleaned };
  });

  return query;
}

async function getScopedDealerCodes({
  flow_name,
  user,
  hierarchy,
  subordinateFilters = {},
}) {
  const hierarchyQuery = buildHierarchyBaseQuery({
    flow_name,
    user,
    hierarchy,
    subordinateFilters,
    excludeTargetKey: "dealer",
  });

  const dealerCodes = await HierarchyEntries.distinct("dealer", hierarchyQuery);
  return uniqueNonEmpty(dealerCodes);
}

async function resolveSubordinateOptions({
  flow_name,
  user,
  target_key,
  subordinates = {},
}) {
  const hierarchy = await resolveFlowHierarchy(flow_name);
  const normalizedTargetKey = normalizeLower(target_key);

  if (!hierarchy.includes(normalizedTargetKey)) {
    throw new Error(`Invalid subordinate target_key: ${target_key}`);
  }

  const hierarchyQuery = buildHierarchyBaseQuery({
    flow_name,
    user,
    hierarchy,
    subordinateFilters: subordinates,
    excludeTargetKey: normalizedTargetKey,
  });

  const distinctCodes = await HierarchyEntries.distinct(
    normalizedTargetKey,
    hierarchyQuery
  );

  const scopedCodes = uniqueNonEmpty(distinctCodes);
  if (!scopedCodes.length) return [];

  const users = await User.find({
    code: { $in: scopedCodes },
    status: "active",
  })
    .select("name code position role")
    .lean();

  const byCode = new Map(
    users.map((item) => [normalizeString(item.code), item])
  );

  return scopedCodes.map((code) => {
    const userRow = byCode.get(code);
    const name = userRow?.name || code;
    const position = userRow?.position || normalizedTargetKey;

    return {
      label: `${name} (${code})`,
      value: code,
      code,
      name,
      position,
    };
  });
}

async function resolveDealerOptions({
  flow_name,
  user,
  target_key,
  subordinates = {},
  dealer = {},
}) {
  const hierarchy = await resolveFlowHierarchy(flow_name);
  const normalizedTargetKey = normalizeLower(target_key);

  const allowedDealerFields = [
    "zone",
    "district",
    "town",
    "taluka",
    "category",
    "top_outlet",
  ];

  if (!allowedDealerFields.includes(normalizedTargetKey)) {
    throw new Error(`Invalid dealer target_key: ${target_key}`);
  }

  const dealerCodes = await getScopedDealerCodes({
    flow_name,
    user,
    hierarchy,
    subordinateFilters: subordinates,
  });

  if (!dealerCodes.length) return [];

  if (normalizedTargetKey === "top_outlet") {
    return [
      { label: "Yes", value: true },
      { label: "No", value: false },
    ];
  }

  const dealerFilters = normalizeFilterObject(dealer);

  const userQuery = {
    code: { $in: dealerCodes },
    status: "active",
    $or: [{ role: "dealer" }, { position: "dealer" }],
  };

  Object.entries(dealerFilters).forEach(([key, values]) => {
    if (key === normalizedTargetKey) return;

    const cleaned = values.filter(
      (v) => v !== undefined && v !== null && v !== ""
    );
    if (!cleaned.length) return;

    userQuery[key] = { $in: cleaned };
  });

  const distinctValues = await User.distinct(normalizedTargetKey, userQuery);

  return distinctValues
    .filter((v) => v !== undefined && v !== null && v !== "")
    .map((v) => ({
      label: String(v),
      value: v,
    }));
}

async function resolveProductTagOptions({ product_tags = {} }) {
  const normalizedTags = normalizeFilterObject(product_tags);
  const selectedTags = normalizedTags.product_tag || [];

  const query = {};

  // If some tags are already selected, return matching tags from matching products.
  // This keeps things flexible, but still simple.
  if (selectedTags.length) {
    query.tags = { $in: selectedTags };
  }

  const products = await Product.find(query)
    .select("tags")
    .lean();

  const tags = Array.from(
    new Set(
      products.flatMap((product) =>
        Array.isArray(product?.tags)
          ? product.tags.map((tag) => normalizeString(tag)).filter(Boolean)
          : []
      )
    )
  ).sort((a, b) => a.localeCompare(b));

  return tags.map((tag) => ({
    label: tag,
    value: tag,
  }));
}

async function resolveDropdownOptions({
  flow_name = "default_sales_flow",
  user,
  target_type,
  target_key,
  subordinates = {},
  dealer = {},
  product_tags = {},
}) {
  if (!user?.code || !user?.position || !user?.role) {
    throw new Error("Authenticated user with code, position, role is required");
  }

  const normalizedTargetType = normalizeLower(target_type);
  const normalizedTargetKey = normalizeLower(target_key);

  if (!normalizedTargetType) {
    throw new Error("target_type is required");
  }

  if (!normalizedTargetKey) {
    throw new Error("target_key is required");
  }

  if (normalizedTargetType === "subordinate") {
    return resolveSubordinateOptions({
      flow_name,
      user,
      target_key: normalizedTargetKey,
      subordinates: normalizeFilterObject(subordinates),
    });
  }

  if (normalizedTargetType === "dealer") {
    return resolveDealerOptions({
      flow_name,
      user,
      target_key: normalizedTargetKey,
      subordinates: normalizeFilterObject(subordinates),
      dealer: normalizeFilterObject(dealer),
    });
  }

  if (normalizedTargetType === "product_tag") {
    return resolveProductTagOptions({
      product_tags: normalizeFilterObject(product_tags),
    });
  }

  throw new Error(`Invalid target_type: ${target_type}`);
}

module.exports = resolveDropdownOptions;