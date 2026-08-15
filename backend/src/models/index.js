// Importing every model here - and importing this file once from app.js -
// guarantees each schema is registered with Mongoose before any query runs,
// even ones (like Conversation's `.populate('group', ...)`) that reference
// a model only by its string name and never import that file directly.
export { User } from './User.js';
export { Conversation } from './Conversation.js';
export { Message } from './Message.js';
export { Group } from './Group.js';
export { Notification } from './Notification.js';
export { RefreshToken } from './RefreshToken.js';
