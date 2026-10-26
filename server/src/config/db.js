import mongoose from 'mongoose';
import { env } from './env.js';

mongoose.set('strictQuery', true);
mongoose.set('sanitizeFilter', true);

export async function connectDB(uri = env.MONGODB_URI, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await mongoose.connect(uri, { maxPoolSize: 20, serverSelectionTimeoutMS: 30000 });
      return mongoose.connection;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.log(`MongoDB connection attempt ${attempt} failed. Retrying in 3s... (${err.message})`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
