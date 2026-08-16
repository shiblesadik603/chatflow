import { Router } from 'express';
import * as groupController from '../controllers/groupController.js';
import { protect } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { validateObjectId } from '../middlewares/validateObjectId.js';
import {
  createGroupSchema,
  updateGroupSchema,
  addMembersSchema,
  promoteAdminSchema,
} from '../validators/groupValidators.js';

const router = Router();

router.use(protect);

/**
 * @openapi
 * /api/groups:
 *   post:
 *     tags: [Groups]
 *     summary: Create a group
 *     description: The creator becomes the sole admin and a member. Also creates a backing Conversation (type "group") that messages are sent/read through via the normal /api/conversations/{id}/messages endpoints - group messaging reuses the same message pipeline as private chat with no group-specific code.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, memberIds]
 *             properties:
 *               name: { type: string, minLength: 2, maxLength: 100 }
 *               description: { type: string, maxLength: 500 }
 *               avatar: { type: string, format: uri }
 *               memberIds: { type: array, minItems: 1, items: { type: string }, description: At least one other member besides the creator. }
 *     responses:
 *       201:
 *         description: Group created.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { success: { type: boolean, example: true }, data: { type: object, properties: { group: { $ref: '#/components/schemas/Group' } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
router.post('/', validate(createGroupSchema), groupController.createGroup);

/**
 * @openapi
 * /api/groups/{id}:
 *   get:
 *     tags: [Groups]
 *     summary: Get group details
 *     description: Requires membership.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: The group.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { success: { type: boolean, example: true }, data: { type: object, properties: { group: { $ref: '#/components/schemas/Group' } } } } }
 *       400: { $ref: '#/components/responses/InvalidId' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403:
 *         description: Not a member of this group.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'You are not a member of this group', errorCode: NOT_A_MEMBER }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Groups]
 *     summary: Rename or update a group
 *     description: Admin-only. Renaming broadcasts a system message ("renamed the group to ...") to the conversation via Socket.IO.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: At least one field is required.
 *             properties:
 *               name: { type: string, minLength: 2, maxLength: 100 }
 *               description: { type: string, maxLength: 500 }
 *               avatar: { type: string, format: uri }
 *     responses:
 *       200:
 *         description: Updated group.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { success: { type: boolean, example: true }, data: { type: object, properties: { group: { $ref: '#/components/schemas/Group' } } } } }
 *       400: { $ref: '#/components/responses/InvalidId' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403:
 *         description: Not an admin of this group.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'Only group admins can do this', errorCode: NOT_GROUP_ADMIN }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
router.get('/:id', validateObjectId('id'), groupController.getGroup);
router.patch('/:id', validateObjectId('id'), validate(updateGroupSchema), groupController.updateGroup);

/**
 * @openapi
 * /api/groups/{id}/members:
 *   post:
 *     tags: [Groups]
 *     summary: Add members
 *     description: Admin-only. Already-existing members in the list are silently skipped (addedCount reflects only genuinely new members). Broadcasts a system message naming who was added.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [memberIds]
 *             properties:
 *               memberIds: { type: array, minItems: 1, items: { type: string } }
 *     responses:
 *       200:
 *         description: Members added (or a no-op if all were already members).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     group: { $ref: '#/components/schemas/Group' }
 *                     addedCount: { type: integer }
 *       400: { $ref: '#/components/responses/InvalidId' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403:
 *         description: Not an admin of this group.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'Only group admins can do this', errorCode: NOT_GROUP_ADMIN }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
router.post('/:id/members', validateObjectId('id'), validate(addMembersSchema), groupController.addMembers);

/**
 * @openapi
 * /api/groups/{id}/members/{userId}:
 *   delete:
 *     tags: [Groups]
 *     summary: Remove a member
 *     description: Admin-only, and cannot be used to remove yourself (returns 400 pointing at the leave endpoint instead).
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *       - name: userId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Member removed.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { success: { type: boolean, example: true }, data: { type: object, properties: { group: { $ref: '#/components/schemas/Group' } } } } }
 *       400:
 *         description: Trying to remove yourself.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'Use the leave-group endpoint to remove yourself', errorCode: USE_LEAVE_ENDPOINT }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404:
 *         description: Group not found, or that user is not a member.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'That user is not a member of this group', errorCode: MEMBER_NOT_FOUND }
 */
router.delete(
  '/:id/members/:userId',
  validateObjectId('id'),
  validateObjectId('userId'),
  groupController.removeMember
);

/**
 * @openapi
 * /api/groups/{id}/leave:
 *   post:
 *     tags: [Groups]
 *     summary: Leave a group
 *     description: >
 *       If you're the last admin and other members remain, the longest-standing
 *       remaining member is automatically promoted - a group is never left without an
 *       admin. If you're the last member, the group, its conversation, and all its
 *       messages are deleted.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Left successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { type: object, properties: { deleted: { type: boolean, description: True if this was the last member and the group was deleted. } } }
 *       400: { $ref: '#/components/responses/InvalidId' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403:
 *         description: Not a member of this group.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'You are not a member of this group', errorCode: NOT_A_MEMBER }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/leave', validateObjectId('id'), groupController.leaveGroup);

/**
 * @openapi
 * /api/groups/{id}/admins:
 *   post:
 *     tags: [Groups]
 *     summary: Promote a member to admin
 *     description: Admin-only. The target must already be a member (added separately first).
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId: { type: string }
 *     responses:
 *       200:
 *         description: Member promoted.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { success: { type: boolean, example: true }, data: { type: object, properties: { group: { $ref: '#/components/schemas/Group' } } } } }
 *       400:
 *         description: Target is not yet a member of this group.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'That user must be a member before becoming an admin', errorCode: NOT_A_MEMBER }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409:
 *         description: Already an admin.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'That user is already an admin', errorCode: ALREADY_ADMIN }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
router.post('/:id/admins', validateObjectId('id'), validate(promoteAdminSchema), groupController.promoteAdmin);

export default router;
