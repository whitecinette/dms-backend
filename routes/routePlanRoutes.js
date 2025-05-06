const express = require("express");
const { userAuth } = require('../middlewares/authmiddlewares');
const { addRoutePlan, getRoutePlansForUser, getDropdownOptionsForMarketCoverageUser, getUserRoutesNamesForDropdown } = require("../controllers/common/routePlanController");
const router = express.Router();


router.post('/user/route-plan/add', userAuth, addRoutePlan);
router.post('/user/route-plan/get', userAuth, getRoutePlansForUser);


// USER MODEL ROUES 
router.get("/user/market-coverage/dropdown", userAuth, getDropdownOptionsForMarketCoverageUser);


module.exports = router;