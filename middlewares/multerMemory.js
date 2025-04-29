const multer = require("multer");

// Use memory storage (no files written to disk)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Optional: filter image types if needed
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"), false);
  }
};

const upload = multer({ storage, fileFilter });

module.exports = upload;
