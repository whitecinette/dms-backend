const express = require("express");
const { uploadBulkActorCodes, addActorCode, editActorCode, getActorCodeForAdminAndSuperAdmin, deleteActorCode, getEmployeeCodeAndName } = require("../controllers/admin/actorcodeController");
const upload = require("../helpers/multerHelper");
const { adminOrSuperAdminAuth } = require("../middlewares/authmiddlewares");
const router = express.Router();

//Actorcodes
router.get("/get-actorcode", adminOrSuperAdminAuth, getActorCodeForAdminAndSuperAdmin)
router.post("/upload-actorcode-csv", upload.single("file"), uploadBulkActorCodes);
router.post("/add-actorcode", addActorCode)
router.put("/edit-actorcode/:id", editActorCode)
router.delete("/delete/actorcode/:id", deleteActorCode)

//admin
router.get("/actorCode/get-actorCode-for-admin", getEmployeeCodeAndName)

module.exports = router;