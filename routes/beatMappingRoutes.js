const express = require('express');
const { addBeatMapping, getBeatMapping } = require('../controllers/admin/beatMappingController');
const { userAuth } = require('../middlewares/authmiddlewares');


const router = express.Router();

router.post('/add-beat-mapping', userAuth, addBeatMapping);

router.get('/get-beat-mapping', getBeatMapping);

module.exports = router;