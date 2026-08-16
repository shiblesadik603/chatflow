import { apiClient } from './client.js';

export const getDashboardStatus = async () => {
  const res = await apiClient.get('/api/dashboard/status');
  return res.data.data;
};

export const simulateRedisDown = async () => {
  const res = await apiClient.post('/api/dashboard/simulate/redis-down');
  return res.data.data;
};

export const restoreRedis = async () => {
  const res = await apiClient.post('/api/dashboard/simulate/redis-restore');
  return res.data.data;
};
