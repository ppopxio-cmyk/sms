import { env } from '../config/env.js';

const normalize = (value) => {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return null;
  }
};

const hostOf = (value) => {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
};

const allowlist = new Set([env.CLIENT_ORIGIN, ...env.CLIENT_ORIGINS].map(normalize).filter(Boolean));

// Browsers only send Origin on real page requests, so a value we do not recognise
// is the signature of a cross-site call. A request is trusted when either:
//   1. its Origin host is the same host the browser asked for, which holds on
//      localhost, 127.0.0.1, a LAN address and any dev port, or
//   2. it appears on the explicit allowlist, which covers reverse proxies that
//      rewrite the Host header.
// Used by both the CSRF guard and CORS so the two can never disagree.
export function isAllowedOrigin(req, origin) {
  if (!origin) return true; // curl, server-to-server, or a same-site request without an Origin

  const normalized = normalize(origin);
  if (!normalized) return false;
  if (allowlist.has(normalized)) return true;

  const requestHost = (req.get('host') || '').toLowerCase();
  return Boolean(requestHost) && hostOf(origin) === requestHost;
}
