import mongoose from 'mongoose';

const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['new_message', 'group_invite', 'group_removed', 'mention'],
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
    relatedConversation: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// The single most common query: "get my unread notifications, newest first".
notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
