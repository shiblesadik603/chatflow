import { Router } from 'express';
import * as uploadController from '../controllers/uploadController.js';
import { protect } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { avatarUpload, chatFileUpload } from '../middlewares/upload.js';
import { uploadTypeSchema } from '../validators/uploadValidators.js';

const router = Router();

router.use(protect);

/**
 * @openapi
 * /api/uploads/avatar:
 *   post:
 *     tags: [Uploads]
 *     summary: Upload a profile picture
 *     description: >
 *       Updates the user's avatar directly (no separate PATCH call needed) and deletes
 *       the previous avatar file. File content is verified by its actual byte signature
 *       ("magic number"), never by the client-declared Content-Type - a curated
 *       allowlist of image formats, max 5MB.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [avatar]
 *             properties:
 *               avatar: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Avatar updated.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { success: { type: boolean, example: true }, data: { type: object, properties: { user: { $ref: '#/components/schemas/OwnUser' } } } } }
 *       400:
 *         description: No file provided, or its real content does not match an allowed image type.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             examples:
 *               noFile: { value: { success: false, message: 'No file provided', errorCode: NO_FILE } }
 *               invalidType: { value: { success: false, message: 'File content does not match an allowed image type (detected: text/plain)', errorCode: INVALID_FILE_TYPE } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       413:
 *         description: File exceeds the 5MB limit.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'File is too large', errorCode: FILE_TOO_LARGE }
 */
router.post('/avatar', avatarUpload, uploadController.uploadAvatar);

/**
 * @openapi
 * /api/uploads/chat:
 *   post:
 *     tags: [Uploads]
 *     summary: Upload a chat attachment (image, document, or voice note)
 *     description: >
 *       Returns metadata only - it does not create a message. The client attaches the
 *       returned url/fileName/mimeType/size (and duration, for voice) to the
 *       `attachments` array when calling POST /api/conversations/{id}/messages. Max
 *       20MB. Voice uploads require a client-reported `duration` in seconds (the
 *       browser's MediaRecorder already knows this - it's not parsed from the audio
 *       file server-side, which is unreliable for streamed WebM/Opus).
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary }
 *               type: { type: string, enum: [image, document, voice], default: image }
 *               duration: { type: number, description: Required when type is "voice". Seconds, max 600. }
 *     responses:
 *       201:
 *         description: File stored.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { success: { type: boolean, example: true }, data: { $ref: '#/components/schemas/Attachment' } } }
 *       400:
 *         description: No file provided, or its real content does not match the declared category.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'File content does not match an allowed document type (detected: image/png)', errorCode: INVALID_FILE_TYPE }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       413:
 *         description: File exceeds the 20MB limit.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'File is too large', errorCode: FILE_TOO_LARGE }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
router.post('/chat', chatFileUpload, validate(uploadTypeSchema), uploadController.uploadChatFile);

export default router;
