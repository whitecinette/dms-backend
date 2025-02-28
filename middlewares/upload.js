const multer = require('multer');

// Configure storage for temporary files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Temporary folder
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname}`);
  },
});

// Initialize multer
const upload_img = multer({ storage });

module.exports = upload_img;
