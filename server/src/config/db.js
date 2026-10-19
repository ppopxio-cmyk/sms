import mongoose from 'mongoose';
import { env } from './env.js';

mongoose.set('strictQuery', true);
mongoose.set('sanitizeFilter', true);

export async function connectDB(uri = env.MONGODB_URI) {
  await mongoose.connect(uri, { maxPoolSize: 20, serverSelectionTimeoutMS: 8000 });
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
