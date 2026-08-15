import mongoose from 'mongoose';

const { Schema } = mongoose;

const refreshTokenSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // SHA-256 hash of the actual refresh token - never the raw value. If the
  // database ever leaked, raw tokens would let an attacker log in as
  // anyone; same reasoning as hashing passwords. Hashing happens in the
  // auth service (Phase 3), not here.
  token: {
    type: String,
    required: true,
    unique: true,
  },
  userAgent: {
    type: String,
    default: '',
  },
  ip: {
    type: String,
    default: '',
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// "Log out from all devices" -> delete every row where user = X.
refreshTokenSchema.index({ user: 1 });

// TTL index: MongoDB itself deletes the document once expiresAt is in the
// past. No manual cleanup job needed for expired sessions.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
