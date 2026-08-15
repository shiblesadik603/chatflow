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
router.get('/me', userController.getMe);
router.patch('/me', validate(updateProfileSchema), userController.updateMe);
router.get('/search', validate(searchUsersSchema, 'query'), userController.searchUsers);

router.get('/:id', validateObjectId('id'), userController.getUserById);
router.post('/:id/block', validateObjectId('id'), userController.blockUser);
router.delete('/:id/block', validateObjectId('id'), userController.unblockUser);

export default router;
