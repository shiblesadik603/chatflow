import { apiClient } from './client.js';

// type is the upload category the server validates the file's real bytes
// against ('image' | 'document' | 'voice') - not the same value as a
// message's messageType ('file' for documents), so callers map between
// the two themselves.
export const uploadChatFile = async (file, type, duration) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', type);
  if (duration != null) {
    formData.append('duration', String(duration));
  }
  const res = await apiClient.post('/api/uploads/chat', formData);
  return res.data.data; // { url, fileName, mimeType, size, duration? }
};

export const uploadAvatar = async (file) => {
  const formData = new FormData();
  formData.append('avatar', file);
  const res = await apiClient.post('/api/uploads/avatar', formData);
  return res.data.data.user; // avatar is updated server-side; returns the full updated user
};
