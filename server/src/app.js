import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { MAIL_TRANSPORT, verifyMail } from './services/mail.service.js';
import { isAllowedOrigin } from './utils/origin.js';
import { isPrivateAddress } from './utils/geo.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { csrfGuard } from './middleware/csrf.js';
import { notFound, errorHandler } from './middleware/error.js';
import routes from './routes/index.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);

  // Express can only name the nearest hop, and behind the host that is a private address
  // like 10.192.117.149 - unroutable, unplaceable on a map, and shared by everybody. The
  // edge in front states the caller's own address in a header of its own, which a caller
  // cannot forge because the edge overwrites it. Everything that cares about "which
  // address is this" (rate limits, sign-in alerts) reads that instead.
  app.use((req, _res, next) => {
    const edge = String(req.get('cf-connecting-ip') || req.get('true-client-ip') || '')
      .trim()
      .replace(/^::ffff:/, '');
    if (edge && !isPrivateAddress(edge)) {
      try {
        Object.defineProperty(req, 'ip', { value: edge, configurable: true, enumerable: true, writable: true });
      } catch {
        // Express's own answer stays in place; the address is still improved elsewhere.
      }
    }
    next();
  });

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
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Device-Fingerprint', 'X-Device-Info'],
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
  app.get('/api/health', (req, res) =>
    res.json({ ok: true, commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) || null }),
  );

  // What this service thinks the caller's address is. Handy when a sign-in says "unknown
  // place": it shows whether the address arrived at all, without echoing anything else.
  app.get('/api/health/ip', (req, res) => res.json({ ip: req.ip }));

  // Which way mail leaves this server, and whether it can authenticate at this moment.
  // That one answer decides whether a code or a link can reach anybody, and reading it
  // from the running service beats guessing from logs. No secret is ever returned: only
  // the transport, a masked sender, and the names of any Google variables that are absent.
  app.get('/api/health/mail', async (req, res) => {
    const missing = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'].filter(
      (name) => !String(process.env[name] ?? '').trim(),
    );

    try {
      const info = await verifyMail();
      const account = info?.address ? info.address.replace(/^(.).*?(@.*)$/, '$1***$2') : null;
      res.json({ ok: true, transport: MAIL_TRANSPORT, account, missingGoogleVars: missing });
    } catch (err) {
      logger.error({ err: err.message }, 'mail health check failed');
      res.status(503).json({
        ok: false,
        transport: MAIL_TRANSPORT,
        reason: String(err.message).slice(0, 160),
        missingGoogleVars: missing,
      });
    }
  });
  app.use('/api', globalLimiter, csrfGuard, routes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
