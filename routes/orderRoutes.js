const express = require("express");
const router = express.Router();
const {getOrderForAdmin, editOrderForAdmin, deleteOrderForAdmin} = require("../controllers/admin/orderController");
const { adminOrSuperAdminAuth } = require("../middlewares/authmiddlewares");

// get Order for admin
router.get("/order/get-order", getOrderForAdmin);
router.put("/order/edit-order-by-admin/:id", adminOrSuperAdminAuth, editOrderForAdmin);
router.delete("/order/delete-order-by-admin/:id", adminOrSuperAdminAuth, deleteOrderForAdmin)

module.exports = router;