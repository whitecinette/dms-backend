const Order = require ("../../model/Order");

// get all orders for admin
exports.getOrderForAdmin = async (req, res) => {
    try {
      const { dealerCode, status, startDate, endDate, sortBy, sortOrder } =
        req.query;
  
      const filter = {};
  
      if (dealerCode) {
        filter.DealerCode = dealerCode;
      }
  
      if (status) {
        filter.OrderStatus = status;
      }
  
      if (startDate || endDate) {
        filter.OrderDate = {};
        if (startDate) {
          filter.OrderDate.$gte = new Date(
            new Date(startDate).setUTCHours(0, 0, 0, 0)
          );
        }
        if (endDate) {
          filter.OrderDate.$lte = new Date(
            new Date(endDate).setUTCHours(23, 59, 59, 999)
          );
        }
      }
  
      const sortOptions = {};
      if (sortBy) {
        sortOptions[sortBy] = sortOrder === "-1" ? -1 : 1;
      } else {
        sortOptions.OrderDate = -1;
      }
  
      // Fetch orders
      const orders = await Order.find(filter).sort(sortOptions).lean();
  
      if (!orders || orders.length === 0) {
        return res.status(404).json({ message: "No orders found" });
      }
  
      const productIds = orders.flatMap((order) =>
        order.Products.map((product) => product.ProductId)
      );
      const products = await Product.find(
        { _id: { $in: productIds } },
        { Model: 1, ProductCode: 1 }
      ).lean();
  
      const productDetailsMap = products.reduce((map, product) => {
        map[product._id.toString()] = {
          Model: product.Model,
          ProductCode: product.ProductCode,
        };
        return map;
      }, {});
  
      const missingProducts = [];
  
      // Enhance orders with product details
      const enhancedOrders = orders.map((order) => ({
        ...order,
        Products: order.Products.map((product) => {
          const details = productDetailsMap[product.ProductId];
          if (!details) {
            missingProducts.push(product.ProductId);
          }
          return {
            ...product,
            Model: details?.Model || null,
            ProductCode: details?.ProductCode || null,
          };
        }),
      }));
  
      const response = {
        message: "Orders retrieved successfully",
        orders: enhancedOrders,
      };
  
      if (missingProducts.length > 0) {
        response.missingProducts = Array.from(new Set(missingProducts));
      }
  
      return res.status(200).json(response);
    } catch (error) {
      console.error("Error retrieving orders for admin:", error.message || error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  };
  exports.editOrderForAdmin = async (req, res) => {
    console.log("hitting the order ");
    try {
      const { id } = req.params;
      const updates = req.body;
  
      if (!id) {
        return res.status(400).json({ message: "Order ID is required." });
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