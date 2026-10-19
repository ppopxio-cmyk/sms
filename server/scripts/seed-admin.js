import 'dotenv/config';
import argon2 from 'argon2';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';

const { ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD } = process.env;

const GMAIL = /^[a-z0-9][a-z0-9._%+-]*@gmail\.com$/;

if (!ADMIN_EMAIL || !ADMIN_NAME || !ADMIN_PASSWORD) {
  console.error('Add ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD to server/.env, run this again, then delete those three lines.');
  process.exit(1);
}

const email = ADMIN_EMAIL.trim().toLowerCase();
const name = ADMIN_NAME.trim();

// The same rules the API enforces, checked here first. Otherwise it would be easy
// to create an admin account that can never pass sign-in validation.
if (!GMAIL.test(email)) {
  console.error('ADMIN_EMAIL must be a Gmail address, for example you@gmail.com.');
  process.exit(1);
}

const words = name.split(/\s+/).filter(Boolean);
const realWords = words.every((word) => word.replace(/[^\p{L}]/gu, '').length >= 2);
if (name.length < 5 || words.length < 2 || !realWords) {
  console.error('ADMIN_NAME must be a first and last name, for example Haile Michael.');
  process.exit(1);
}

if (ADMIN_PASSWORD.length < 10 || !/[A-Za-z]/.test(ADMIN_PASSWORD) || !/[0-9]/.test(ADMIN_PASSWORD)) {
  console.error('ADMIN_PASSWORD must be at least 10 characters and contain a letter and a number.');
  process.exit(1);
}

await connectDB();

try {
  if (await User.exists({ email })) {
    console.log('That email already has an account. Nothing changed.');
  } else {
    await User.create({
      name,
      email,
      passwordHash: await argon2.hash(ADMIN_PASSWORD),
      role: 'ADMIN',
      status: 'active',
      emailVerified: true,
      twoStepEnabled: true,
    });
    console.log(`Admin created: ${email}. 2-step verification is on for this account.`);
  }
} finally {
  await disconnectDB();
}
