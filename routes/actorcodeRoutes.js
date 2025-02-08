const express = require("express");
const { uploadBulkActorCodes, addActorCode, editActorCode } = require("../controllers/admin/actorcodeController");
const upload = require("../helpers/multerHelper");
const router = express.Router();

//Actorcodes
router.post("/upload-actorcode", upload.single("file"), uploadBulkActorCodes);
router.post("/add-actorcode", addActorCode)
router.put("/edit-actorcode/:id", editActorCode)

module.exports = router;