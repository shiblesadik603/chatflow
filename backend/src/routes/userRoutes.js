import { Router } from 'express';
import * as userController from '../controllers/userController.js';
import { protect } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { validateObjectId } from '../middlewares/validateObjectId.js';
import { updateProfileSchema, searchUsersSchema } from '../validators/userValidators.js';

const router = Router();

router.use(protect);

// Static paths ("/me", "/search") must be registered before "/:id",
// otherwise Express would try to match them as an :id value instead.

/**
 * @openapi
 * /api/users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get my own profile
 *     responses:
 *       200:
 *         description: The current user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { type: object, properties: { user: { $ref: '#/components/schemas/OwnUser' } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/me', userController.getMe);

/**
 * @openapi
 * /api/users/me:
 *   patch:
 *     tags: [Users]
 *     summary: Update my profile (name and/or bio)
 *     description: >
 *       Only name/bio are accepted - any other field sent (e.g. isAdmin, role, _id) is
 *       silently stripped by validation before it ever reaches the database. Avatar is
 *       updated separately via POST /api/uploads/avatar.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: At least one field is required.
 *             properties:
 *               name: { type: string, minLength: 2, maxLength: 50 }
 *               bio: { type: string, maxLength: 160 }
 *     responses:
 *       200:
 *         description: Updated user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { type: object, properties: { user: { $ref: '#/components/schemas/OwnUser' } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
router.patch('/me', validate(updateProfileSchema), userController.updateMe);

/**
 * @openapi
 * /api/users/search:
 *   get:
 *     tags: [Users]
 *     summary: Search users by name prefix
 *     description: >
 *       Excludes the requester and anyone involved in a block relationship in either
 *       direction. The query is regex-escaped server-side before use.
 *     parameters:
 *       - name: q
 *         in: query
 *         required: true
 *         schema: { type: string, minLength: 1, maxLength: 50 }
 *         example: ali
 *     responses:
 *       200:
 *         description: Up to 20 matching users.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { type: object, properties: { users: { type: array, items: { $ref: '#/components/schemas/PublicUser' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
router.get('/search', validate(searchUsersSchema, 'query'), userController.searchUsers);

/**
 * @openapi
 * /api/users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get another user's public profile
 *     description: Cached in Redis for 60s (cache-aside, invalidated on profile/avatar change or presence change) - see README for the caching architecture.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Public profile.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { type: object, properties: { user: { $ref: '#/components/schemas/PublicUser' } } }
 *       400: { $ref: '#/components/responses/InvalidId' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', validateObjectId('id'), userController.getUserById);

/**
 * @openapi
 * /api/users/{id}/block:
 *   post:
 *     tags: [Users]
 *     summary: Block a user
 *     description: A blocked user cannot start a conversation with you or send you messages in an existing one. Enforced server-side, not just hidden client-side.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: User blocked.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { success: { type: boolean, example: true }, message: { type: string, example: User blocked } } }
 *       400:
 *         description: Cannot block yourself.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'You cannot block yourself', errorCode: CANNOT_BLOCK_SELF }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409:
 *         description: Already blocked.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'User is already blocked', errorCode: ALREADY_BLOCKED }
 *   delete:
 *     tags: [Users]
 *     summary: Unblock a user
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: User unblocked.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { success: { type: boolean, example: true }, message: { type: string, example: User unblocked } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404:
 *         description: That user is not currently blocked.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'User is not blocked', errorCode: NOT_BLOCKED }
 */
router.post('/:id/block', validateObjectId('id'), userController.blockUser);
router.delete('/:id/block', validateObjectId('id'), userController.unblockUser);

export default router;
