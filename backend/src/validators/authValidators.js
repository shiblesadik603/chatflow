import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(50),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  // bcrypt silently ignores bytes past 72, so longer passwords wouldn't
  // actually add any extra security - capping it avoids a false sense of it.
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
