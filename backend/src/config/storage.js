const fs = require('fs');
const path = require('path');
const multer = require('multer');
const ApiError = require('../utils/ApiError');
const { buildPublicId } = require('../utils/ids');

const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const allowedMimeTypes = (process.env.ALLOWED_MEDIA_MIME_TYPES || [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'audio/mpeg',
  'audio/wav',
  'image/jpeg',
  'image/png'
].join(',')).split(',').map((mime) => mime.trim());

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname);
    cb(null, `${buildPublicId('media')}${extension}`);
  }
});

const fileFilter = (_req, file, cb) => {
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new ApiError(400, `Unsupported file type: ${file.mimetype}`));
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_MB || 750) * 1024 * 1024
  }
});

module.exports = {
  upload,
  uploadDir,
  allowedMimeTypes
};
