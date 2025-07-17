// routes/routePlan.js
const express = require("express");
const router = express.Router();
const upload = require("../helpers/multerHelper");
const { uploadRoutes, getRouteByUser, addRoutePlanFromSelectedRoutes } = require("../controllers/common/routeController");
const { userAuth } = require("../middlewares/authmiddlewares");

router.post("/upload-routes", upload.single("file"), uploadRoutes);
router.get("/get-route-by-user", userAuth, getRouteByUser);
router.post("/add-route-plan-by-user", userAuth, addRoutePlanFromSelectedRoutes);

module.exports = router;
