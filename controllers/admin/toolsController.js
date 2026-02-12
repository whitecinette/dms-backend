const mongoose = require("mongoose");
const ActorCode = require("../../model/ActorCode");

exports.getAllEmployeesAdmins = async (req, res) => {
  try {
    const allowedRoles = ["employee", "admin", "super_admin"];

    const users = await ActorCode.aggregate([
      {
        $match: {
          role: { $in: allowedRoles },
          status: "active"
        }
      },
      {
        $lookup: {
          from: "metadata", // collection name in MongoDB
          localField: "code",
          foreignField: "code",
          as: "meta"
        }
      },
      {
        $unwind: {
          path: "$meta",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          _id: 0,
          name: 1,
          code: 1,
          position: 1,
          role: 1,
          firm: "$meta.firm_code"
        }
      }
    ]);

    return res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });

  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};
