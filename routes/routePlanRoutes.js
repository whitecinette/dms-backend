const express = require("express");
const { userAuth } = require('../middlewares/authmiddlewares');
const { addRoutePlan } = require("../controllers/common/routePlanController");
const router = express.Router();


router.post('/user/route-plan/add', userAuth, addRoutePlan);


module.exports = router;