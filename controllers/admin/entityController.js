const Entity = require("../../model/Entity");

exports.addEntity = async (req, res) => {
    try {
        const { name, value, expiry, status } = req.body;

        if (!name || !value || !expiry) {
            return res.status(400).json({ error: 'Name, value, and expiry are required.' });
        }

        // Create new entity
        const newEntity = new Entity({
            name,
            value,
            expiry: new Date(expiry), // Ensure it's stored as Date
            status: status || 'inactive', // Default status
        });

        await newEntity.save();

        res.status(201).json({
            message: 'Entity added successfully',
            entity: newEntity
        });

    } catch (error) {
        console.error('Error adding entity:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

//get Entity for admin
exports.getEntityForAdmin = async (req, res) => {
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
    const entity = await Entity.find(filters)
      .sort({ [sort]: sortOrder })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const totalRecords = await Entity.countDocuments(filters);
    res.status(200).json({
      message: "All users fetched successfully",
      data: entity,
      currentPage: page,
      totalRecords,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

//edit Entity by admin
exports.editEntityForAdmin = async (req, res) => {
    try{
        const {id} = req.params;
        const update = req.body;
        if(!id){
            return res.status(400).json({ message: "Id is required"})
        }
        const data = await Entity.findByIdAndUpdate(id, update, {new: true});
        if(!data){
            return res.status(404).json({ message: "Data not found or not updated" }); 
        }
        return res.status(200).json({
            message: "Entity Updated successfully",
            data
        })
    }catch(error){
        console.log(error)
        return res.status(500).json({ message: "Internal server error" })
    }
}

//delete Entity by Admin
exports.deleteEntityByAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Id is required" });
    }

    const data = await Entity.findByIdAndDelete(id);

    if (!data) {
      return res.status(404).json({ message: "Data not found" });
    }  

    return res.status(200).json({ message: "Successfully deleted Data" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};