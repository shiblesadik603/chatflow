import { apiClient } from './client.js';

export const listConversations = async () => {
  const res = await apiClient.get('/api/conversations');
  return res.data.data.conversations;
};

export const createConversation = async (participantId) => {
  const res = await apiClient.post('/api/conversations', { participantId });
  return res.data.data.conversation;
};
