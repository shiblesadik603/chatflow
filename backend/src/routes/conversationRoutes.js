import { Router } from 'express';
import * as conversationController from '../controllers/conversationController.js';
import { protect } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { validateObjectId } from '../middlewares/validateObjectId.js';
import { createConversationSchema } from '../validators/conversationValidators.js';
import conversationMessageRoutes from './conversationMessageRoutes.js';

const router = Router();

router.use(protect);

/**
 * @openapi
 * /api/conversations:
 *   post:
 *     tags: [Conversations]
 *     summary: Start (or find) a private conversation
 *     description: >
 *       Find-or-create, not just create: checks for an existing private conversation
 *       between the two users first. If two requests race (both users click "start
 *       chat" on each other at once), a partial unique index on the participant pair
 *       guarantees only one conversation is ever created - the loser of the race gets
 *       the winner's conversation back instead of a duplicate. Returns 201 if this
 *       call created it, 200 if it already existed.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [participantId]
 *             properties:
 *               participantId: { type: string, description: The other user's id. }
 *     responses:
 *       201:
 *         description: New conversation created.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { success: { type: boolean, example: true }, data: { type: object, properties: { conversation: { $ref: '#/components/schemas/Conversation' } } } } }
 *       200:
 *         description: Conversation already existed - returned as-is.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { success: { type: boolean, example: true }, data: { type: object, properties: { conversation: { $ref: '#/components/schemas/Conversation' } } } } }
 *       400:
 *         description: Cannot start a conversation with yourself.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'You cannot start a conversation with yourself', errorCode: CANNOT_MESSAGE_SELF }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403:
 *         description: You or the other user has a block relationship in place.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'You cannot start a conversation with this user', errorCode: BLOCKED }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *   get:
 *     tags: [Conversations]
 *     summary: List my conversations
 *     description: Sorted by most recent activity (updatedAt), which bumps whenever a new message is sent.
 *     responses:
 *       200:
 *         description: All conversations the current user participates in.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { success: { type: boolean, example: true }, data: { type: object, properties: { conversations: { type: array, items: { $ref: '#/components/schemas/Conversation' } } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/', validate(createConversationSchema), conversationController.createConversation);
router.get('/', conversationController.listConversations);

/**
 * @openapi
 * /api/conversations/{id}:
 *   get:
 *     tags: [Conversations]
 *     summary: Get a single conversation
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: The conversation.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { success: { type: boolean, example: true }, data: { type: object, properties: { conversation: { $ref: '#/components/schemas/Conversation' } } } } }
 *       400: { $ref: '#/components/responses/InvalidId' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     tags: [Conversations]
 *     summary: Delete a private conversation
 *     description: >
 *       Private conversations only - calling this on a group conversation returns 400
 *       and points at POST /api/groups/{id}/leave instead, since leaving a group has
 *       real semantics (admin reassignment, deleting an empty group) that belong there.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Conversation (and its messages) deleted.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { success: { type: boolean, example: true }, message: { type: string, example: Conversation deleted } } }
 *       400:
 *         description: This is a group conversation - use the leave-group endpoint instead.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'Use the leave-group endpoint to leave a group conversation', errorCode: USE_GROUP_LEAVE_ENDPOINT }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', validateObjectId('id'), conversationController.getConversation);
router.delete('/:id', validateObjectId('id'), conversationController.deleteConversation);

router.use(
  '/:conversationId/messages',
  validateObjectId('conversationId'),
  conversationMessageRoutes
);

export default router;
