import 'dotenv/config';
import argon2 from 'argon2';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';

const { ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD } = process.env;

if (!ADMIN_EMAIL || !ADMIN_NAME || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 10) {
  console.error('Add ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD (at least 10 characters) to server/.env, run this again, then delete those three lines.');
  process.exit(1);
}

await connectDB();

try {
  const email = ADMIN_EMAIL.trim().toLowerCase();
  if (await User.exists({ email })) {
    console.log('That email already has an account. Nothing changed.');
  } else {
    await User.create({
      name: ADMIN_NAME.trim(),
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
