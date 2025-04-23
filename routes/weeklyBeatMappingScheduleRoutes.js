
const express = require("express");
const { addWeeklyBeatMappingSchedule, getWeeklyBeatMappingSchedule, updateWeeklyBeatMappingStatus, updateWeeklyBeatMappingStatusWithProximity, addWeeklyBeatMappingUsingCSV, getWeeklyBeatMappingScheduleForAdmin,editWeeklyBeatMappingScheduleByAdmin, getAllWeeklyBeatMapping, addDailyBeatMapping, getBeatMappingReport, getDropdownValuesForBeatMappingFilters, markDealerDone, getEmployeeSchedulesByCode, editEmployeeSchedulesByCode } = require("../controllers/admin/weeklyBeatMappingScheduleController");
const { userAuth, adminOrSuperAdminAuth } = require('../middlewares/authmiddlewares');
const { upload } = require('../services/fileUpload');
const router = express.Router();

router.post("/add-weekly-beat-mapping", addWeeklyBeatMappingSchedule);
router.get('/get-weekly-beat-mapping-schedule', userAuth, getWeeklyBeatMappingSchedule);
router.put('/update-weekly-beat-mapping-status/:scheduleId/:dealerCode', updateWeeklyBeatMappingStatus);
router.put('/update-beat-mapping-status-proximity/:scheduleId/:code', updateWeeklyBeatMappingStatusWithProximity)
router.post('/add-beat-mapping-using-csv', upload.single("file"), addWeeklyBeatMappingUsingCSV);

//admin
router.get("/get-weekly-beat-mapping-schedule-for-admin", getWeeklyBeatMappingScheduleForAdmin)
// router.put("/edit-weekly-beat-mapping-schedule-for-admin/:id", adminOrSuperAdminAuth, editWeeklyBeatMappingScheduleByAdmin)
router.get('/get-all-weekly-beat-mapping', getAllWeeklyBeatMapping);
router.get('/get-weekly-beat-mapping-schedule-for-admin-by-code/:code', getEmployeeSchedulesByCode);
router.put('/edit-weekly-beat-mapping-schedule-for-admin-by-code/:code', adminOrSuperAdminAuth, editEmployeeSchedulesByCode);


// Rakshita New 
// admin
router.put("/add-daily-beat-mapping", addDailyBeatMapping);
router.post("/get-beat-mapping-report", userAuth, getBeatMappingReport);
router.get("/beat-mapping/dropdown", getDropdownValuesForBeatMappingFilters);
router.put("/beat-mapping/mark-done", userAuth, markDealerDone);

module.exports = router;

