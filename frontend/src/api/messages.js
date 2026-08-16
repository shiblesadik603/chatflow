import { apiClient } from './client.js';

export const listMessages = async (conversationId, before) => {
  const res = await apiClient.get(`/api/conversations/${conversationId}/messages`, {
    params: before ? { before } : {},
  });
  return res.data.data; // { messages, nextCursor, hasMore }
};
