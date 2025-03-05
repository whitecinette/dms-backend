
const express = require("express");
const { addWeeklyBeatMappingSchedule, getWeeklyBeatMappingSchedule, updateWeeklyBeatMappingStatus, updateWeeklyBeatMappingStatusWithProximity, addWeeklyBeatMappingUsingCSV } = require("../controllers/admin/weeklyBeatMappingScheduleController");
const { userAuth } = require('../middlewares/authmiddlewares');
const { upload } = require('../services/fileUpload');
const router = express.Router();

router.post("/add-weekly-beat-mapping", addWeeklyBeatMappingSchedule);
router.get('/get-weekly-beat-mapping-schedule', userAuth, getWeeklyBeatMappingSchedule);
router.put('/update-weekly-beat-mapping-status/:scheduleId/:dealerCode', updateWeeklyBeatMappingStatus);
router.put('/update-beat-mapping-status-proximity/:scheduleId/:code', updateWeeklyBeatMappingStatusWithProximity)
router.post('/add-beat-mapping-using-csv', upload.single("file"), addWeeklyBeatMappingUsingCSV);

module.exports = router;

