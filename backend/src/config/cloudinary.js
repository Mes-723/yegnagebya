// Cloudinary setup — free image hosting service
// All product photos are uploaded here, we store the URL in PostgreSQL

const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const hasCloudinaryCredentials = [
  process.env.CLOUDINARY_CLOUD_NAME,
  process.env.CLOUDINARY_API_KEY,
  process.env.CLOUDINARY_API_SECRET,
].every(value => value && !value.startsWith("your_"));

// Configure Cloudinary with your credentials
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Storage config — where to store files in Cloudinary
const cloudinaryStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    // Determine folder based on file type
    const folder = file.fieldname === "avatar"
      ? "yegnagebyam/avatars"
      : file.fieldname === "voice"
      ? "yegnagebyam/voices"
      : "yegnagebyam/products";

    return {
      folder,
      allowed_formats: ["jpg", "jpeg", "png", "webp", "mp3", "m4a"],
      transformation: file.fieldname !== "voice"
        ? [{ width: 800, height: 800, crop: "limit", quality: "auto" }]
        : undefined,
      public_id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
  },
});

const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = file.fieldname === "avatar" ? "avatars" : file.fieldname === "voice" ? "voices" : "products";
    const destination = path.join(__dirname, "../../uploads", folder);
    fs.mkdirSync(destination, { recursive: true });
    cb(null, destination);
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extension}`);
  },
});

// Multer middleware — handles multipart/form-data (file uploads)
const upload = multer({
  storage: hasCloudinaryCredentials ? cloudinaryStorage : localStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "audio/mpeg", "audio/m4a"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only images (JPG, PNG, WebP) and audio (MP3, M4A) allowed"));
    }
  },
});

module.exports = { cloudinary, upload, hasCloudinaryCredentials };