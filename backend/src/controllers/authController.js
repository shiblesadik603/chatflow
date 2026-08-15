import { env } from '../config/env.js';
import { msFromDuration } from '../utils/duration.js';
import * as authService from '../services/authService.js';

const REFRESH_COOKIE_NAME = 'refreshToken';

const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  // Only sent back to auth endpoints, not every request to the API.
  path: '/api/auth',
  maxAge: msFromDuration(env.REFRESH_TOKEN_EXPIRES_IN),
});

const requestMeta = (req) => ({
  userAgent: req.headers['user-agent'] || '',
  ip: req.ip,
});

const sendAuthResponse = (res, status, { user, accessToken, refreshToken }) => {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
  res.status(status).json({ success: true, data: { user, accessToken } });
};

export const register = async (req, res, next) => {
  try {
    const result = await authService.register(req.body, requestMeta(req));
    sendAuthResponse(res, 201, result);
  } catch (err) {
    next(err);
  }
};

export const login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body, requestMeta(req));
    sendAuthResponse(res, 200, result);
  } catch (err) {
    next(err);
  }
};

export const refresh = async (req, res, next) => {
  try {
    const incoming = req.cookies[REFRESH_COOKIE_NAME];
    const result = await authService.refresh(incoming, requestMeta(req));
    sendAuthResponse(res, 200, result);
  } catch (err) {
    next(err);
  }
};

export const logout = async (req, res, next) => {
  try {
    const incoming = req.cookies[REFRESH_COOKIE_NAME];
    await authService.logout(incoming);
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
    res.status(200).json({ success: true, message: 'Logged out' });
  } catch (err) {
    next(err);
  }
};

export const logoutAll = async (req, res, next) => {
  try {
    await authService.logoutAll(req.user._id);
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
    res.status(200).json({ success: true, message: 'Logged out from all devices' });
  } catch (err) {
    next(err);
  }
};

export const me = async (req, res) => {
  res.status(200).json({ success: true, data: { user: req.user } });
};
