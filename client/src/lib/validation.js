import { z } from 'zod';

// These mirror server/src/validators/auth.schemas.js exactly. If they ever drift,
// the client would either block something the API accepts or promise something
// the API rejects, so change both together.

const GMAIL = /^[a-z0-9][a-z0-9._%+-]*@gmail\.com$/;

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address.')
  .max(254, 'That email is too long.')
  .refine((value) => GMAIL.test(value), 'Use a Gmail address ending in @gmail.com.');

export const passwordField = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(128, 'That password is too long.')
  .regex(/[A-Za-z]/, 'Add at least one letter.')
  .regex(/[0-9]/, 'Add at least one number.');

export const nameField = z
  .string()
  .trim()
  .min(5, 'Enter your full name, at least 5 characters.')
  .max(100, 'That name is too long.')
  .refine((value) => {
    const words = value.split(/\s+/).filter(Boolean);
    return words.length >= 2 && words.every((word) => word.replace(/[^\p{L}]/gu, '').length >= 2);
  }, 'Enter your first name and your last name.');

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Enter your password.'),
});

export const emailOnlySchema = z.object({ email: emailField });

export const resetPasswordSchema = z
  .object({ password: passwordField, confirm: z.string().min(1, 'Repeat your new password.') })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The two passwords do not match.' });

// Choosing your own password, with the repeat check. Used by the reset wizard, which
// has nothing else to prove: the reset ticket was the proof.
export const newPasswordSchema = z
  .object({ password: passwordField, confirm: z.string().min(1, 'Repeat your new password.') })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The two passwords do not match.' });

// A voluntary change from the profile page always proves the current password.
export const mePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    password: passwordField,
    confirm: z.string().min(1, 'Repeat your new password.'),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The two passwords do not match.' });

export const passwordOnlySchema = z.object({ currentPassword: z.string().min(1, 'Enter your password.') });

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Enter your password.'),
  code: z.string().regex(/^[0-9]{6}$/, 'The code is 6 digits.'),
});

// Accounts are created by an administrator, never by the person themselves.
export const ROLES = ['ADMIN', 'REGISTRAR', 'TEACHER', 'ACCOUNTANT'];

// The system has exactly one administrator, so ADMIN is not something an administrator
// can hand out. The only way to get one is the seed script.
export const ASSIGNABLE_ROLES = ['REGISTRAR', 'TEACHER', 'ACCOUNTANT'];

// An account starts as an email address and a role. The person chooses their own name
// and password when they open the link that confirms the address.
export const createUserSchema = z.object({
  email: emailField,
  role: z.enum(ASSIGNABLE_ROLES),
});

// Editing an account is turning it on or off, confirmed with the administrator's own
// password.
export const editUserSchema = z.object({
  status: z.enum(['active', 'disabled']),
  password: z.string().min(1, 'Enter your password.'),
});

// Removing an account keeps the record but hides it, and asks for the same proof.
export const removeUserSchema = z.object({
  password: z.string().min(1, 'Enter your password.'),
});

// The second half of the very first sign-up, right after the link is opened: the name
// and the password are both chosen by the person themselves.
export const setupAccountSchema = z
  .object({
    name: nameField,
    password: passwordField,
    confirm: z.string().min(1, 'Repeat your password.'),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The two passwords do not match.' });

// The first three are exactly what the API requires, so a full green meter means
// the server will accept the password. The last two only add strength.
export const PASSWORD_RULES = [
  { id: 'length', label: '8 or more characters', required: true, test: (v) => v.length >= 8 },
  { id: 'letter', label: 'One letter', required: true, test: (v) => /[A-Za-z]/.test(v) },
  { id: 'number', label: 'One number', required: true, test: (v) => /[0-9]/.test(v) },
  { id: 'long', label: '12 or more characters', required: false, test: (v) => v.length >= 12 },
  { id: 'symbol', label: 'One symbol', required: false, test: (v) => /[^A-Za-z0-9]/.test(v) },
];

const LABELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];

export function meterState(value = '') {
  const rules = PASSWORD_RULES.map((rule) => ({ ...rule, ok: rule.test(value) }));
  const required = rules.filter((r) => r.required);
  const okRequired = required.filter((r) => r.ok).length;
  const bonus = rules.filter((r) => !r.required && r.ok).length;

  let score = okRequired; // 0..3 from the required rules
  if (okRequired === required.length && bonus > 0) score = 4; // bonus pushes it to Strong

  return { rules, score, max: 4, label: LABELS[score], valid: okRequired === required.length };
}
