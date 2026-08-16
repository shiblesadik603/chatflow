import { apiClient } from './client.js';

export const getDashboardStatus = async () => {
  const res = await apiClient.get('/api/dashboard/status');
  return res.data.data;
};
