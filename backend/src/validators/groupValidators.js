import { z } from 'zod';
import { objectIdString } from './common.js';

export const createGroupSchema = z.object({
  name: z.string().trim().min(2, 'Group name must be at least 2 characters').max(100),
  description: z.string().trim().max(500).optional(),
  avatar: z.string().url().optional(),
  memberIds: z.array(objectIdString).min(1, 'A group needs at least one other member'),
});

export const updateGroupSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    avatar: z.string().url().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

export const addMembersSchema = z.object({
  memberIds: z.array(objectIdString).min(1, 'Provide at least one member to add'),
});

export const promoteAdminSchema = z.object({
  userId: objectIdString,
});
