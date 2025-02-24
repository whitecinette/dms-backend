const express = require('express');
const { getEmpForHr } = require('../controllers/common/empHrController');
const router = express.Router();

router.get('/get-emp-for-hr',getEmpForHr);
module.exports = router;