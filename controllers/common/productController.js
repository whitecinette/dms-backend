const Product = require("../../model/Product");

exports.getAllProductsForDealer = async (req, res) => {
    try {
        const products = await Product.find({brand: "samsung"});
        if(!products) {
            return res.status(404).json({
                status: false,
                message: "No products found"
            });
        }

        res.status(200).json({
            status: true,
            data: products
        });
        
    } catch (error) {
        res.status(500).json({
            status: false,
            message: error.message
        });
    }
}