import { Router } from 'express';
import * as messageController from '../controllers/messageController.js';
import { protect } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { validateObjectId } from '../middlewares/validateObjectId.js';
import { updateMessageSchema } from '../validators/messageValidators.js';

const router = Router();

router.use(protect);

router.patch('/:id', validateObjectId('id'), validate(updateMessageSchema), messageController.updateMessage);
router.delete('/:id', validateObjectId('id'), messageController.deleteMessage);

export default router;
