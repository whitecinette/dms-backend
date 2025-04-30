const express = require("express");
const { uploadBulkActorCodes, addActorCode, editActorCode, getActorCodeForAdminAndSuperAdmin, deleteActorCode, getEmployeeCodeAndName } = require("../controllers/admin/actorcodeController");
const upload = require("../helpers/multerHelper");
const { adminOrSuperAdminAuth, userAuth } = require("../middlewares/authmiddlewares");
const router = express.Router();

//Actorcodes
router.get("/get-actorcode", adminOrSuperAdminAuth, getActorCodeForAdminAndSuperAdmin)
router.post("/upload-actorcode-csv", upload.single("file"), adminOrSuperAdminAuth, uploadBulkActorCodes);
router.post("/add-actorcode", adminOrSuperAdminAuth, addActorCode)
router.put("/edit-actorcode/:id", userAuth, editActorCode)
router.delete("/delete/actorcode/:id", adminOrSuperAdminAuth, deleteActorCode)

//admin
router.get("/actorCode/get-actorCode-for-admin", getEmployeeCodeAndName)

module.exports = router;