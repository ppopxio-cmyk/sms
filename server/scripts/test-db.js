import { connectDB, disconnectDB } from '../src/config/db.js';

try {
  const started = Date.now();
  const conn = await connectDB();
  await conn.db.admin().ping();
  console.log(`MongoDB connected: database '${conn.name}' answered in ${Date.now() - started} ms`);
} catch (err) {
  console.error('MongoDB connection failed:', err.message);
  console.error('Check MONGODB_URI, the database user password, and that your IP is allowed in Atlas Network Access.');
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
