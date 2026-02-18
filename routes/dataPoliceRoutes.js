const express = require("express");
const { adminOrSuperAdminAuth } = require("../middlewares/authmiddlewares");
const { getUnmappedProducts } = require("../controllers/new/dataPolice");
const router = express.Router();


router.get("/police/unmapped-products", adminOrSuperAdminAuth, getUnmappedProducts);

module.exports = router;