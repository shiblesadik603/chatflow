import { z } from 'zod';

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(50).optional(),
    bio: z.string().trim().max(160, 'Bio must be at most 160 characters').optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

export const searchUsersSchema = z.object({
  q: z.string().trim().min(1, 'Search query is required').max(50),
});
