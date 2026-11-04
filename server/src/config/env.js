import 'dotenv/config';
import { z } from 'zod';

// A blank line in .env means "not set yet", not "set to nothing", so an empty value is
// treated as missing rather than failing validation.
const optionalText = (schema) =>
  z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), schema.optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  CLIENT_ORIGIN: z.url().transform((s) => s.replace(/\/+$/, '')),
  // Optional extra origins, comma-separated. Useful when the dev server lands on
  // another port, or when the site is served from a second domain in production.
  CLIENT_ORIGINS: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').map((v) => v.trim().replace(/\/+$/, '')).filter(Boolean) : [])),
  TRUST_PROXY: z.coerce.number().default(0),
  MONGODB_URI: z.string().min(10),
  JWT_ACCESS_SECRET: z.string().min(32),
  CODE_HMAC_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('2d'),
  REFRESH_TTL_DAYS: z.coerce.number().default(7),
  REFRESH_ABSOLUTE_DAYS: z.coerce.number().default(30),
  CODE_TTL_MINUTES: z.coerce.number().default(5),
  // How long somebody must wait between two codes for the same purpose.
  CODE_RESEND_WAIT_SECONDS: z.coerce.number().default(30),
  // The confirmation email carries a link, not a code. The link is single use.
  VERIFY_LINK_TTL_HOURS: z.coerce.number().default(3),
  // How long a password-reset link sent by an administrator stays usable.
  // How long the "finish your account" step stays open after an email is confirmed.
  SETUP_TICKET_TTL_MINUTES: z.coerce.number().default(30),
  RESET_LINK_TTL_MINUTES: z.coerce.number().default(30),
  // Notifications clear themselves after this many days.
  NOTIFICATION_TTL_DAYS: z.coerce.number().default(30),
  MAX_DEVICES_USER: z.coerce.number().default(3),
  MAX_DEVICES_ADMIN: z.coerce.number().default(2),
  // Email leaves the building in one of two ways. The app password uses SMTP, which is
  // fine on a development machine but blocked by hosts that close the SMTP ports. The
  // Gmail API is plain HTTPS on 443, so that is the one that survives production.
  // SMTP_USER is the school's own address in both cases, and one complete credential
  // set is required (checked below).
  SMTP_USER: z.email(),
  SMTP_APP_PASSWORD: optionalText(z.string().min(8)),
  GOOGLE_CLIENT_ID: optionalText(z.string().min(1)),
  GOOGLE_CLIENT_SECRET: optionalText(z.string().min(1)),
  GOOGLE_REFRESH_TOKEN: optionalText(z.string().min(1)),
  MAIL_FROM_NAME: z.string().default('School Management System'),
  // Cloudflare Turnstile guards the public sign-in, reset and resend screens. A blank value
  // turns the check off, which is what local development uses; production must set it.
  TURNSTILE_SECRET_KEY: optionalText(z.string().min(10)),
  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_SUBJECT: z.string().min(1),
  // ImageKit is the only binary store for student photos and certificate branding.
  // Missing values keep the API running, but upload and certificate operations return
  // a clear configuration error instead of pretending to succeed.
  IMAGEKIT_PUBLIC_KEY: optionalText(z.string().min(1)),
  IMAGEKIT_PRIVATE_KEY: optionalText(z.string().min(1)),
  IMAGEKIT_URL_ENDPOINT: optionalText(z.url().transform((s) => s.replace(/\/+$/, ''))),
  IMAGEKIT_WEBHOOK_SECRET: optionalText(z.string().min(1)),
  IMAGEKIT_ENDPOINT_URL: optionalText(z.url()),
  IMAGEKIT_PHOTO_MAX_BYTES: z.coerce.number().int().min(100_000).max(15_000_000).default(5_000_000),
  IMAGEKIT_PHOTO_MIN_PX: z.coerce.number().int().min(100).max(4000).default(300),
  CERTIFICATE_PHOTO_MIN_PX: z.coerce.number().int().min(100).max(4000).default(472),
  BREVO_API_KEY: optionalText(z.string().min(10)),
  BREVO_SENDER_NAME: optionalText(z.string().min(1)),
  BREVO_SENDER_EMAIL: optionalText(z.string().email()),
  BREVO_WEBHOOK_SECRET: optionalText(z.string().min(1)),
  // Chapa payment gateway (API v2 / v1 hosted checkout)
  CHAPA_PUBLIC_KEY: optionalText(z.string().min(1)),
  CHAPA_SECRET_KEY: optionalText(z.string().min(1)),
  CHAPA_ENCRYPTION_KEY: optionalText(z.string().min(1)),
  CHAPA_WEBHOOK_URL: optionalText(z.string()),
  CHAPA_WEBHOOK_SECRET: optionalText(z.string().min(1)),
  CHAPA_API_BASE_URL: z.string().default('https://api.chapa.co'),
  CHAPA_ENVIRONMENT: z.enum(['test', 'live']).default('test'),
}).superRefine((value, ctx) => {
  const brevo = Boolean(value.BREVO_API_KEY);
  const smtp = Boolean(value.SMTP_APP_PASSWORD);
  const api = Boolean(value.GOOGLE_CLIENT_ID && value.GOOGLE_CLIENT_SECRET && value.GOOGLE_REFRESH_TOKEN);
  if (!brevo && !smtp && !api) {
    ctx.addIssue({
      code: 'custom',
      message:
        'No way to send email. Set BREVO_API_KEY, SMTP_APP_PASSWORD, or set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN.',
    });
  }
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Your server/.env has a problem:');
  for (const issue of parsed.error.issues) {
    console.error(` - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
// Brevo API (Sendinblue) is prioritized when configured as it delivers transactional
// email reliably over HTTPS without port blocking issues.
export const brevoReady = Boolean(env.BREVO_API_KEY);
// True when all three Google values are present. The Gmail API is preferred whenever it
// is available, because it works on hosts that block the SMTP ports.
export const gmailApiReady = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN);
export const chapaReady = Boolean(env.CHAPA_SECRET_KEY);
