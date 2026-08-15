import { z } from 'zod';
import { objectIdString } from '../validators/common.js';

const conversationIdSchema = z.object({ conversationId: objectIdString });

// Typing indicators get zero database calls, on purpose:
//
// - No persistence. This is a live UI signal, not data - if a typing_start
//   never reaches its recipient (dropped packet, brief disconnect), the
//   worst case is a stale "typing..." bubble that the client clears itself
//   after a couple of seconds. There's nothing here worth writing to Mongo.
//
// - No participant lookup either. join_conversation (Phase 8) already ran
//   a real DB check before letting this socket into the room, so checking
//   `socket.rooms.has(conversationId)` - an in-memory, essentially free
//   operation - is enough proof of authorization. Typing events fire far
//   more often than messages (every keystroke, even after client-side
//   debouncing), so re-hitting MongoDB on every one would be real,
//   avoidable load for something this disposable.
const relay = (event) => (socket, payload) => {
  const parsed = conversationIdSchema.safeParse(payload || {});
  if (!parsed.success) return; // malformed payload - just drop it, no ack channel to report to

  const { conversationId } = parsed.data;
  if (!socket.rooms.has(conversationId)) return; // hasn't joined -> not a proven participant

  // socket.to() (not io.to()) excludes the sender - you never need to see
  // your own "typing..." indicator.
  socket.to(conversationId).emit(event, { conversationId, userId: socket.userId });
};

export const registerTypingHandlers = (socket) => {
  socket.on('typing_start', (payload) => relay('typing_start')(socket, payload));
  socket.on('typing_stop', (payload) => relay('typing_stop')(socket, payload));
};
