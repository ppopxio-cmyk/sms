import crypto from 'node:crypto';
import { UAParser } from 'ua-parser-js';
import { DEVICE_COOKIE, deviceCookieOptions } from './cookies.js';

const UUID = /^[0-9a-f-]{36}$/i;
let geo;

export function ensureDeviceId(req, res) {
  let id = req.cookies?.[DEVICE_COOKIE];
  if (!id || !UUID.test(id)) {
    id = crypto.randomUUID();
    res.cookie(DEVICE_COOKIE, id, deviceCookieOptions);
  }
  return id;
}

async function lookupLocation(ip) {
  const clean = ip.replace('::ffff:', '');
  if (!clean || clean === '::1' || clean === '127.0.0.1') return 'This computer';
  geo ??= (await import('geoip-lite')).default;
  const hit = geo.lookup(clean);
  return hit ? [hit.city, hit.country].filter(Boolean).join(', ') : 'Unknown location';
}

export async function describeRequest(req) {
  const agent = req.get('user-agent') || '';
  const ua = new UAParser(agent).getResult();
  const ip = req.ip || '';
  return {
    ip,
    userAgent: agent.slice(0, 300),
    browser: ua.browser.name ? `${ua.browser.name} ${ua.browser.major ?? ''}`.trim() : 'Unknown browser',
    os: ua.os.name ? `${ua.os.name} ${ua.os.version ?? ''}`.trim() : 'Unknown system',
    deviceType: ua.device.type || 'desktop',
    location: await lookupLocation(ip),
  };
}
