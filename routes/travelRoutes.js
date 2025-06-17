const express = require("express");
const { scheduleTravel, getAllTravelSchedule, uploadBills, getBillsForEmp, getTravelBills, editTravelBill } = require("../controllers/common/travelController");
const { userAuth } = require('../middlewares/authmiddlewares');
const upload_img = require("../middlewares/upload");
const router = express.Router();

// bill upload
router.post("/upload-bills", userAuth, upload_img.array("billsUpload", 10), uploadBills);
router.get("/get-bills-for-admin", userAuth, getTravelBills);
router.get("/get-bills-for-emp", userAuth, getBillsForEmp);
router.put("/edit-travel-bill/:id", userAuth, editTravelBill);
module.exports = router;