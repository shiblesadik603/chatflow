import { Router } from 'express';
import * as dashboardController from '../controllers/dashboardController.js';
import { protect } from '../middlewares/auth.js';

const router = Router();

router.use(protect);

/**
 * @openapi
 * /api/dashboard/status:
 *   get:
 *     tags: [Dashboard]
 *     summary: Live server status, dependency health, and aggregate counts
 *     description: >
 *       Requires authentication - this app has no admin role, so any logged-in
 *       user can view it (a real deployment would gate this further, e.g.
 *       behind an admin role or an internal-only network). Unlike
 *       /api/health, this DOES check MongoDB and Redis connectivity, since a
 *       dashboard needs to surface a degraded dependency, not just confirm
 *       the process itself is up.
 *     responses:
 *       200:
 *         description: Current status.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     environment: { type: string, example: development }
 *                     uptimeSeconds: { type: integer, example: 4213 }
 *                     nodeVersion: { type: string, example: v20.11.0 }
 *                     memory:
 *                       type: object
 *                       description: Node's process.memoryUsage() output, in bytes.
 *                     mongo:
 *                       type: object
 *                       properties: { status: { type: string, example: connected } }
 *                     redis:
 *                       type: object
 *                       properties: { status: { type: string, example: ready } }
 *                     counts:
 *                       type: object
 *                       properties:
 *                         totalUsers: { type: integer }
 *                         onlineUsers: { type: integer }
 *                         totalConversations: { type: integer }
 *                         totalMessages: { type: integer }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/status', dashboardController.getStatus);

export default router;
