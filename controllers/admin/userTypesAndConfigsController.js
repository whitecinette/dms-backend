const UserTypesAndConfigs = require("../../model/UserTypesAndConfigs");
const User = require('../../model/User');

exports.createUserTypeConfig = async (req, res) => {
  try {
    const payload = req.body;

    // Validate required fields
    if (!payload.firm_code || !payload.type_name || !payload.user_codes) {
      return res.status(400).json({ message: "firm_code, type_name, and user_codes are required." });
    }

    // Save directly (schema allows extra fields)
    const newConfig = new UserTypesAndConfigs(payload);
    await newConfig.save();

    return res.status(201).json({ message: "Config created successfully", data: newConfig });
  } catch (error) {
    console.error("Error creating config:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

 // adjust the path as per your structure

exports.getAllUsersToSelect = async (req, res) => {
  try {
    console.log("geta all users ")
    const { search } = req.query;

    let filter = {};

    if (search) {
      const regex = new RegExp(search, 'i'); // case-insensitive partial match

      filter = {
        $or: [
          { name: regex },
          { position: regex },
          { code: regex },
          { role: regex }
        ]
      };
    }

    const users = await User.find(filter).select('-password -__v');
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

