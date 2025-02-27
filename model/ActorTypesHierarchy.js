const mongoose = require('mongoose');

const actorTypesHierarchySchema = new mongoose.Schema(
    {
    name: { type: String, required: true, unique: true },
    hierarchy: [{ type: String, required: true }] // e.g. ["SZD", "ASM", "ZSM", "MDD", "TSE", "Dealer"]
    },
    {
        timestamps: true, // Automatically adds createdAt & updatedAt
        strict: false, // Allows flexible schema updates
    }
);

module.exports = mongoose.model('ActorTypesHierarchy', actorTypesHierarchySchema);
