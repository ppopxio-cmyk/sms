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
// The single administrator cannot be handed out, so it is not something an
// administrator can pick when creating an account.
const assignableRole = z.enum(ROLES.filter((value) => value !== 'ADMIN'));
const code = z.string().regex(/^[0-9]{6}$/, 'The code is 6 digits.');
const ticket = z.string().min(10).max(2000);
const adminPassword = z.string().min(1, 'Enter your password.').max(128);

export const emailOnlySchema = z.strictObject({ email });
// Confirming an email carries a link with the token in it, never a typed code.
export const verifyEmailSchema = z.strictObject({ token: ticket });
// The password-reset code is typed together with the address it was sent to, so the
// reset step keeps its own schema; reusing the link schema rejected every attempt.
export const verifyResetCodeSchema = z.strictObject({ email, code });
// Finishing the account: the name and the password are both chosen by the person who
// opened the link in their own mailbox.
export const setupAccountSchema = z.strictObject({ ticket, name, password });
export const loginSchema = z.strictObject({ email, password: z.string().min(1).max(128) });
export const loginVerifySchema = z.strictObject({ ticket, code });
export const ticketSchema = z.strictObject({ ticket });
export const resetPasswordSchema = z.strictObject({ resetToken: ticket, newPassword: password });
export const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1, 'Enter your current password.').max(128),
  newPassword: password,
});
export const twoStepSchema = z.strictObject({ enabled: z.boolean(), currentPassword: z.string().min(1, 'Enter your password.').max(128) });
export const deletePasswordSchema = z.strictObject({ password: z.string().min(1, 'Enter your password.').max(128) });
export const deleteAccountSchema = z.strictObject({
  password: z.string().min(1, 'Enter your password.').max(128),
  code,
});
export const listNotificationsQuerySchema = z.strictObject({
  unread: z.enum(['1', '0']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
// A push subscription is a URL plus the two keys the browser generates for it.
export const pushSubscribeSchema = z.strictObject({
  endpoint: z.url('That push address is not valid.').max(1200),
  keys: z.strictObject({
    p256dh: z.string().min(10).max(400),
    auth: z.string().min(10).max(400),
  }),
});
export const pushUnsubscribeSchema = z.strictObject({ endpoint: z.url('That push address is not valid.').max(1200) });
export const idParamSchema = z.strictObject({ id: z.string().regex(/^[a-f0-9]{24}$/i, 'That id is not valid.') });
export const sessionConfirmSchema = z.strictObject({ code });

// A device name a person chose for their own browser ("HP EliteBook 830 G8"), because no
// browser on Windows will ever reveal the hardware model by itself.
export const sessionNameSchema = z.strictObject({
  label: z
    .string()
    .trim()
    .min(2, 'Use at least two characters.')
    .max(40, 'That name is too long.'),
});

// ---- Accounts that an administrator creates ------------------------------------
// An account starts as nothing but an email address and a role. No password is chosen,
// stored or handed over: the person picks their own full name and password when they
// open the link that confirms the address.
export const createUserSchema = z.strictObject({ email, role: assignableRole });

// Editing an account means turning it on or off. Both that and removing an account ask
// for the administrator's own password again before anything happens.
export const updateUserSchema = z.strictObject({
  status: z.enum(['active', 'disabled']),
  password: adminPassword,
});

export const removeUserSchema = z.strictObject({ password: adminPassword });

// Two characters is the shortest search worth a round trip; the header waits for typing to
// pause before it asks.
export const searchQuerySchema = z.strictObject({
  q: z.string().trim().min(2, 'Type at least two characters.').max(60),
});

export const listUsersQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  role: role.optional(),
  status: z.enum(['pending', 'active', 'disabled']).optional(),
  sort: z.enum(['createdAt', 'lastLoginAt', 'name', 'email', 'role', 'status']).default('createdAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
