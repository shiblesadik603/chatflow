import { Router } from 'express';
import * as messageController from '../controllers/messageController.js';
import { protect } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { validateObjectId } from '../middlewares/validateObjectId.js';
import { updateMessageSchema } from '../validators/messageValidators.js';

const router = Router();

router.use(protect);

/**
 * @openapi
 * /api/messages/{id}:
 *   patch:
 *     tags: [Messages]
 *     summary: Edit a message
 *     description: Only the sender can edit their own message, and only while it's a text message that hasn't been deleted. Broadcasts message_edited over Socket.IO to the conversation's room.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content: { type: string, minLength: 1, maxLength: 5000 }
 *     responses:
 *       200:
 *         description: Updated message.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { success: { type: boolean, example: true }, data: { type: object, properties: { message: { $ref: '#/components/schemas/Message' } } } } }
 *       400: { $ref: '#/components/responses/InvalidId' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403:
 *         description: Not the sender of this message.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'You can only modify your own messages', errorCode: NOT_MESSAGE_OWNER }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *   delete:
 *     tags: [Messages]
 *     summary: Delete a message
 *     description: Soft delete - content and attachments are cleared but the document remains (so read receipts and conversation ordering stay intact). Broadcasts message_deleted over Socket.IO with a minimal payload (id + conversation + timestamp, not the full message).
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Message deleted.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { success: { type: boolean, example: true }, message: { type: string, example: Message deleted } } }
 *       400: { $ref: '#/components/responses/InvalidId' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403:
 *         description: Not the sender of this message.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'You can only modify your own messages', errorCode: NOT_MESSAGE_OWNER }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409:
 *         description: Already deleted.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'Message is already deleted', errorCode: ALREADY_DELETED }
 */
router.patch('/:id', validateObjectId('id'), validate(updateMessageSchema), messageController.updateMessage);
router.delete('/:id', validateObjectId('id'), messageController.deleteMessage);

export default router;
