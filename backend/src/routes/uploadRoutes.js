import { Router } from 'express';
import * as uploadController from '../controllers/uploadController.js';
import { protect } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { avatarUpload, chatFileUpload } from '../middlewares/upload.js';
import { uploadTypeSchema } from '../validators/uploadValidators.js';

const router = Router();

router.use(protect);

router.post('/avatar', avatarUpload, uploadController.uploadAvatar);

// multer must run before validate() here - it's what parses the
// multipart body into req.body in the first place.
router.post('/chat', chatFileUpload, validate(uploadTypeSchema), uploadController.uploadChatFile);

export default router;
