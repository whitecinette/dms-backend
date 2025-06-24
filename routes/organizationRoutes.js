const { Route } = require("express");
const express = require("express");
const { createOrganization } = require("../controllers/admin/organizationController");
const router = express.Router();

router.post("/create-organization", createOrganization);
module.exports = router;