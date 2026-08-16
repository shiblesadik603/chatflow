// Used only for the display filename shown to other users - the actual
// stored file always gets a server-generated UUID name (storageService.js),
// so this isn't a path-traversal defense, just cleanup for display.
export const sanitizeFileName = (name) => {
  const cleaned = (name || '')
    .replace(/[/\\?%*:|"<>]/g, '')
    .replace(/\.\./g, '')
    .trim();
  return cleaned.slice(0, 150) || 'file';
};
