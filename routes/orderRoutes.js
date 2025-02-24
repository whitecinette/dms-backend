const express = require("express");
const router = express.Router();
const {getOrderForAdmin} = require("../controllers/admin/orderController");

// get Order for admin
router.get("/order/get-order", getOrderForAdmin);


module.exports = router;