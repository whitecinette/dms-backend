const express = require("express");
const { userAuth } = require('../middlewares/authmiddlewares');
const { addRoutePlan, getRoutePlansForUser } = require("../controllers/common/routePlanController");
const router = express.Router();


router.post('/user/route-plan/add', userAuth, addRoutePlan);
router.post('/user/route-plan/get', userAuth, getRoutePlansForUser);


module.exports = router;