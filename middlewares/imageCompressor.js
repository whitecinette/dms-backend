const fs = require("fs");
const sharp = require("sharp");

const imageCompressor = async (req, res, next) => {
  try {
    if (!req.file || !req.file.path) {
      return res.status(400).json({ message: "No image file uploaded." });
    }

    const originalSize = fs.statSync(req.file.path).size;

    const compressedBuffer = await sharp(req.file.path)
      .resize({ width: 800 })          // resize to max width
      .jpeg({ quality: 70 })           // compress to 70% quality
      .toBuffer();

      console.log(
       `🗜️ Image compressed: ${(originalSize / (1024 * 1024)).toFixed(2)} MB → ${(compressedBuffer.length / (1024 * 1024)).toFixed(2)} MB`
     );     

    // attach to req for next middleware or controller
    req.compressedImageBuffer = compressedBuffer;

    next();
  } catch (error) {
    console.error("Image compression failed:", error);
    return res.status(500).json({ message: "Image compression failed", error: error.message });
  }
};

module.exports = imageCompressor;
