const resolveFlowHierarchy = require("./resolveFlowHierarchy");

async function resolveSubordinatePositions({ flow_name, position, user_role }) {
  const hierarchy = await resolveFlowHierarchy(flow_name);

  const normalizedRole = String(user_role || "").trim().toLowerCase();
  const normalizedPosition = String(position || "").trim().toLowerCase();

  const isAdmin =
    normalizedRole === "admin" ||
    normalizedRole === "super_admin" ||
    normalizedRole === "hr";

  if (isAdmin) {
    if (!normalizedPosition) {
      return hierarchy;
    }

    const idx = hierarchy.indexOf(normalizedPosition);
    if (idx === -1) {
      throw new Error(
        `Position "${normalizedPosition}" not found in flow "${flow_name}"`
      );
    }

    return hierarchy.slice(idx + 1);
  }

  if (!normalizedPosition) {
    throw new Error("position is required");
  }

  const idx = hierarchy.indexOf(normalizedPosition);
  if (idx === -1) {
    throw new Error(
      `Position "${normalizedPosition}" not found in flow "${flow_name}"`
    );
  }

  return hierarchy.slice(idx + 1);
}

module.exports = resolveSubordinatePositions;