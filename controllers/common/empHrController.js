const ActorCode = require("../../model/ActorCode");
const ActorTypesHierarchy = require("../../model/ActorTypesHierarchy");

exports.getEmpForHr = async (req, res) => {
  const {
    page = 1,
    limit = 50,
    search = "",
    firm = null, 
  } = req.query;

  try {
    const filters = { role: "employee" }; // Filter for employees only

    // Apply search filter (case-insensitive)
    if (search) {
      const searchRegex = new RegExp(search, "i"); // Create regex once
      filters.$or = [{ name: searchRegex }, { code: searchRegex }];
    }

    // If firm is provided, fetch its hierarchy and filter employees accordingly
    if (firm) {
      const firmData = await ActorTypesHierarchy.findById(firm); // Assuming FirmModel stores firm details
      if (!firmData) {
        return res.status(400).json({ message: "Invalid firm ID." });
      }

      // Ensure hierarchy exists in firm data
      if (firmData.hierarchy && Array.isArray(firmData.hierarchy)) {
        filters.position = { $in: firmData.hierarchy }; // Filter employees based on hierarchy roles
      }
    }

    // Fetch employees with pagination and sorting
    const employees = await ActorCode.find(filters)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const totalRecords = await ActorCode.countDocuments(filters);

    if (!employees.length) {
      return res.status(404).json({ message: "No employees found." });
    }

    return res.status(200).json({
      message: "Employees fetched successfully",
      currentPage: Number(page),
      totalRecords,
      data: employees,
    });
  } catch (error) {
    console.error("Error getting employees:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching employees",
      error: error.message,
    });
  }
};
