import mongoose from 'mongoose';

const { Schema } = mongoose;

const attachmentSchema = new Schema(
  {
    url: { type: String, required: true },
    fileName: { type: String },
    mimeType: { type: String },
    size: { type: Number }, // bytes
    duration: { type: Number }, // seconds - voice messages only
  },
  { _id: false }
);

const messageSchema = new Schema(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      default: '',
      maxlength: 5000,
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'file', 'voice', 'system'],
      default: 'text',
    },
    attachments: [attachmentSchema],
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent',
    },
    readBy: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        readAt: { type: Date, default: Date.now },
      },
    ],
    deliveredTo: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        deliveredAt: { type: Date, default: Date.now },
      },
    ],
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    // Set by the client when it sends the message. Lets the server
    // recognize a network retry of the same logical message and avoid
    // creating a duplicate - the idempotency strategy used in Phase 6/8.
    clientMessageId: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// The most common query: "give me the last N messages of this
// conversation, newest first" - this compound index serves it directly.
messageSchema.index({ conversation: 1, createdAt: -1 });

// Idempotency: the same sender can't create two stored messages with the
// same clientMessageId inside the same conversation.
messageSchema.index(
  { conversation: 1, sender: 1, clientMessageId: 1 },
  { unique: true, partialFilterExpression: { clientMessageId: { $type: 'string' } } }
);

// Supports the message-search feature (full-text search over content).
messageSchema.index({ content: 'text' });

export const Message = mongoose.model('Message', messageSchema);
