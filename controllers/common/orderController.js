const Order = require("../../model/Order");
const Product = require("../../model/Product");
const { v4: uuidv4 } = require("uuid");

// Add order by dealer
exports.addOrderByDealer = async (req, res) => {
  try {
    let { Products, Remark } = req.body;
    const UserId = req.user.id; // Assuming userAuth middleware sets req.user

    console.log(UserId);
    console.log(req.body);

    if (!UserId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to place an order.",
      });
    }

    // Generate random OrderNumber if not provided

    let OrderNumber = `ORD-${uuidv4().slice(0, 8)}`; // shorten uuid

    // Set DeliveryDate to next day if not provided
    

    if (!Array.isArray(Products) || Products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Products are required.",
      });
    }

    // Check if all ProductIds exist
    const invalidProductIds = [];
    let totalPrice = 0;
    for (const item of Products) {
      if (!item.ProductId || !item.Quantity) {
        return res.status(400).json({
          success: false,
          message: "Each product must have ProductId and Quantity.",
        });
      }
      const product = await Product.findById(item.ProductId);
      if (!product) {
        invalidProductIds.push(item.ProductId);
      } else {
        totalPrice += product.price * item.Quantity;
      }
    }
    if (invalidProductIds.length > 0) {
      return res.status(404).json({
        success: false,
        message: "Some ProductIds are invalid.",
        invalidProductIds,
      });
    }

    // Create and save order
    const newOrder = new Order({
      OrderNumber,
      UserId: UserId,
      Products,
      TotalPrice: totalPrice,
      OrderStatus: "pending",
      OrderDate: new Date(),
      DeliveryDate,
      Remark : Remark || "No remark",
    });
    await newOrder.save();

    res.status(201).json({
      success: true,
      message: "Order placed successfully.",
      order: newOrder,
    });
  } catch (error) {
    console.error("Error in addOrderByDealer:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


// Get all orders by dealer id
exports.getAllOrdersForDealer = async (req, res) => {
  try {
    const UserId = req.user.id;
    const orders = await Order.find({ UserId: UserId }).populate("Products.ProductId").sort({ OrderDate: -1 });

    res.status(200).json({
      success: true,
      message: "Orders fetched successfully.",
      orders,
    });

    
  } catch (error) {
    console.error("Error in getAllOrdersForDealer:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
}