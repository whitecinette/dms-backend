const express = require("express");
const router = express.Router();

const { userAuth } = require("../middlewares/authmiddlewares");
const { testResolvers } = require("../controllers/new/resolverTestController");

router.post("/resolver/test", userAuth, testResolvers);

module.exports = router;