// routes/payrollRoutes.js
const express = require('express');
const {getAllSalaries, addSalary, generatePayslipByEmp, calculateSalary } = require('../controllers/common/payrollController');
const { userAuth } = require('../middlewares/authmiddlewares');
const router = express.Router();

router.post('/calculate-salary', calculateSalary);
router.get('/salary-details', getAllSalaries);
router.get('/get-salary', userAuth, generatePayslipByEmp);

module.exports = router;
