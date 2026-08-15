import mongoose from 'mongoose';

const { Schema } = mongoose;

const groupSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Group name is required'],
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    description: {
      type: String,
      default: '',
      maxlength: 500,
    },
    avatar: {
      type: String,
      default: '',
    },
    admins: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    members: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    // Every group has exactly one backing conversation that its messages
    // attach to - see the note in Conversation.js.
    conversation: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      unique: true,
    },
  },
  { timestamps: true }
);

// Supports "which groups is this user a member of?".
groupSchema.index({ members: 1 });

export const Group = mongoose.model('Group', groupSchema);
