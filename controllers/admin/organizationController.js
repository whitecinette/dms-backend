const Organization = require("../../model/Organization");


exports.createOrganization = async (req, res) => {
  try {
    const { code, name, description, metadata } = req.body;

    const org = new Organization({ name, description, metadata, code });
    await org.save();

    return res.status(201).json({
      success: true,
      message: 'Organization created successfully',
      data: org
    });
  } catch (error) {
    console.error("❌ Error creating organization:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create organization",
      error: error.message
    });
  }
};
