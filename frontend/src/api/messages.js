import { apiClient } from './client.js';

export const listMessages = async (conversationId, before) => {
  const res = await apiClient.get(`/api/conversations/${conversationId}/messages`, {
    params: before ? { before } : {},
  });
  return res.data.data; // { messages, nextCursor, hasMore }
};

export const editMessage = async (messageId, content) => {
  const res = await apiClient.patch(`/api/messages/${messageId}`, { content });
  return res.data.data.message;
};

export const deleteMessage = async (messageId) => {
  await apiClient.delete(`/api/messages/${messageId}`);
};
