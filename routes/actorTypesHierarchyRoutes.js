const express = require('express');
const { addHierarchy, getActorTypesHierarchyByName, getActorTypesHierarchyByAdmin, editActorTypesHierarchyByAdmin, deleteActorTypesHierarchyByAdmin, addActorTypesHierarchyByAdmin, getAllActorType, getHierarchySubordinatesDSF } = require('../controllers/admin/actorTypesHierarchyController');
const { adminOrSuperAdminAuth, userAuth } = require('../middlewares/authmiddlewares');
const router = express.Router();

// API to add/update hierarchy
router.post('/actortypeshierarchy/add', addHierarchy);
router.get('/user/get/actor-types-hierarchy/:name', getActorTypesHierarchyByName);

//API for admin
router.get("/actorTypesHierarchy/get-by-admin",  getActorTypesHierarchyByAdmin)
router.put("/actorTypesHierarchy/edit-by-admin/:id", adminOrSuperAdminAuth, editActorTypesHierarchyByAdmin)
router.delete("/actorTypesHierarchy/delete-by-admin/:id", adminOrSuperAdminAuth, deleteActorTypesHierarchyByAdmin)
router.post("/actorTypesHierarchy/add-by-admin", adminOrSuperAdminAuth, addActorTypesHierarchyByAdmin)
router.get("/actorTypesHierarchy/get-all-by-admin", getAllActorType)

router.get("/user/get-subordinate-positions", userAuth, getHierarchySubordinatesDSF);

module.exports = router;
