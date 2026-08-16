import { apiClient, setAccessToken, setCurrentUserId } from './client.js';

export const register = async ({ name, email, password }) => {
  const res = await apiClient.post('/api/auth/register', { name, email, password });
  setAccessToken(res.data.data.accessToken);
  setCurrentUserId(res.data.data.user._id);
  return res.data.data.user;
};

export const login = async ({ email, password }) => {
  const res = await apiClient.post('/api/auth/login', { email, password });
  setAccessToken(res.data.data.accessToken);
  setCurrentUserId(res.data.data.user._id);
  return res.data.data.user;
};

export const logout = async () => {
  await apiClient.post('/api/auth/logout');
  setAccessToken(null);
  setCurrentUserId(null);
};

// Called once on app load - if the browser still has a valid refresh
// cookie from a previous session, this silently restores it without the
// user re-entering credentials. currentUserId is still null at this point,
// so client.js's identity check is a no-op here - establishing the initial
// identity from the cookie is exactly what this call is for.
export const restoreSession = async () => {
  const res = await apiClient.post('/api/auth/refresh');
  setAccessToken(res.data.data.accessToken);
  setCurrentUserId(res.data.data.user._id);
  return res.data.data.user;
};
