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
