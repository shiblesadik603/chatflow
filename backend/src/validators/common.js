import { z } from 'zod';
import mongoose from 'mongoose';

// Reused anywhere a request body references another document by id
// (participantId, memberIds, conversationId, ...).
export const objectIdString = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Must be a valid id' });
