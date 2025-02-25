const Order = require ("../../model/Order");
const mongoose = require("mongoose");

//get orders
exports.getOrderForAdmin = async (req, res) => {
  try {
    // console.log("Received Query Params:", req.query);

    const { UserID, status, startDate, endDate, search } = req.query;

    let filter = {};
    
    if (UserID) {
      filter.UserId = UserID;
    }

    if (status) {
      filter.OrderStatus = status;
    }

    if (startDate || endDate) {
      filter.OrderDate = {};
      if (startDate) {
        filter.OrderDate.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.OrderDate.$lte = new Date(endDate);
      }
    }

    if (search) {
      filter.$or = [
        { OrderNumber: { $regex: search, $options: "i" } },        
        { OrderNumber: { $regex: `ORD-${search}`, $options: "i" } } 
      ];
    }
    
    
    // console.log("Final Filter Object:", filter);

    // ✅ Query the database with correct filter
    const orders = await Order.find(filter)
      .populate("Products.ProductId", "Model Price")
      .populate("UserId", "name")
      .sort({ OrderDate: -1 })
      .lean();

    if (!orders.length) {
      return res.status(404).json({ message: "No orders found" });
    }

    return res.status(200).json({
      message: "Orders retrieved successfully",
      orders,
    });
  } catch (error) {
    console.error("Error retrieving orders for admin:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};


// Edit Order by Admin
exports.editOrderForAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    let updates = req.body;

    if (!id) {
      return res.status(400).json({ message: "Order ID is required." });
    }

    // Ensure `Products` exists in updates and filter out products with quantity 0
    if (updates.Products && Array.isArray(updates.Products)) {
      updates.Products = updates.Products.filter(product => product.Quantity > 0);
    }

    const updatedOrder = await Order.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!updatedOrder) {
      return res.status(404).json({ message: "Order not found." });
    }

    res.status(200).json({
      message: "Order updated successfully.",
      data: updatedOrder,
    });
  } catch (error) {
    console.error("Error in editing order for admin:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

  exports.deleteOrderForAdmin = async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ message: "Order ID is required." });
      }
      const deletedOrder = await Order.findByIdAndDelete(id);
  
      if (!deletedOrder) {
        return res.status(404).json({ message: "Order not found." });
      }
  
      res.status(200).json({
        message: "Order deleted successfully.",
        data: deletedOrder,
      });
    } catch (error) {
      console.error("Error in deleting order for admin:", error);
      res.status(500).json({ message: "Internal server error." });
    }
  };