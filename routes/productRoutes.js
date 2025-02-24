const express = require('express');
const router = express.Router();
const {addProductForAdmin, uploadBulkProducts, getAllProductsForAdmin, editProductForAdmin, deleteProductForAdmin } = require("../controllers/admin/productController");
const {adminOrSuperAdminAuth} = require("../middlewares/authmiddlewares");
const upload = require("../helpers/multerHelper");

//admin and super_admin routes
router.post("/product/add-product-by-admin", adminOrSuperAdminAuth, addProductForAdmin);
router.post("/product/upload-csv-by-admin", upload.single("file"), adminOrSuperAdminAuth, uploadBulkProducts );
router.get("/product/get-product-by-admin", getAllProductsForAdmin);
router.put("/product/edit-product-by-admin/:id", adminOrSuperAdminAuth, editProductForAdmin);
router.delete("/product/delete-product-by-admin/:id", adminOrSuperAdminAuth, deleteProductForAdmin);

module.exports = router;