import mongoose from 'mongoose';

const { Schema } = mongoose;

const conversationSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['private', 'group'],
      required: true,
    },
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    group: {
      type: Schema.Types.ObjectId,
      ref: 'Group',
      default: null,
    },
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    // Derived, sorted "userIdA_userIdB" key - only set for type: 'private'.
    // The unique index on this field (below) is what stops two users from
    // ending up with two separate private conversations if they both hit
    // "start chat" on each other at nearly the same moment (Phase 5).
    participantsKey: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

conversationSchema.pre('validate', function setParticipantsKey() {
  if (this.type === 'private' && this.participants?.length === 2) {
    this.participantsKey = this.participants
      .map((id) => id.toString())
      .sort()
      .join('_');
  }
});

// Partial unique index: only enforced for private conversations, so group
// conversations (which don't set participantsKey) never collide with it.
conversationSchema.index(
  { participantsKey: 1 },
  { unique: true, partialFilterExpression: { type: 'private' } }
);

// Supports "get all conversations this user is part of".
conversationSchema.index({ participants: 1 });

export const Conversation = mongoose.model('Conversation', conversationSchema);
