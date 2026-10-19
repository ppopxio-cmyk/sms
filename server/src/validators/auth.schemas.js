import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);
const password = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(128, 'That password is too long.')
  .regex(/[A-Za-z]/, 'Add at least one letter.')
  .regex(/[0-9]/, 'Add at least one number.');
const code = z.string().regex(/^[0-9]{6}$/, 'The code is 6 digits.');
const ticket = z.string().min(10).max(2000);

export const registerSchema = z.strictObject({ name: z.string().trim().min(2, 'Enter your full name.').max(100), email, password });
export const emailOnlySchema = z.strictObject({ email });
export const verifyEmailSchema = z.strictObject({ email, code });
export const loginSchema = z.strictObject({ email, password: z.string().min(1).max(128) });
export const loginVerifySchema = z.strictObject({ ticket, code });
export const ticketSchema = z.strictObject({ ticket });
export const resetPasswordSchema = z.strictObject({ resetToken: ticket, newPassword: password });
export const idParamSchema = z.strictObject({ id: z.string().regex(/^[a-f0-9]{24}$/i, 'That id is not valid.') });
