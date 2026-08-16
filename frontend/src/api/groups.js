import { apiClient } from './client.js';

export const createGroup = async ({ name, memberIds }) => {
  const res = await apiClient.post('/api/groups', { name, memberIds });
  return res.data.data.group;
};

export const getGroup = async (groupId) => {
  const res = await apiClient.get(`/api/groups/${groupId}`);
  return res.data.data.group;
};

export const renameGroup = async (groupId, name) => {
  const res = await apiClient.patch(`/api/groups/${groupId}`, { name });
  return res.data.data.group;
};

export const addGroupMembers = async (groupId, memberIds) => {
  const res = await apiClient.post(`/api/groups/${groupId}/members`, { memberIds });
  return res.data.data.group;
};

export const removeGroupMember = async (groupId, userId) => {
  const res = await apiClient.delete(`/api/groups/${groupId}/members/${userId}`);
  return res.data.data.group;
};

export const promoteGroupAdmin = async (groupId, userId) => {
  const res = await apiClient.post(`/api/groups/${groupId}/admins`, { userId });
  return res.data.data.group;
};

export const leaveGroup = async (groupId) => {
  const res = await apiClient.post(`/api/groups/${groupId}/leave`);
  return res.data.data; // { deleted }
};
