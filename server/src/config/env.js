import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  CLIENT_ORIGIN: z.url().transform((s) => s.replace(/\/+$/, '')),
  TRUST_PROXY: z.coerce.number().default(0),
  MONGODB_URI: z.string().min(10),
  JWT_ACCESS_SECRET: z.string().min(32),
  CODE_HMAC_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('10m'),
  REFRESH_TTL_DAYS: z.coerce.number().default(7),
  REFRESH_ABSOLUTE_DAYS: z.coerce.number().default(30),
  CODE_TTL_MINUTES: z.coerce.number().default(5),
  MAX_DEVICES_USER: z.coerce.number().default(3),
  MAX_DEVICES_ADMIN: z.coerce.number().default(2),
  SMTP_USER: z.email(),
  SMTP_APP_PASSWORD: z.string().min(8),
  MAIL_FROM_NAME: z.string().default('School Management System'),
  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_SUBJECT: z.string().min(1),
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
