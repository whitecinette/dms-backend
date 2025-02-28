const express = require('express');
const { addEntity } = require('../controllers/admin/entityController');
const router = express.Router();

router.post("/entity/add", addEntity);

module.exports = router;