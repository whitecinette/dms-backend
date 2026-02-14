const express = require("express");
const {adminOrSuperAdminAuth, userAuth} = require("../middlewares/authmiddlewares");
const { upload } = require("../services/fileUpload");
const { uploadProductMaster, getAllProducts } = require("../controllers/new/productMasterController");

const router = express.Router();

router.post("/product-master/upload", adminOrSuperAdminAuth, upload.single("file"), uploadProductMaster);

router.get(
  "/product-master",
  userAuth,
  getAllProducts
);


module.exports = router;