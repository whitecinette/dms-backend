const Product = require("../../model/Product");
const fs = require("fs");
const csvParser = require("csv-parser");
const {generateProductCode} = require("../../helpers/productHelper")

// Add Product for Admin
exports.addProductForAdmin = async (req, res) => {
  try {
    const { Brand, Model, Price, Category, Status, Segment, Specs } = req.body;

    // Check if all required fields are provided
    if (!Brand || !Model || !Price || !Category || !Status) {
      return res.status(400).json({ message: "All required fields must be provided." });
    }

    // Check if a product with the same Brand & Model already exists
    const existingProduct = await Product.findOne({ Brand, Model });

    if (existingProduct) {
      return res.status(400).json({ message: "A product with this Brand and Model already exists." });
    }

    // Generate a unique ProductCode
    const productCode = await generateProductCode(Model);
    const categoryLowerCase = Category.toLowerCase(); 
    // Create the new product
    const product = await Product.create({
      Brand,
      Model,
      Price,
      Category: categoryLowerCase,
      Status,
      Segment,
      Specs,
      ProductCode: productCode,
    });

    return res.status(200).json({
      message: "Product added successfully.",
      data: product,
    });

  } catch (error) {
    console.error("Error in adding product for admin:", error);
    res.status(500).json({ message: "Internal server error. Please try again." });
  }
};

// Upload CSV for Admin
exports.uploadBulkProducts = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "CSV file is required." });
    }

    const results = [];
    const errors = [];
    const filePath = req.file.path;

    fs.createReadStream(filePath)
      .pipe(csvParser({ mapHeaders: ({ header }) => header.toLowerCase().trim() })) // Normalize headers
      .on("data", async(row) => {
        if (!row.brand || !row.model || !row.price || !row.category || !row.status) {
          errors.push({ row, message: "Missing required fields" });
        } else {
          const productCode = await generateProductCode(row.model);
          results.push({
            Brand: row.brand,
            Model: row.model,
            ProductCode: productCode,
            Price: parseFloat(row.price),
            Segment: row.segment || null,
            Category: row.category.toLowerCase(),
            Status: row.status.toLowerCase(),
            Specs: row.specs || null,
          });
        }
      })
      .on("end", async () => {
        try {
          const insertedData = [];
          const updatedData = [];

          for (const data of results) {
            existingProduct = await Product.findOne({ Brand: data.Brand, Model: data.Model });

            if (existingProduct) {
              existingProduct.Price = data.Price;
              existingProduct.Segment = data.Segment;
              existingProduct.Category = data.Category;
              existingProduct.Status = data.Status;
              existingProduct.Specs = data.Specs;

              await existingProduct.save();
              updatedData.push(existingProduct);
            } else {
              const newProduct = new Product(data);
              await newProduct.save();
              insertedData.push(newProduct);
            }
          }

          fs.unlinkSync(filePath);

          res.status(200).json({
            message: "CSV processed successfully",
            insertedCount: insertedData.length,
            updatedCount: updatedData.length,
            errors: errors,
          });
        } catch (err) {
          console.error("Error processing CSV:", err);
          res.status(500).json({ message: "Internal server error." });
        }
      });
  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};


//get all products for admin
exports.getAllProductsForAdmin = async (req, res) => {
    const {
        page = 1,
        limit = 50,
        sort = "createdAt",
        order = "" ,
        search = "",
        category = "",
    } = req.query;
    try {
        const filters = {};
        // Ensure order is a number
        const sortOrder = order === "-1" ? -1 : 1;
        // Search filter (case-insensitive)
        if (search) {
          const searchRegex = new RegExp(search, "i"); // Create regex once
          filters.$or = [
              { Brand: searchRegex },
              { Model: searchRegex },
              { Category: searchRegex },
              { Status: searchRegex },
              { Specs: searchRegex }
          ];
      
          // If the search term is a number, add it to the price filter
          if (!isNaN(search)) {
              filters.$or.push({ Price: Number(search) });
          }
      }
        if(category){
            filters.Category = category;
        }
        const product = await Product.find(filters)
            .sort({ [sort]: sortOrder })
            .limit(Number(limit))
            .skip((Number(page)-1) * Number(limit))
        const totalRecords = await Product.countDocuments(filters)
        if(!product){
            res.status(400).json({error:"Product not found"})
        }
        res.status(200).json({
            message: "All users fetched successfully",
            currentPage: Number(page),
            totalRecords,
            data: product,
        })
    }catch (error) {
        console.error("Error in getting all products for admin:", error);
        res.status(500).json({ message: "Internal server error." });
    }
}

//edit product for admin
exports.editProductForAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!id) {
      return res.status(400).json({ message: "Product ID is required." });
    }

    const updatedProduct = await Product.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!updatedProduct) {
      return res.status(404).json({ message: "Product not found." });
    }

    res.status(200).json({
      message: "Product updated successfully.",
      data: updatedProduct,
    });
  } catch (error) {
    console.error("Error in editing product for admin:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

//delete product for admin
exports.deleteProductForAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Product ID is required." });
    }

    const deletedProduct = await Product.findByIdAndDelete(id);

    if (!deletedProduct) {
      return res.status(404).json({ message: "Product not found." });
    }

    res.status(200).json({
      message: "Product deleted successfully."
    });
  } catch (error) {
    console.error("Error in deleting product for admin:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};
