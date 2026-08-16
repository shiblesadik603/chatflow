import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { validate } from '../middlewares/validate.js';
import { protect } from '../middlewares/auth.js';
import { authLimiter } from '../middlewares/rateLimiter.js';
import { registerSchema, loginSchema } from '../validators/authValidators.js';

const router = Router();

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Create an account
 *     description: >
 *       Hashes the password with bcrypt, issues an access token in the response body,
 *       and sets a refresh token as an httpOnly cookie scoped to /api/auth.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string, minLength: 2, maxLength: 50, example: Alice Johnson }
 *               email: { type: string, format: email, example: alice@example.com }
 *               password: { type: string, minLength: 8, maxLength: 72, example: correct-horse-battery }
 *     responses:
 *       201:
 *         description: Account created.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/OwnUser' }
 *                     accessToken: { type: string }
 *       409:
 *         description: An account with this email already exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'An account with this email already exists', errorCode: DUPLICATE_EMAIL }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/RateLimited' }
 */
router.post('/register', authLimiter, validate(registerSchema), authController.register);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in
 *     description: >
 *       Wrong password and unknown email both return the identical 401 - this is
 *       deliberate, so the login form can't be used to discover which emails are registered.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Logged in.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/OwnUser' }
 *                     accessToken: { type: string }
 *       401:
 *         description: Invalid email or password.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'Invalid email or password', errorCode: INVALID_CREDENTIALS }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/RateLimited' }
 */
router.post('/login', authLimiter, validate(loginSchema), authController.login);

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Exchange a refresh token cookie for a new access token
 *     description: >
 *       Reads the refreshToken httpOnly cookie (not a request body). Rotates the
 *       refresh token on every call - the old one is deleted server-side and a new
 *       cookie is set, so replaying the previous cookie value afterward is rejected
 *       as revoked.
 *     security: []
 *     responses:
 *       200:
 *         description: New access token issued; refresh cookie rotated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/OwnUser' }
 *                     accessToken: { type: string }
 *       401:
 *         description: Missing, malformed, expired, or already-rotated refresh token.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             examples:
 *               missing: { value: { success: false, message: 'Refresh token missing', errorCode: NOT_AUTHENTICATED } }
 *               revoked: { value: { success: false, message: 'Refresh token has been revoked', errorCode: REVOKED_REFRESH_TOKEN } }
 */
router.post('/refresh', authController.refresh);

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: End the current session
 *     description: Deletes only the session tied to the current refresh cookie - other devices stay logged in. See /api/auth/logout-all for ending every session.
 *     security: []
 *     responses:
 *       200:
 *         description: Logged out.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Logged out }
 */
router.post('/logout', authController.logout);

/**
 * @openapi
 * /api/auth/logout-all:
 *   post:
 *     tags: [Auth]
 *     summary: End every session for this account, on every device
 *     responses:
 *       200:
 *         description: All sessions ended.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Logged out from all devices }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/logout-all', protect, authController.logoutAll);

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the currently authenticated user
 *     description: Identical shape to GET /api/users/me - kept as a separate endpoint since it doubles as a lightweight "is my token still valid" session check.
 *     responses:
 *       200:
 *         description: The current user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/OwnUser' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/me', protect, authController.me);

export default router;
