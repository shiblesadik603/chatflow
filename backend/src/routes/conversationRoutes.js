import { Router } from 'express';
import * as conversationController from '../controllers/conversationController.js';
import { protect } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { validateObjectId } from '../middlewares/validateObjectId.js';
import { createConversationSchema } from '../validators/conversationValidators.js';

const router = Router();

router.use(protect);

router.post('/', validate(createConversationSchema), conversationController.createConversation);
router.get('/', conversationController.listConversations);
router.get('/:id', validateObjectId('id'), conversationController.getConversation);
router.delete('/:id', validateObjectId('id'), conversationController.deleteConversation);

export default router;
