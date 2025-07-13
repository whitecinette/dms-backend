const express = require("express");
const router = express.Router();
const { addPayrollPolicies, getAllPolicyConfigs } = require("../controllers/common/payrollPolicyController");
const { adminOrSuperAdminAuth } = require("../middlewares/authmiddlewares");

router.post("/add-payroll-policy", adminOrSuperAdminAuth, addPayrollPolicies);
router.get("/get-all-payroll-policy", getAllPolicyConfigs);

module.exports = router;
