const express = require('express');
const { addHierarchy, getActorTypesHierarchyByAdmin, editActorTypesHierarchyByAdmin, deleteActorTypesHierarchyByAdmin, addActorTypesHierarchyByAdmin } = require('../controllers/admin/actorTypesHierarchyController');
const { adminOrSuperAdminAuth } = require('../middlewares/authmiddlewares');
const router = express.Router();

// API to add/update hierarchy
router.post('/actortypeshierarchy/add', addHierarchy);

//API for admin
router.get("/actorTypesHierarchyController/get-by-admin",  getActorTypesHierarchyByAdmin)
router.put("/actorTypesHierarchyController/edit-by-admin/:id", adminOrSuperAdminAuth, editActorTypesHierarchyByAdmin)
router.delete("/actorTypesHierarchyController/delete-by-admin/:id", adminOrSuperAdminAuth, deleteActorTypesHierarchyByAdmin)
router.post("/actorTypesHierarchyController/add-by-admin", adminOrSuperAdminAuth, addActorTypesHierarchyByAdmin)

module.exports = router;
