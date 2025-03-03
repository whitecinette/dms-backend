
const express = require("express");
const { addWeeklyBeatMappingSchedule, getWeeklyBeatMappingSchedule, updateWeeklyBeatMappingStatus } = require("../controllers/admin/weeklyBeatMappingScheduleController");
const { userAuth } = require('../middlewares/authmiddlewares');
const router = express.Router();

router.post("/add-weekly-beat-mapping", addWeeklyBeatMappingSchedule);
router.get('/get-weekly-beat-mapping-schedule', userAuth, getWeeklyBeatMappingSchedule);
router.put('/update-weekly-beat-mapping-status/:scheduleId/:dealerCode', updateWeeklyBeatMappingStatus);


module.exports = router;

