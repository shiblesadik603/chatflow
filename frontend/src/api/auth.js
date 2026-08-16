import { apiClient, setAccessToken } from './client.js';

export const register = async ({ name, email, password }) => {
  const res = await apiClient.post('/api/auth/register', { name, email, password });
  setAccessToken(res.data.data.accessToken);
  return res.data.data.user;
};

export const login = async ({ email, password }) => {
  const res = await apiClient.post('/api/auth/login', { email, password });
  setAccessToken(res.data.data.accessToken);
  return res.data.data.user;
};

export const logout = async () => {
  await apiClient.post('/api/auth/logout');
  setAccessToken(null);
};

// Called once on app load - if the browser still has a valid refresh
// cookie from a previous session, this silently restores it without the
// user re-entering credentials.
export const restoreSession = async () => {
  const res = await apiClient.post('/api/auth/refresh');
  setAccessToken(res.data.data.accessToken);
  return res.data.data.user;
};
