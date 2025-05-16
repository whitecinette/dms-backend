const express = require("express");
const router = express.Router();
const {
  getOrderForAdmin,
  editOrderForAdmin,
  deleteOrderForAdmin,
} = require("../controllers/admin/orderController");
const { adminOrSuperAdminAuth } = require("../middlewares/authmiddlewares");
const { addOrderByDealer, getAllOrdersForDealer } = require("../controllers/common/orderController");
const { userAuth } = require("../middlewares/authmiddlewares");
// get Order for admin
router.get("/order/get-order", getOrderForAdmin);
router.put(
  "/order/edit-order-by-admin/:id",
  adminOrSuperAdminAuth,
  editOrderForAdmin
);
router.delete(
  "/order/delete-order-by-admin/:id",
  adminOrSuperAdminAuth,
  deleteOrderForAdmin
);

//dealer routes
router.post("/order/add-order-by-dealer", userAuth, addOrderByDealer);
router.get("/order/get-all-orders-by-dealer", userAuth, getAllOrdersForDealer);


module.exports = router;
