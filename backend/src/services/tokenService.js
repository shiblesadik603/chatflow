import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env.js';

export const signAccessToken = (userId) =>
  jwt.sign({ sub: userId.toString() }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });

export const signRefreshToken = (userId) =>
  jwt.sign({ sub: userId.toString(), jti: crypto.randomUUID() }, env.REFRESH_TOKEN_SECRET, {
    expiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
  });

export const verifyAccessToken = (token) => jwt.verify(token, env.JWT_SECRET);

export const verifyRefreshToken = (token) => jwt.verify(token, env.REFRESH_TOKEN_SECRET);

export const decodeToken = (token) => jwt.decode(token);

// We never store the raw refresh token, only this hash - see RefreshToken.js.
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
