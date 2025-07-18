// routes/routePlan.js
const express = require("express");
const router = express.Router();
const upload = require("../helpers/multerHelper");
const { uploadRoutes, getRouteByUser, addRoutePlanFromSelectedRoutes, requestRoutePlan, getRequestedRoute, getRequestedRouteForAdmin } = require("../controllers/common/routeController");
const { userAuth } = require("../middlewares/authmiddlewares");

router.post("/upload-routes", upload.single("file"), uploadRoutes);
router.get("/get-route-by-user", userAuth, getRouteByUser);
router.post("/add-route-plan-by-user", userAuth, addRoutePlanFromSelectedRoutes);

router.post("/request-route-plan",userAuth, requestRoutePlan);
router.get("/get-requested-route", userAuth, getRequestedRoute);
router.get("/get-requested-route-for-admin", userAuth, getRequestedRouteForAdmin);
module.exports = router;
