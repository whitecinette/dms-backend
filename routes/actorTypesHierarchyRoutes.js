const express = require('express');
const { addHierarchy } = require('../controllers/admin/actorTypesHierarchyController');
const router = express.Router();

// API to add/update hierarchy
router.post('/actortypeshierarchy/add', addHierarchy);

module.exports = router;
