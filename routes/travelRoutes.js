const express = require("express");
const { scheduleTravel, getAllTravelSchedule } = require("../controllers/common/travelController");
const { userAuth } = require('../middlewares/authmiddlewares');
const router = express.Router();


router.post('/schedule-travel', userAuth, scheduleTravel);

router.get('/get-all-travel-schedule', getAllTravelSchedule);
module.exports = router;