import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { isAllowedOrigin } from './utils/origin.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { csrfGuard } from './middleware/csrf.js';
import { notFound, errorHandler } from './middleware/error.js';
import routes from './routes/index.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);

  app.use(helmet());
  // CORS uses the exact same origin test as the CSRF guard, so a request can
  // never pass one and fail the other. origin: true reflects the caller's own
  // origin and sets Vary: Origin; false sends no CORS headers at all.
  app.use(
    cors((req, callback) => {
      callback(null, {
        origin: isAllowedOrigin(req, req.get('origin')),
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Device-Fingerprint'],
        maxAge: 600,
      });
    }),
  );
  // The live notification stream must never be compressed: compressing it would hold
  // notices back in a buffer instead of sending them the moment they happen.
  app.use(
    compression({
      filter: (req, res) => !req.path.includes('/notifications/stream') && compression.filter(req, res),
    }),
  );
  app.use(pinoHttp({ logger, autoLogging: env.NODE_ENV !== 'test' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store'); // private data must never sit in a browser or proxy cache
    next();
  });
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api', globalLimiter, csrfGuard, routes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
