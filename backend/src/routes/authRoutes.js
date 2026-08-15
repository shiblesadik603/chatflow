import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { validate } from '../middlewares/validate.js';
import { protect } from '../middlewares/auth.js';
import { authLimiter } from '../middlewares/rateLimiter.js';
import { registerSchema, loginSchema } from '../validators/authValidators.js';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), authController.register);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/logout-all', protect, authController.logoutAll);
router.get('/me', protect, authController.me);

export default router;
