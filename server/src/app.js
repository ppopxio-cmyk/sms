import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { MAIL_TRANSPORT, getActiveTransport, verifyMail } from './services/mail.service.js';
import { isAllowedOrigin } from './utils/origin.js';
import { resolveClient } from './utils/device.js';
import { isPrivateAddress } from './utils/geo.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { csrfGuard } from './middleware/csrf.js';
import { notFound, errorHandler } from './middleware/error.js';
import { maintenanceGuard } from './middleware/maintenance.js';
import { getSettings, maintenanceState, publicSettings } from './services/settings.service.js';
import routes from './routes/index.js';
import { imagekitWebhook } from './controllers/registrar.webhook.controller.js';
import { chapaWebhookHandler } from './controllers/portalPayment.controller.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);

  // Express can only name the nearest hop. The browser normally reaches this API through
  // Vercel, whose edge marker lets us use the address Vercel overwrote. A direct call to
  // the API hostname instead uses Cloudflare's own header. An arbitrary X-Forwarded-For
  // sent by a caller is ignored. Everything that cares which address this is (rate limits,
  // sign-in alerts) uses that answer instead of a private hop behind it.
  app.use((req, _res, next) => {
    const { ip } = resolveClient(req);
    const usable = Boolean(ip) && ip !== '::1' && !ip.startsWith('127.') && !isPrivateAddress(ip);
    if (usable && ip !== req.ip) {
      try {
        Object.defineProperty(req, 'ip', { value: ip, configurable: true, enumerable: true, writable: true });
      } catch {
        // Express's own answer stays in place; the display path resolves it separately.
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
        // X-Device-Location remains allowed for one release so a browser still running
        // cached old JavaScript does not fail its CORS preflight. The server no longer
        // reads it; new clients do not send it.
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Device-Fingerprint', 'X-Device-Info', 'X-Device-Location', 'CF-Turnstile-Response'],
        exposedHeaders: ['Content-Disposition', 'X-Export-Rows', 'Server-Timing'],
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
  // ImageKit signs the exact bytes it sends. This route must read the raw body before
  // the JSON parser consumes it, and it is deliberately outside the API's CSRF and
  // maintenance gates: the provider is not a browser session.
  app.post(
    '/api/webhooks/imagekit',
    express.raw({ type: 'application/json', limit: '1mb' }),
    imagekitWebhook,
  );
  // Chapa webhook signs raw request body with HMAC-SHA256 in x-chapa-signature header.
  app.post(
    '/api/webhooks/chapa',
    express.raw({ type: 'application/json', limit: '2mb' }),
    chapaWebhookHandler,
  );
  app.use(express.json({ limit: '30mb' }));
  app.use(express.urlencoded({ extended: true, limit: '30mb' }));
  app.use(cookieParser());

  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store'); // private data must never sit in a browser or proxy cache
    next();
  });
  app.get('/api/health', (req, res) =>
    res.json({ ok: true, commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) || null }),
  );

  // Public and deliberately small. The sign-in screen and the shell use this to say
  // that the portal is closed without asking a visitor to sign in first.
  app.get('/api/status', async (req, res) => {
    try {
      const settings = await getSettings();
      const safe = publicSettings(settings);
      res.json({
        ok: true,
        name: safe.institution?.name || 'College portal',
        shortName: safe.institution?.shortName || 'SMS',
        maintenance: maintenanceState(settings),
        generatedAt: new Date(),
      });
    } catch {
      res.status(503).json({ ok: false, maintenance: { enabled: false }, message: 'Status is temporarily unavailable.' });
    }
  });

  // What this service thinks the caller's address and place are, and which header it
  // believed. Handy when a sign-in says the wrong country: it shows where the answer came
  // from without echoing anything else.
  app.get('/api/health/ip', (req, res) => {
    const { ip, via } = resolveClient(req);
    let city = String(req.get('x-vercel-ip-city') || '');
    try {
      city = decodeURIComponent(city);
    } catch {
      // leave it as it arrived; it is only a label
    }
    res.json({
      ip,
      via,
      city: city || null,
      country: req.get('x-vercel-ip-country') || null,
      // Which of the address headers actually arrived. Names only; the values are what is
      // already shown above.
      saw: [
        'x-vercel-id',
        'x-real-ip',
        'x-forwarded-for',
        'x-vercel-forwarded-for',
        'cf-connecting-ip',
        'x-vercel-ip-city',
        'x-vercel-ip-country',
        'x-vercel-ip-country-region',
      ].filter((name) => Boolean(req.get(name))),
    });
  });

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
      res.json({ ok: true, transport: getActiveTransport?.() || MAIL_TRANSPORT, account, missingGoogleVars: missing });
    } catch (err) {
      logger.error({ err: err.message }, 'mail health check failed');
      res.status(503).json({
        ok: false,
        transport: getActiveTransport?.() || MAIL_TRANSPORT,
        reason: String(err.message).slice(0, 160),
        missingGoogleVars: missing,
      });
    }
  });
  app.use('/api', globalLimiter, csrfGuard, maintenanceGuard, routes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
