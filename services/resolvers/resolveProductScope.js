const Product = require("../../model/Product");

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
    const normalizedKey = normalizeString(key);

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

function normalizeFieldValues(field, values = []) {
  const lowerCaseFields = new Set([
    "brand",
    "product_category",
    "segment",
    "model_code",
    "product_code",
    "category",
    "source",
    "status",
  ]);

  return values.map((value) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return lowerCaseFields.has(field) ? trimmed.toLowerCase() : trimmed;
    }
    return value;
  });
}

async function resolveProductScope({ product_filters = {} }) {
  const normalizedFilters = normalizeFilterObject(product_filters);
  const applied_filters = {};

  const query = {};

  Object.entries(normalizedFilters).forEach(([field, rawValues]) => {
    const values = normalizeFieldValues(field, rawValues);

    if (!values.length) return;

    // status / isAvailable defaults can be overridden if explicitly passed
    if (field === "isAvailable") {
      query[field] = { $in: values };
      applied_filters[field] = values;
      return;
    }

    query[field] = { $in: values };
    applied_filters[field] = values;
  });

  // defaults only when not explicitly passed
  if (!Object.prototype.hasOwnProperty.call(applied_filters, "status")) {
    query.status = { $in: ["active"] };
    applied_filters.status = ["active"];
  }

  if (!Object.prototype.hasOwnProperty.call(applied_filters, "isAvailable")) {
    query.isAvailable = { $in: [true] };
    applied_filters.isAvailable = [true];
  }

  const products = await Product.find(query)
    .select("product_code")
    .lean();

  const product_codes = uniqueNonEmpty(products.map((p) => p.product_code));

  return {
    product_codes,
    matched_count: product_codes.length,
    applied_filters,
  };
}

module.exports = resolveProductScope;