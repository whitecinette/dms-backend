const express = require("express");
const upload = require("../helpers/multerHelper");
const { adminOrSuperAdminAuth, userAuth } = require("../middlewares/authmiddlewares");
const { getMddWiseTargets, uploadMddWiseTargets } = require("../controllers/admin/mddWiseTargetControllerNew");
const router = express.Router();

router.post("/upload/mdd-wise-targets", upload.single("file"), userAuth, uploadMddWiseTargets);
router.get("/get/mdd-wise-targets", userAuth, getMddWiseTargets);


module.exports = router;