// routes/payrollRoutes.js
const express = require('express');
const {getAllSalaries, addSalary, getPaySlipByEmp } = require('../controllers/common/payrollController');
const router = express.Router();

router.post('/calculate-salary', addSalary);
router.get('/salary-details', getAllSalaries);
router.get('/get-salary/:id' ,getPaySlipByEmp)

module.exports = router;
