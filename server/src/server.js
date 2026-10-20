import mongoose from 'mongoose';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';
import { logger } from './utils/logger.js';
import { flushAudit } from './services/audit.service.js';
import { startAnnouncementScheduler } from './services/announcement.service.js';

await connectDB();
await Promise.all(Object.values(mongoose.models).map((m) => m.init())); // make sure indexes exist

const stopScheduler = startAnnouncementScheduler();
const app = createApp();
const server = app.listen(env.PORT, () => logger.info(`API ready on http://localhost:${env.PORT}`));

const stop = (signal) => {
  logger.info(`${signal} received, shutting down`);
  stopScheduler();
  server.close(async () => {
    await flushAudit();
    await disconnectDB();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled rejection'));
