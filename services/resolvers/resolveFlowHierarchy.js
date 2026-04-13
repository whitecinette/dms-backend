const ActorTypesHierarchy = require("../../model/ActorTypesHierarchy");

async function resolveFlowHierarchy(flowName) {
  if (!flowName || typeof flowName !== "string") {
    throw new Error("flow_name is required");
  }

  const flow = await ActorTypesHierarchy.findOne({
    name: String(flowName).trim(),
  }).lean();

  if (!flow) {
    throw new Error(`Flow not found: ${flowName}`);
  }

  const hierarchy = Array.isArray(flow.hierarchy)
    ? flow.hierarchy
        .map((p) => String(p || "").trim().toLowerCase())
        .filter(Boolean)
    : [];

  if (!hierarchy.length) {
    throw new Error(`No hierarchy positions configured for flow: ${flowName}`);
  }

  return hierarchy;
}

module.exports = resolveFlowHierarchy;