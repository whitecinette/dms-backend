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



exports.bulkUploadUserTypeConfigs = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "CSV file is required" });
    }

    const results = [];
    const filePath = path.join(__dirname, "../uploads", req.file.filename);

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        results.push(row);
      })
      .on("end", async () => {
        try {
          const grouped = {};

          // Group CSV rows
          results.forEach((row) => {
            const key = `${row.type_name}_${row.firm_code}_${row.flow_name}`;
            if (!grouped[key]) {
              grouped[key] = {
                typeName: row.type_name,
                firmCode: row.firm_code,
                flowName: row.flow_name,
                userCodes: [],
                extraConfigs: {}
              };
            }

            if (row.user_code) grouped[key].userCodes.push(row.user_code);

            if (row.extra_field_1 && row.extra_field_1.trim() !== "") {
              grouped[key].extraConfigs["extra_field_1"] = row.extra_field_1;
            }
          });

          const bulkOps = Object.values(grouped).map((payload) => ({
            updateOne: {
              filter: {
                firmCode: payload.firmCode,
                typeName: payload.typeName,
                flowName: payload.flowName,
              },
              update: {
                $set: {
                  extraConfigs: payload.extraConfigs,
                  updatedAt: new Date(),
                },
                $addToSet: {
                  userCodes: { $each: payload.userCodes }, // ensures no duplicate codes
                },
              },
              upsert: true, // create if not exists
            },
          }));

          const result = await UserTypesAndConfigs.bulkWrite(bulkOps);

          return res.status(201).json({
            message: "Bulk configs uploaded successfully",
            result,
          });
        } catch (err) {
          console.error("Error saving bulk configs:", err);
          return res.status(500).json({ message: "Failed to process CSV" });
        }
      });
  } catch (error) {
    console.error("Bulk upload error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

