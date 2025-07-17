// routes/payrollRoutes.js
const express = require('express');
const {getAllSalaries, addSalary, generatePayslipByEmp, calculateSalary, generateSalary, getPayroll,
    getPayrollOverviewForAdmin
} = require('../controllers/common/payrollController');
const { userAuth, adminAuth, adminOrSuperAdminAuth } = require('../middlewares/authmiddlewares');
const router = express.Router();

router.post('/calculate-salary', calculateSalary);
router.get('/salary-details', getAllSalaries);
router.get('/get-salary', userAuth, generatePayslipByEmp);
router.post('/generate-payroll', userAuth, generateSalary);

// admin routes
router.get('/admin/get-payroll', userAuth, getPayroll);
router.get("/admin/get-overall-payroll", userAuth, getPayrollOverviewForAdmin);

module.exports = router;
