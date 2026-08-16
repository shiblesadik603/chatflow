import { Router } from 'express';
import * as messageController from '../controllers/messageController.js';
import { validate } from '../middlewares/validate.js';
import { createMessageSchema, listMessagesQuerySchema } from '../validators/messageValidators.js';

// mergeParams lets this router read :conversationId from its parent
// (conversationRoutes.js), even though it's a separate file.
const router = Router({ mergeParams: true });

/**
 * @openapi
 * /api/conversations/{conversationId}/messages:
 *   post:
 *     tags: [Messages]
 *     summary: Send a message
 *     description: >
 *       Also broadcasts new_message over Socket.IO to every socket that has joined this
 *       conversation's room (both this REST endpoint and the socket send_message event
 *       call the same underlying service, so delivery is identical either way).
 *       Idempotent: retrying with the same clientMessageId returns the original message
 *       (created: false) instead of creating a duplicate, and does not re-broadcast.
 *     parameters:
 *       - name: conversationId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               messageType: { type: string, enum: [text, image, file, voice], default: text }
 *               content: { type: string, maxLength: 5000, description: Required for text messages. }
 *               attachments:
 *                 type: array
 *                 description: Required for image/file/voice messages - see POST /api/uploads/chat.
 *                 items: { $ref: '#/components/schemas/Attachment' }
 *               clientMessageId: { type: string, description: 'Client-generated idempotency key.' }
 *             example: { messageType: text, content: 'Hey, are you free later?' }
 *     responses:
 *       201:
 *         description: New message created.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { success: { type: boolean, example: true }, data: { type: object, properties: { message: { $ref: '#/components/schemas/Message' } } } } }
 *       200:
 *         description: Idempotent retry - the original message is returned, nothing new was created.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { success: { type: boolean, example: true }, data: { type: object, properties: { message: { $ref: '#/components/schemas/Message' } } } } }
 *       400: { $ref: '#/components/responses/InvalidId' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403:
 *         description: Not a participant, or blocked by the other party.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             examples:
 *               notParticipant: { value: { success: false, message: 'You are not part of this conversation', errorCode: NOT_A_PARTICIPANT } }
 *               blocked: { value: { success: false, message: 'You cannot message this user', errorCode: BLOCKED } }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *   get:
 *     tags: [Messages]
 *     summary: Get message history
 *     description: >
 *       Cursor-based pagination (by message _id), not page/limit - stays correct even
 *       as new messages arrive between page requests, unlike offset pagination.
 *     parameters:
 *       - name: conversationId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *       - name: before
 *         in: query
 *         schema: { type: string }
 *         description: Message id cursor - returns messages older than this one.
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 30, maximum: 100 }
 *     responses:
 *       200:
 *         description: A page of messages, oldest first.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     messages: { type: array, items: { $ref: '#/components/schemas/Message' } }
 *                     nextCursor: { type: string, nullable: true }
 *                     hasMore: { type: boolean }
 *       400: { $ref: '#/components/responses/InvalidId' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/', validate(createMessageSchema), messageController.createMessage);
router.get('/', validate(listMessagesQuerySchema, 'query'), messageController.listMessages);

export default router;
