import { User } from '../models/User.js';
import { verifyAccessToken } from '../services/tokenService.js';

// Socket.IO middleware (io.use), the real-time equivalent of the `protect`
// HTTP middleware. Runs once, during the handshake, before the socket is
// allowed to connect at all.
//
// The token travels in `socket.handshake.auth.token` - the payload passed
// to `io(url, { auth: { token } })` on the client - not a query string.
// Query params get written to proxy/load-balancer access logs; the auth
// payload doesn't.
export const socketAuth = async (socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(withCode(new Error('Authentication required'), 'NOT_AUTHENTICATED'));
  }

  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).select('_id');

    if (!user) {
      return next(withCode(new Error('User no longer exists'), 'NOT_AUTHENTICATED'));
    }

    // The only place socket.userId is ever set - every later handler reads
    // this instead of trusting anything the client claims about its own
    // identity in an event payload.
    socket.userId = user._id.toString();
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(withCode(new Error('Access token expired'), 'TOKEN_EXPIRED'));
    }
    next(withCode(new Error('Invalid access token'), 'INVALID_TOKEN'));
  }
};

// Socket.IO serializes an Error's `.data` property onto the client's
// `connect_error.data`, so the frontend can branch on a code instead of
// parsing the message string.
const withCode = (error, code) => {
  error.data = { code };
  return error;
};
