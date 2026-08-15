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

router.post('/', validate(createGroupSchema), groupController.createGroup);
router.get('/:id', validateObjectId('id'), groupController.getGroup);
router.patch('/:id', validateObjectId('id'), validate(updateGroupSchema), groupController.updateGroup);

router.post('/:id/members', validateObjectId('id'), validate(addMembersSchema), groupController.addMembers);
router.delete(
  '/:id/members/:userId',
  validateObjectId('id'),
  validateObjectId('userId'),
  groupController.removeMember
);

router.post('/:id/leave', validateObjectId('id'), groupController.leaveGroup);
router.post('/:id/admins', validateObjectId('id'), validate(promoteAdminSchema), groupController.promoteAdmin);

export default router;
