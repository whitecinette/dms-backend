const User = require("../model/User");

exports.superAdminAuth = async (req, res, next) => {
    try {
      const user  = req;
      console.log("Token: ", token)

    const decoded = jwt.verify(token, JWT_SECRET);


    } catch (error) {
      console.log(error);
      res.status(500).send({ error: "Internal Server Error" });
    }
  };