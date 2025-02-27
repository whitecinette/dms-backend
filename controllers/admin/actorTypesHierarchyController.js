const ActorTypesHierarchy = require("../../model/ActorTypesHierarchy");

exports.addHierarchy = async (req, res) => {
  try {
    const { name, hierarchy } = req.body; // Expecting a name and hierarchy array

    if (!name || !hierarchy || !Array.isArray(hierarchy)) {
      return res.status(400).json({ success: false, message: "Invalid input. 'name' and 'hierarchy' array are required." });
    }

    // Ensure all elements are lowercase
    const formattedHierarchy = hierarchy.map(role => role.toLowerCase());

    // Check if a hierarchy with this name already exists
    let existingHierarchy = await ActorTypesHierarchy.findOne({ name });

    if (existingHierarchy) {
      // Update the existing hierarchy
      existingHierarchy.hierarchy = formattedHierarchy;
      await existingHierarchy.save();
      return res.status(200).json({ success: true, message: "Hierarchy updated successfully.", data: existingHierarchy });
    } else {
      // Create new hierarchy entry
      const newHierarchy = new ActorTypesHierarchy({ name, hierarchy: formattedHierarchy });
      await newHierarchy.save();
      return res.status(201).json({ success: true, message: "Hierarchy added successfully.", data: newHierarchy });
    }
  } catch (error) {
    console.error("Error in addHierarchy:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};
