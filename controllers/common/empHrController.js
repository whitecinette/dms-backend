const ActorCode = require("../../model/ActorCode");

exports.getEmpForHr = async (req, res) => {
  const {
    page = 1,
    limit = 50,
    search = "",
  } = req.query;

  try {
    const filters = { role: "employee" }; // Filter for employees only

    // Search filter (case-insensitive)
    if (search) {
      const searchRegex = new RegExp(search, "i"); // Create regex once
      filters.$or = [{ name: searchRegex }, { code: searchRegex }]; // Adjust fields as necessary
    }

    // Fetch employees with pagination and sorting
    const employees = await ActorCode.find(filters)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const totalRecords = await ActorCode.countDocuments(filters);

    if (!employees || employees.length === 0) {
      return res.status(404).json({ message: "No employees found." });
    }

    return res.status(200).json({
      message: "Employees fetched successfully",
      currentPage: page,
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
