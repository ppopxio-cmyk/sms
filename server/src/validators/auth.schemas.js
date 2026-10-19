import { z } from 'zod';
import { ROLES } from '../config/roles.js';

// Accounts are Gmail only, because every code and notice is delivered through the
// school's Gmail account and a rejected address would silently lose those emails.
const GMAIL = /^[a-z0-9][a-z0-9._%+-]*@gmail\.com$/;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address.')
  .max(254, 'That email is too long.')
  .refine((value) => GMAIL.test(value), 'Use a Gmail address ending in @gmail.com.');

// A real first and last name: 5 characters or more, at least two words, and each
// word at least two letters. \p{L} accepts Ethiopic script as well as Latin.
const name = z
  .string()
  .trim()
  .min(5, 'Enter the full name, at least 5 characters.')
  .max(100, 'That name is too long.')
  .refine((value) => {
    const words = value.split(/\s+/).filter(Boolean);
    return words.length >= 2 && words.every((word) => word.replace(/[^\p{L}]/gu, '').length >= 2);
  }, 'Enter a first name and a last name.');

const password = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(128, 'That password is too long.')
  .regex(/[A-Za-z]/, 'Add at least one letter.')
  .regex(/[0-9]/, 'Add at least one number.');

const role = z.enum(ROLES);
const code = z.string().regex(/^[0-9]{6}$/, 'The code is 6 digits.');
const ticket = z.string().min(10).max(2000);

export const emailOnlySchema = z.strictObject({ email });
export const verifyEmailSchema = z.strictObject({ email, code });
export const loginSchema = z.strictObject({ email, password: z.string().min(1).max(128) });
export const loginVerifySchema = z.strictObject({ ticket, code });
export const ticketSchema = z.strictObject({ ticket });
export const resetPasswordSchema = z.strictObject({ resetToken: ticket, newPassword: password });
export const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1, 'Enter your current password.').max(128),
  newPassword: password,
});
export const idParamSchema = z.strictObject({ id: z.string().regex(/^[a-f0-9]{24}$/i, 'That id is not valid.') });
export const sessionConfirmSchema = z.strictObject({ code });

// ---- Accounts that an administrator creates ------------------------------------
export const createUserSchema = z.strictObject({ name, email, role, password });

export const updateUserSchema = z
  .strictObject({
    name: name.optional(),
    role: role.optional(),
    status: z.enum(['active', 'disabled']).optional(),
    twoStepEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Send at least one change.');

export const tempPasswordSchema = z.strictObject({ password });

export const listUsersQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  role: role.optional(),
  status: z.enum(['pending', 'active', 'disabled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
