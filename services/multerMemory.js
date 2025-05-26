const multer = require("multer");

const storage = multer.memoryStorage(); // store file in memory (RAM)
const upload = multer({ storage });

module.exports = upload;
