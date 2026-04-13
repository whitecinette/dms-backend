const {
  resolveFlowHierarchy,
  resolveSubordinatePositions,
  resolveSubordinates,
  resolveScope,
  resolveProductScope,
} = require("../../services/resolvers");

exports.testResolvers = async (req, res) => {
  try {
    const {
      flow_name,
      exclude_positions = ["dealer"],
      subordinate_filters = {},
      dealer_filters = {},
      product_filters = {},
      test_type = "all",
      position,
      root_code,
      root_position,
    } = req.body;

    const response = {
      success: true,
      requested_test_type: test_type,
      input: {
        flow_name,
        exclude_positions,
        subordinate_filters,
        dealer_filters,
        product_filters,
        position,
        root_code,
        root_position,
      },
      user_from_token: {
        code: req.user?.code || "",
        position: req.user?.position || "",
        role: req.user?.role || "",
        name: req.user?.name || "",
      },
    };

    if (
      ["flow", "positions", "subordinates", "scope", "all"].includes(test_type) &&
      !flow_name
    ) {
      return res.status(400).json({
        success: false,
        message: "flow_name is required for this test_type",
      });
    }

    if (test_type === "flow" || test_type === "all") {
      response.flowHierarchy = await resolveFlowHierarchy(flow_name);
    }

    if (test_type === "positions" || test_type === "all") {
      response.subordinatePositions = await resolveSubordinatePositions({
        flow_name,
        position: position || req.user.position,
        user_role: req.user.role,
      });
    }

    if (test_type === "subordinates" || test_type === "all") {
      response.subordinates = await resolveSubordinates({
        flow_name,
        root_code: root_code || req.user.code,
        root_position: root_position || req.user.position,
        exclude_positions,
        user_role: req.user.role,
      });
    }

    if (test_type === "scope" || test_type === "all") {
      response.scope = await resolveScope({
        user: req.user,
        flow_name,
        subordinate_filters,
        dealer_filters,
        exclude_positions,
      });
    }

    if (test_type === "product" || test_type === "all") {
      response.productScope = await resolveProductScope({
        product_filters,
      });
    }

    return res.json(response);
  } catch (error) {
    console.error("testResolvers error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};