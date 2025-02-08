const jwt  = require("jsonwebtoken");
const User = require("../model/User");

exports.superAdminAuth = async (req, res, next) => {
    try {  
      const token = req.header("Authorization")
      if(!token){
        return res.status(401).send({message: "Access Denied. No token provided."})
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      console.log(decoded);
      const user = await User.findOne({ _id:decoded.id, role: "super_admin" });
      
      if(!user){
        return res.status(401).send({message: "Access Denied. You are not a super Admin"})
      }
      req.user = user
      next();

    }catch(err){
      console.log(err)
    }
  };
exports.adminAuth = async (req, res, next) => {
    try {  
      const token = req.header("Authorization")
      if(!token){
        return res.status(401).send({message: "Access Denied. No token provided."})
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      console.log(decoded);
      const user = await User.findOne({ _id:decoded.id, role: "admin" });
      
      if(!user){
        return res.status(401).send({message: "Access Denied. You are not a Admin"})
      }
      req.user = user
      next();

    }catch(err){
      console.log(err)
    }
  };
