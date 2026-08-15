import { env } from './env.js';

// Shared by both the Express app and the Socket.IO server, so the two
// transports always agree on which frontend origin is allowed to connect.
export const corsOptions = { origin: env.CLIENT_URL, credentials: true };
