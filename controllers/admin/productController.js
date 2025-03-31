const Product = require("../../model/Product");
const fs = require("fs");
const csvParser = require("csv-parser");
const { generateProductCode, cleanHeader, determinesegment, generateIdentifier, determineSegment } = require("../../helpers/productHelper");
const { Readable } = require("stream");
const stream = require("stream");

// Add Product for Admin
exports.addProductForAdmin = async (req, res) => {
  try {
    const { brand, product_name, price, product_category, status, segment, } = req.body;

    // Check if all required fields are provided
    if (!brand || !product_name || !price || !product_category || !status) {
      return res
        .status(400)
        .json({ message: "All required fields must be provided." });
    }

    // Check if a product with the same brand & product_name already exists
    const existingProduct = await Product.findOne({ brand, product_name });

    if (existingProduct) {
      return res
        .status(400)
        .json({
          message: "A product with this brand and product_name already exists.",
        });
    }

    // Generate a unique ProductCode
    const productCode = await generateProductCode(product_name);
    const product_categoryLowerCase = product_category.toLowerCase();
    // Create the new product
    const product = await Product.create({
      brand,
      product_name,
      price,
      product_category: product_categoryLowerCase,
      status,
      segment,
      model_code: productCode,
    });

    return res.status(200).json({
      message: "Product added successfully.",
      data: product,
    });
  } catch (error) {
    console.error("Error in adding product for admin:", error);
    res
      .status(500)
      .json({ message: "Internal server error. Please try again." });
  }
};

// Upload CSV for Admin
exports.uploadBulkProducts = async (req, res) => {
  try {
    console.log("File Received:", req.file);

    if (!req.file) {
      return res.status(400).json({ message: "CSV file is required." });
    }

    const results = [];
    const errors = [];
    const requiredFields = ["brand", "product_name", "price", "product_category", "status"];

    const processRow = async (row) => {
      try {
        // Validate required fields
        const missingFields = requiredFields.filter((field) => !row[field]);
        if (missingFields.length > 0) {
          errors.push({ row, message: `Missing required fields: ${missingFields.join(", ")}` });
          return;
        }

        // Normalize values
        row.price = parseFloat(row.price);
        row.status = row.status.toLowerCase();
        row.product_category = row.product_category.toLowerCase();

        // Validate status field
        if (!["active", "inactive"].includes(row.status)) {
          errors.push({ row, message: "Invalid status value. Allowed: active, inactive." });
          return;
        }

        // Generate model_code only if it's missing
        if (!row.model_code || row.model_code.trim() === "") {
          row.model_code = await generateProductCode(row.product_name);
        }

        results.push(row);
      } catch (error) {
        console.error("Error processing row:", row, error);
      }
    };

    // Convert buffer to a readable stream
    const bufferStream = new stream.PassThrough();
    bufferStream.end(req.file.buffer);

    bufferStream
      .pipe(csvParser({ mapHeaders: ({ header }) => header.toLowerCase().trim() }))
      .on("data", async (row) => await processRow(row))
      .on("end", async () => {
        try {
          const insertedData = [];
          const updatedData = [];

          for (const data of results) {
            console.log("Processing Data:", data);
            const { brand, product_name } = data;

            let existingProduct = await Product.findOne({
              brand: new RegExp(`^${brand}$`, "i"),
              product_name: new RegExp(`^${product_name}$`, "i"),
            });

            if (existingProduct) {
              Object.assign(existingProduct, data);

              if (existingProduct.isModified()) {
                await existingProduct.save();
                console.log("Updated Product:", existingProduct);
                updatedData.push(existingProduct);
              } else {
                console.log("No changes detected for:", data);
              }
            } else {
              const newProduct = new Product(data);
              await newProduct.save();
              console.log("Inserted Product:", newProduct);
              insertedData.push(newProduct);
            }
          }

          res.status(200).json({
            message: "CSV processed successfully",
            insertedCount: insertedData.length,
            updatedCount: updatedData.length,
            errors,
          });
        } catch (err) {
          console.error("Error saving data:", err);
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
    order = "",
    search = "",
    product_category = "",
  } = req.query;
  try {
    const filters = {};
    // Ensure order is a number
    const sortOrder = order === "-1" ? -1 : 1;
    // Search filter (case-insensitive)
    if (search) {
      const searchRegex = new RegExp(search, "i"); // Create regex once
      filters.$or = [
        { brand: searchRegex },
        { product_name: searchRegex },
        { product_category: searchRegex },
        { status: searchRegex },
      ];

      // If the search term is a number, add it to the price filter
      if (!isNaN(search)) {
        filters.$or.push({ price: Number(search) });
      }
    }
    if (product_category) {
      filters.product_category = product_category;
    }
    const product = await Product.find(filters)
      .sort({ [sort]: sortOrder })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));
    const totalRecords = await Product.countDocuments(filters);
    if (!product) {
      res.status(400).json({ error: "Product not found" });
    }
    res.status(200).json({
      message: "All users fetched successfully",
      currentPage: Number(page),
      totalRecords,
      data: product,
    });
  } catch (error) {
    console.error("Error in getting all products for admin:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

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
      message: "Product deleted successfully.",
    });
  } catch (error) {
    console.error("Error in deleting product for admin:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

//get all products admin
exports.getAllProducts = async (req, res) => {
  try {
    const products = await Product.find();
    res.status(200).json({
      message: "Products retrieved successfully.",
      products,
    });
  } catch (error) {
    console.error("Error in getting all products for admin:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};



// Rakshita 
exports.uploadProductsThroughCSV = async (req, res) => {
  try {
    console.log("Reaching upload prods");
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    let results = [];
    const stream = new Readable();
    stream.push(req.file.buffer);
    stream.push(null);

    let isFirstRow = true;
    let cleanedHeaders = [];

    stream
      .pipe(csvParser())
      .on("data", (row) => {
        if (isFirstRow) {
          cleanedHeaders = Object.keys(row).map(cleanHeader);
          isFirstRow = false;
        }

        let productEntry = {};
        cleanedHeaders.forEach((header, index) => {
          const originalKey = Object.keys(row)[index];
          productEntry[header] = row[originalKey].trim();
        });

        // Format product_product_category
        // productEntry.product_product_category = cleanproduct_category(productEntry.product_product_category);

        // Assign segment based on price
        productEntry.segment = determineSegment(Number(productEntry.price));

        // Generate product_name_code if missing
        if (!productEntry.product_name_code) {
          productEntry.product_name_code = generateIdentifier(productEntry.product_name);
        }

        // Generate product_code if missing
        if (!productEntry.product_code) {
          productEntry.product_code = generateIdentifier(`${productEntry.brand}_${productEntry.product_name}`);
        }

        // Set default status to active
        productEntry.status = "active";

        results.push(productEntry);
      })
      .on("end", async () => {
        try {
          if (results.length === 0) {
            return res.status(400).json({ success: false, message: "No valid data found in CSV." });
          }

          // Insert all products without checking for existing ones
          await Product.insertMany(results, { ordered: false });

          return res.status(201).json({ success: true, message: "Products uploaded successfully", totalEntries: results.length });
        } catch (error) {
          console.error("Error processing product entries:", error);
          res.status(500).json({ success: false, message: "Internal server error" });
        }
      });
  } catch (error) {
    console.error("Error in uploadProductsThroughCSV:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// h.D.s
exports.getProductById = async (req, res) => {
  try {
      const { productId } = req.params;

      // Find the product by ID
      const product = await Product.findById(productId);

      if (!product) {
          return res.status(404).json({ error: 'Product not found' });
      }

      return res.status(200).json({ product });
  } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Internal Server Error' });
  }
};
