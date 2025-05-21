const Product = require("../../model/Product");

exports.getAllProductsForDealer = async (req, res) => {
 try {
   const products = await Product.aggregate([
     {
       $match: {
         brand: "samsung",
         isAvailable: true, // ✅ Only include available products
       },
     },
     {
       $group: {
         _id: "$product_name",
         product: { $first: "$$ROOT" },
       },
     },
     {
       $replaceRoot: { newRoot: "$product" },
     },
   ]);

   if (!products || products.length === 0) {
     return res.status(404).json({
       status: false,
       message: "No products found",
     });
   }

   res.status(200).json({
     status: true,
     data: products,
   });
 } catch (error) {
   res.status(500).json({
     status: false,
     message: error.message,
   });
 }
};

