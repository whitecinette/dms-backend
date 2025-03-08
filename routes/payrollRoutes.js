// routes/payrollRoutes.js
const express = require('express');
const {getAllSalaries, addSalary, getPaySlipByEmp, calculateSalary } = require('../controllers/common/payrollController');
const router = express.Router();

router.post('/add-salary', addSalary);
router.get('/calculate-salary', calculateSalary);
router.get('/salary-details', getAllSalaries);
router.get('/get-salary/:id' ,getPaySlipByEmp)

module.exports = router;
