import { Router } from 'express';
import * as messageController from '../controllers/messageController.js';
import { validate } from '../middlewares/validate.js';
import { createMessageSchema, listMessagesQuerySchema } from '../validators/messageValidators.js';

// mergeParams lets this router read :conversationId from its parent
// (conversationRoutes.js), even though it's a separate file.
const router = Router({ mergeParams: true });

router.post('/', validate(createMessageSchema), messageController.createMessage);
router.get('/', validate(listMessagesQuerySchema, 'query'), messageController.listMessages);

export default router;
