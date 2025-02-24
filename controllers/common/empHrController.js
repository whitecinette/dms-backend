const ActorCode = require("../../model/ActorCode");

exports.getEmpForHr = async (req, res) => {
  try {
    const employees = await ActorCode.find({});
    const totalEmployees = await ActorCode.countDocuments({});

    res.status(200).json({
      success: true,
      total: totalEmployees,
      data: employees,
      message: "Employees fetched successfully"
    });
  } catch (error) {
    console.error("Error getting employees:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching employees",
      error: error.message
    });
  }
};
