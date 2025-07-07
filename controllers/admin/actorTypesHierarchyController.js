const { captureRejectionSymbol } = require("nodemailer/lib/xoauth2");
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

exports.getActorTypesHierarchyByName = async (req, res) => {
  try {
      const { name } = req.params;
      if (!name) {
          return res.status(400).json({ success: false, message: 'Name parameter is required' });
      }

      const actorHierarchy = await ActorTypesHierarchy.findOne({ name });
      
      if (!actorHierarchy) {
          return res.status(404).json({ success: false, message: 'Actor hierarchy not found' });
      }

      return res.status(200).json({ success: true, data: actorHierarchy.hierarchy });
  } catch (error) {
      console.error('Error fetching actor hierarchy:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

//get ActorTypesHierarchy by admin
exports.getActorTypesHierarchyByAdmin = async(req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      sort = "createdAt",
      order = "",
      search = "",
    } = req.query;
    const filters = {};
    if (search) {
      filters.$or = [{ name: { $regex: search, $options: "i" } }];
    }
    const sortOrder = order === "-1" ? -1 : 1;
    const actorTypesHierarchy = await ActorTypesHierarchy.find(filters)
      .sort({ [sort]: sortOrder })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));
    
    const totalRecords = await ActorTypesHierarchy.countDocuments(filters);
    res.status(200).json({
      message: "All users fetched successfully",
      data: actorTypesHierarchy,
      currentPage: page,
      totalRecords
    })
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

//Edit ActorTypesHierarchy by admin
exports.editActorTypesHierarchyByAdmin = async (req, res) => {
  try {
    const { id } = req.params; // Extract id correctly
    const update = req.body;

    if (!id) {
      return res.status(400).json({ message: "Id is required" }); 
    }

    const updateData = await ActorTypesHierarchy.findByIdAndUpdate(id, update, { new: true });

    if (!updateData) {
      return res.status(404).json({ message: "Data not found or not updated" }); 
    }

    return res.status(200).json({ 
      message: "Data updated successfully",
      updateData,
    });
  } catch (error) {
    console.error("Error updating Actor Types Hierarchy:", error);
    return res.status(500).json({ message: "Internal server error" }); 
  }
};

//delete ActorTypesHierarchy by admin
exports.deleteActorTypesHierarchyByAdmin = async(req, res) => {
  try{
    const {id} = req.params;
    
    if(!id){
      return res.status(400).json({message: "Id is required"});
    }

    const data = await ActorTypesHierarchy.findByIdAndDelete(id);
    
    if(!data){
      return res.status(404).json({message: "Data not found"});
    }

    return res.status(200).json({message: "Successfully deleted Data"});
  }catch(error){
    console.log(error)
    return res.status(500).json({message: "Internal server error"});
  }
}

//Add ActorTypesHierarchy by admin
exports.addActorTypesHierarchyByAdmin = async(req, res) => {
  try{
    const { name, hierarchy } = req.body;
    const data = req.body

    if(!name){
      return res.status(400).json({ message: "Name fields is require" })
    }

    const existing = await ActorTypesHierarchy.findOne({name})

    if(existing){
      return res.status(404).json({ message : "Actor Type with this name already exist"})
    }
    const create = await ActorTypesHierarchy.create(data);
    
    if(!create){
      return res.status(304).json({ message: "Failed to create Actor Types Hierarchy" });
    }

    return res.status(201).json({
      message: "Successfully created  Actor Types Hierarchy",
      data: create
    })

  }catch(error){
    console.log(error)
    return res.status(500).json({ message: "Internal server error" })
  }
}

exports.getAllActorType = async(req, res) =>{
  try{
    const actorHierarchy = await ActorTypesHierarchy.find()
    return res.status(200).json({
      message:"Successfully get Actor Hierarchy",
      data: actorHierarchy
    })
  }catch(error){
    console.log(error)
    return res.status(500).json({ message: "Internal server error" })
  }
}


exports.getHierarchySubordinatesDSF = async (req, res) => {
  try {
    const userPosition = req.user?.position?.toLowerCase();
    const userRole = req.user?.role?.toLowerCase();
    console.log("eac", userRole);

    const hierarchyDoc = await ActorTypesHierarchy.findOne({ name: 'default_sales_flow' });
    if (!hierarchyDoc) {
      return res.status(404).json({ error: 'Hierarchy not found' });
    }

    const hierarchy = hierarchyDoc.hierarchy;

    // If user is admin, return all positions
    if (userRole === 'admin') {
      return res.json({ position: userPosition || 'admin', subordinates: hierarchy });
    }

    if (!userPosition) {
      return res.status(400).json({ error: 'User position not found' });
    }

    const index = hierarchy.indexOf(userPosition);

    if (index === -1) {
      return res.status(400).json({ error: 'User position not in hierarchy' });
    }

    const subordinates = hierarchy.slice(index + 1).filter(pos => pos !== 'dealer');
    console.log("Sub: ", subordinates)
    return res.json({ position: userPosition, subordinates });


  } catch (err) {
    console.error('Error fetching hierarchy:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};