const multer = require("multer");

const storage = multer.memoryStorage(); // Store files in memory as buffers
const upload = multer({ storage });

module.exports = upload;
