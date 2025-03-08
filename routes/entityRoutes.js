const express = require('express');
const { addEntity, getEntityForAdmin, editEntityForAdmin, deleteEntityByAdmin } = require('../controllers/admin/entityController');
const { adminOrSuperAdminAuth } = require('../middlewares/authmiddlewares');
const router = express.Router();

router.post("/entity/add", addEntity);

//API for admin
router.get("/entity/get-for-admin", getEntityForAdmin);
router.put("/entity/edit-by-admin/:id", adminOrSuperAdminAuth, editEntityForAdmin);
router.delete("/entity/delete-by-admin/:id", adminOrSuperAdminAuth, deleteEntityByAdmin);

module.exports = router;