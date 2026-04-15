const HierarchyEntries = require("../../model/HierarchyEntries");
const User = require("../../model/User");
const resolveFlowHierarchy = require("./resolveFlowHierarchy");

function uniqueNonEmpty(values = []) {
  return [...new Set(
    values.map((v) => String(v || "").trim()).filter(Boolean)
  )];
}

async function resolveSubordinates({
  flow_name,
  root_code,
  root_position,
  exclude_positions = ["dealer"],
  user_role,
}) {
  if (!flow_name) throw new Error("flow_name is required");

  const normalizedRole = String(user_role || "").trim().toLowerCase();
  const isAdmin =
    normalizedRole === "admin" ||
    normalizedRole === "super_admin" ||
    normalizedRole === "hr";

  if (!isAdmin) {
    if (!root_code) throw new Error("root_code is required");
    if (!root_position) throw new Error("root_position is required");
  }

  const hierarchy = await resolveFlowHierarchy(flow_name);
  const excludeSet = new Set(
    (exclude_positions || []).map((p) => String(p || "").trim().toLowerCase())
  );

  let rows = [];

  if (isAdmin) {
    if (!root_code || !root_position) {
      throw new Error(
        "For admin/super_admin/hr, root_code and root_position are required"
      );
    }

    const normalizedRootPosition = String(root_position).trim().toLowerCase();
    const normalizedRootCode = String(root_code).trim();

    if (!hierarchy.includes(normalizedRootPosition)) {
      throw new Error(
        `Position "${normalizedRootPosition}" not found in flow "${flow_name}"`
      );
    }

    rows = await HierarchyEntries.find({
      hierarchy_name: String(flow_name).trim(),
      [normalizedRootPosition]: normalizedRootCode,
    }).lean();
  } else {
    const normalizedRootPosition = String(root_position).trim().toLowerCase();
    const normalizedRootCode = String(root_code).trim();

    if (!hierarchy.includes(normalizedRootPosition)) {
      throw new Error(
        `Position "${normalizedRootPosition}" not found in flow "${flow_name}"`
      );
    }

    rows = await HierarchyEntries.find({
      hierarchy_name: String(flow_name).trim(),
      [normalizedRootPosition]: normalizedRootCode,
    }).lean();
  }

  const output = {};
  hierarchy.forEach((pos) => {
    output[pos] = [];
  });

  const rootIndex = root_position
    ? hierarchy.indexOf(String(root_position).trim().toLowerCase())
    : -1;

  const codesByPosition = {};
  hierarchy.forEach((pos) => {
    if (excludeSet.has(pos)) {
      codesByPosition[pos] = [];
      return;
    }

    if (rootIndex !== -1 && hierarchy.indexOf(pos) <= rootIndex) {
      codesByPosition[pos] = [];
      return;
    }

    codesByPosition[pos] = uniqueNonEmpty(rows.map((row) => row[pos]));
  });

  const allCodes = uniqueNonEmpty(Object.values(codesByPosition).flat());

  const users = await User.find({
    code: { $in: allCodes },
    status: "active",
  })
    .select("code name position role status")
    .lean();

  const userMap = new Map(users.map((u) => [String(u.code).trim(), u]));

  hierarchy.forEach((pos) => {
    const codes = codesByPosition[pos] || [];
    output[pos] = codes.map((code) => {
      const user = userMap.get(code);
      return {
        code,
        name: user?.name || "",
        position: user?.position || pos,
      };
    });
  });

  return output;
}

module.exports = resolveSubordinates;