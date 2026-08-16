import { apiClient } from './client.js';

export const searchUsers = async (q) => {
  const res = await apiClient.get('/api/users/search', { params: { q } });
  return res.data.data.users;
};

export const getUser = async (id) => {
  const res = await apiClient.get(`/api/users/${id}`);
  return res.data.data.user;
};

export const updateMe = async (updates) => {
  const res = await apiClient.patch('/api/users/me', updates);
  return res.data.data.user;
};
