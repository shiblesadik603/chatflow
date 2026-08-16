import multer from 'multer';

// memoryStorage - the buffer stays in RAM so it can be validated (see
// fileValidation.js) before anything is written to disk or sent to
// Cloudinary/S3. Multer's own limits.fileSize rejects oversized uploads
// before the whole body is even buffered.
const storage = multer.memoryStorage();

const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5MB
const CHAT_FILE_MAX_BYTES = 20 * 1024 * 1024; // 20MB

export const avatarUpload = multer({ storage, limits: { fileSize: AVATAR_MAX_BYTES } }).single('avatar');
export const chatFileUpload = multer({ storage, limits: { fileSize: CHAT_FILE_MAX_BYTES } }).single('file');
