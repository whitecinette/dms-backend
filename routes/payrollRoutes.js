const express = require("express");
const { bulkGeneratePayroll, getAllPayrolls, downloadPayroll, uploadPayrollThroughCSV, getPayrollSummary, getLeavesInfo, updateLeaveAdjustment, bulkUpdateLeaves, getUserExpenses, getPayrollOverviewForCharts, getPayrollExpenseInsightsForCharts } = require("../controllers/admin/payrollController");
const router = express.Router();
const { upload } = require('../services/fileUpload');

// 🔹 Bulk Payroll Upsert (Generate/Update payroll for firms)
router.post("/payroll/bulk-generate", bulkGeneratePayroll);
router.get("/get-all-payrolls", getAllPayrolls);

router.get("/payroll/download", downloadPayroll);

router.put(
  "/payroll/upload/csv",
  upload.single("file"), uploadPayrollThroughCSV
);

router.post("/payroll/summary/two-blocks", getPayrollSummary);

router.get("/leaves-info", getLeavesInfo);
router.put("/leave-adjustment", updateLeaveAdjustment);

router.put("/leaves/bulk-update", bulkUpdateLeaves);

router.get("/expenses", getUserExpenses);

// charts 
router.post("/charts/payroll/overview", getPayrollOverviewForCharts);
router.post("/charts/payroll/insights", getPayrollExpenseInsightsForCharts);





module.exports = router;




// // routes/payrollRoutes.js
// const express = require('express');
// const {getAllSalaries, addSalary, generatePayslipByEmp, calculateSalary, generateSalary, getPayroll,
//     getPayrollOverviewForAdmin
// } = require('../controllers/common/payrollController');
// const { userAuth, adminAuth, adminOrSuperAdminAuth } = require('../middlewares/authmiddlewares');
// const router = express.Router();

// router.post('/calculate-salary', calculateSalary);
// router.get('/salary-details', getAllSalaries);
// router.get('/get-salary', userAuth, generatePayslipByEmp);
// router.post('/generate-payroll', userAuth, generateSalary);

// // admin routes
// router.get('/admin/get-payroll', userAuth, getPayroll);
// router.get("/admin/get-overall-payroll", userAuth, getPayrollOverviewForAdmin);

// module.exports = router;
