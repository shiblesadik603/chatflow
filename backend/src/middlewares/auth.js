import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { verifyAccessToken } from '../services/tokenService.js';

export const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('Not authenticated', 401, 'NOT_AUTHENTICATED'));
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);

    if (!user) {
      return next(new AppError('User no longer exists', 401, 'NOT_AUTHENTICATED'));
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Access token expired', 401, 'TOKEN_EXPIRED'));
    }
    return next(new AppError('Invalid access token', 401, 'INVALID_TOKEN'));
  }
};
