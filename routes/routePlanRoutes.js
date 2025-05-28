const express = require("express");
const { userAuth, adminOrSuperAdminAuth } = require('../middlewares/authmiddlewares');
const { addRoutePlan, getRoutePlansForUser, getDropdownOptionsForMarketCoverageUser, getUserRoutesNamesForDropdown, deleteRoutePlanAndUpdateBeatMapping, getAllRoutePlans, editRoutePlan } = require("../controllers/common/routePlanController");
const router = express.Router();


router.post('/user/route-plan/add', userAuth, addRoutePlan);
router.post('/user/route-plan/get', userAuth, getRoutePlansForUser);
router.delete('/route-plan/delete/:routeId', userAuth, deleteRoutePlanAndUpdateBeatMapping);


// USER MODEL ROUES 
router.get("/user/market-coverage/dropdown", userAuth, getDropdownOptionsForMarketCoverageUser);

//admin
router.get("/admin/route-plan/get", adminOrSuperAdminAuth, getAllRoutePlans);
router.put("/admin/route-plan/update/:routeId", adminOrSuperAdminAuth, editRoutePlan);

module.exports = router;