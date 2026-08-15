import { User } from '../models/User.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { AppError } from '../utils/AppError.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  decodeToken,
  hashToken,
} from './tokenService.js';

const issueTokens = async (user, meta = {}) => {
  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);
  const { exp } = decodeToken(refreshToken);

  await RefreshToken.create({
    user: user._id,
    token: hashToken(refreshToken),
    userAgent: meta.userAgent || '',
    ip: meta.ip || '',
    expiresAt: new Date(exp * 1000),
  });

  return { user, accessToken, refreshToken };
};

export const register = async ({ name, email, password }, meta) => {
  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError('An account with this email already exists', 409, 'DUPLICATE_EMAIL');
  }

  const user = await User.create({ name, email, password });
  return issueTokens(user, meta);
};

export const login = async ({ email, password }, meta) => {
  const user = await User.findOne({ email }).select('+password');

  // Same generic error whether the email doesn't exist or the password is
  // wrong - never let a login form reveal which emails are registered.
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  return issueTokens(user, meta);
};

export const refresh = async (refreshTokenValue, meta) => {
  if (!refreshTokenValue) {
    throw new AppError('Refresh token missing', 401, 'NOT_AUTHENTICATED');
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshTokenValue);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }

  const tokenHash = hashToken(refreshTokenValue);
  const stored = await RefreshToken.findOne({ token: tokenHash, user: payload.sub });
  if (!stored) {
    // A structurally valid JWT that isn't in the DB means it was already
    // used (rotated away) or the session was logged out.
    throw new AppError('Refresh token has been revoked', 401, 'REVOKED_REFRESH_TOKEN');
  }

  // Rotate: the token that was just used is now dead, even if it hasn't
  // expired yet. This limits how long a stolen refresh token stays useful.
  await RefreshToken.deleteOne({ _id: stored._id });

  const user = await User.findById(payload.sub);
  if (!user) {
    throw new AppError('User no longer exists', 401, 'NOT_AUTHENTICATED');
  }

  return issueTokens(user, meta);
};

export const logout = async (refreshTokenValue) => {
  if (!refreshTokenValue) return;
  await RefreshToken.deleteOne({ token: hashToken(refreshTokenValue) });
};

export const logoutAll = async (userId) => {
  await RefreshToken.deleteMany({ user: userId });
};
