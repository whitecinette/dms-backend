const express = require('express');
const router = express.Router();
const {addProductForAdmin, uploadBulkProducts, getAllProductsForAdmin,  editProductForAdmin, deleteProductForAdmin, getAllProducts, uploadProductsThroughCSV, getProductById, getUniqueBrands, getProductsByBrand, updateProducts } = require("../controllers/admin/productController");
const {getAllProductsForDealer} = require("../controllers/common/productController");
const {adminOrSuperAdminAuth} = require("../middlewares/authmiddlewares");
const { upload } = require('../services/fileUpload');
// const upload = require("../helpers/multerHelper");

//admin and super_admin routes
router.post("/product/add-product-by-admin", adminOrSuperAdminAuth, addProductForAdmin);
router.post("/product/upload-csv-by-admin", upload.single("file"), adminOrSuperAdminAuth, uploadBulkProducts );
router.get("/product/get-product-by-admin", getAllProductsForAdmin);
router.put("/product/edit-product-by-admin/:id", adminOrSuperAdminAuth, editProductForAdmin);
router.delete("/product/delete-product-by-admin/:id", adminOrSuperAdminAuth, deleteProductForAdmin);

//get all products to edit order
router.get("/product/get-all-products-for-admin", getAllProducts);


// Rakshita 
router.post("/products/upload-csv", upload.single("file"), uploadProductsThroughCSV);

// h.D.s
router.get("/product/by-id/:productId", getProductById);

router.get("/user/get-unique-brands", getUniqueBrands);
router.post("/user/get-products-by-brand", getProductsByBrand);

//dealer routes
router.get("/dealer/get-all-products", getAllProductsForDealer);    

// update products 
router.put("/product/update-products", upload.single("file"), updateProducts);
module.exports = router;