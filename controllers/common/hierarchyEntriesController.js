const ActorCode = require("../../model/ActorCode");
const HierarchyEntries = require("../../model/HierarchyEntries");


exports.getSubordinatesByCode = async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ success: false, message: "Code is required." });
    }

    // Fetch actor details (position)
    const actor = await ActorCode.findOne({ code });
    if (!actor) {
      return res.status(404).json({ success: false, message: "Actor not found." });
    }

    const { position } = actor;
    if (!position) {
      return res.status(400).json({ success: false, message: "Position not found for this user." });
    }

    // Fetch all hierarchy entries where this user appears in their position
    const hierarchyEntries = await HierarchyEntries.find({ [position]: code });

    if (!hierarchyEntries.length) {
      return res.status(200).json({ success: true, positions: [], subordinates: {} });
    }

    // Identify subordinate positions dynamically (positions below the current position)
    const allPositions = ["smd", "mdd", "asm", "ase", "rso", "tse", "dealer"];
    const userPositionIndex = allPositions.indexOf(position);
    const subordinatePositions = allPositions.slice(userPositionIndex + 1);

    // Collect subordinate codes
    let subordinateData = {};
    for (let subPosition of subordinatePositions) {
      let subCodes = hierarchyEntries.map(entry => entry[subPosition]).filter(Boolean);
      if (subCodes.length > 0) {
        subordinateData[subPosition] = subCodes;
      }
    }

    // Fetch names for subordinate codes
    let subordinatesGrouped = {};
    for (let [subPosition, codes] of Object.entries(subordinateData)) {
      let users = await ActorCode.find({ code: { $in: codes } }, { code: 1, name: 1, position: 1, _id: 0 });

      subordinatesGrouped[subPosition] = users.map(user => ({
        code: user.code,
        name: user.name,
      }));
    }

    // Return response with positions and grouped subordinates
    res.status(200).json({
      success: true,
      positions: Object.keys(subordinateData),
      subordinates: subordinatesGrouped
    });

  } catch (error) {
    console.error("Error in getSubordinates:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.getSubordinatesForUser = async (req, res) => {
    try {
      const { code } = req;
      if (!code) {
        return res.status(400).json({ success: false, message: "Code is required." });
      }
  
      // Fetch actor details (position)
      const actor = await ActorCode.findOne({ code });
      if (!actor) {
        return res.status(404).json({ success: false, message: "Actor not found." });
      }
  
      const { position } = actor;
      if (!position) {
        return res.status(400).json({ success: false, message: "Position not found for this user." });
      }
  
      // Fetch all hierarchy entries where this user appears in their position
      const hierarchyEntries = await HierarchyEntries.find({ [position]: code });
  
      if (!hierarchyEntries.length) {
        return res.status(200).json({ success: true, positions: [], subordinates: {} });
      }
  
      // Identify subordinate positions dynamically (positions below the current position)
      const allPositions = ["smd", "mdd", "asm", "ase", "rso", "tse", "dealer"];
      const userPositionIndex = allPositions.indexOf(position);
      const subordinatePositions = allPositions.slice(userPositionIndex + 1);
  
      // Collect subordinate codes
      let subordinateData = {};
      for (let subPosition of subordinatePositions) {
        let subCodes = hierarchyEntries.map(entry => entry[subPosition]).filter(Boolean);
        if (subCodes.length > 0) {
          subordinateData[subPosition] = subCodes;
        }
      }
  
      // Fetch names for subordinate codes
      let subordinatesGrouped = {};
      for (let [subPosition, codes] of Object.entries(subordinateData)) {
        let users = await ActorCode.find({ code: { $in: codes } }, { code: 1, name: 1, position: 1, _id: 0 });
  
        subordinatesGrouped[subPosition] = users.map(user => ({
          code: user.code,
          name: user.name,
        }));
      }
  
      // Return response with positions and grouped subordinates
      res.status(200).json({
        success: true,
        positions: Object.keys(subordinateData),
        subordinates: subordinatesGrouped
      });
  
    } catch (error) {
      console.error("Error in getSubordinates:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  };
  