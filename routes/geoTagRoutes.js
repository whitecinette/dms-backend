const express = require("express");
const { getDealerByEmployee, updateGeotagLatLong } = require("../controllers/common/geoTagController");
const { userAuth } = require("../middlewares/authmiddlewares");
const upload_img = require("../middlewares/upload");
const router = express.Router();


router.get('/get-dealer-by-employee',userAuth, getDealerByEmployee);
// update geotag picture lat and long for employee

router.put('/update-geo-tag-lat-long', upload_img.single('geotag_picture'),updateGeotagLatLong)
module.exports = router;