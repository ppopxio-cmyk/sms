import crypto from 'node:crypto';
import { UAParser } from 'ua-parser-js';
import DeviceDetector from 'device-detector-js';
import { DEVICE_COOKIE, deviceCookieOptions } from './cookies.js';
import { placeForAddress, isPrivateAddress } from './geo.js';

const UUID = /^[0-9a-f-]{36}$/i;
const FINGERPRINT = /^[0-9a-f]{16,64}$/;
const detector = new DeviceDetector();

// The client hashes a few stable browser signals into a short hex string. Anything
// that does not look exactly like one is ignored, so a caller cannot push arbitrary
// text into the database through this header.
export function deviceFingerprint(req) {
  const raw = String(req.get('x-device-fingerprint') || '')
    .trim()
    .toLowerCase();
  return FINGERPRINT.test(raw) ? raw : null;
}

// One slot per browser. The fingerprint is the better signal because clearing the
// device cookie cannot move you into a free slot, but the cookie is used whenever
// the client does not send one, so older clients still work.
export const deviceKey = (fingerprint, deviceId) => fingerprint || `cookie:${deviceId}`;

export function ensureDeviceId(req, res) {
  let id = req.cookies?.[DEVICE_COOKIE];
  if (!id || !UUID.test(id)) {
    id = crypto.randomUUID();
    res.cookie(DEVICE_COOKIE, id, deviceCookieOptions);
  }
  return id;
}

// ---------------------------------------------------------------------------
// What the device calls itself.
//
// Modern Chrome freezes the version numbers inside the user agent string on purpose: it
// reports "Windows 10" on Windows 11, and "Android 10" on every Android since. The screen
// can do better, because the browser will still answer honestly when asked directly through
// the User-Agent Client Hints API. The client asks once, sends the answer in a small
// header, and this reads it back.
//
// None of it is evidence of anything. It is a label in an alert and on a list, and it is
// never used to decide who anybody is or what they may do.
// ---------------------------------------------------------------------------

const MAX_HINTS = 1200;
const WINDOWS_11_FROM = 13; // the API version Windows 11 starts at
const ANDROID_API = { 8: 26, 9: 28, 10: 29, 11: 30, 12: 31, 13: 33, 14: 34, 15: 35, 16: 36 };

// Model codes carry the maker's name in their first letters, and the phone in the hand is
// the only thing that knows the rest. A code is not the name on the box: that is a
// catalogue question, not a technical one, and no browser can answer it.
const MODEL_BRANDS = [
  [/^(SM|GT|SCH|SGH|SHV|SPH)-/i, 'Samsung'],
  [/^Pixel/i, 'Google'],
  [/^TECNO/i, 'Tecno'],
  [/^Infinix/i, 'Infinix'],
  [/^itel/i, 'itel'],
  [/^(HUAWEI|ANE|MAR|JNY|ELE|VOG|LIO|CLT|LYA)/i, 'Huawei'],
  [/^moto/i, 'Motorola'],
  [/^Nokia/i, 'Nokia'],
  [/^CPH|^OPPO/i, 'OPPO'],
  [/^RMX/i, 'realme'],
  [/^V\d{4}/i, 'vivo'],
  [/^(ONEPLUS|OnePlus)/i, 'OnePlus'],
  [/^XT\d/i, 'Motorola'],
  [/^iPhone|^iPad/i, 'Apple'],
];

const text = (value, max) => (typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined);

function readHints(req) {
  const raw = String(req.get('x-device-info') || '');
  if (!raw || raw.length > MAX_HINTS) return null;

  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    return {
      platform: text(parsed.platform, 40),
      platformVersion: text(parsed.platformVersion, 20),
      model: text(parsed.model, 60),
      architecture: text(parsed.architecture, 20),
      bitness: text(parsed.bitness, 8),
      browser: text(parsed.browser, 40),
      browserVersion: text(parsed.browserVersion, 20),
      mobile: typeof parsed.mobile === 'boolean' ? parsed.mobile : undefined,
    };
  } catch {
    return null;
  }
}

const bitness = (hints) => {
  if (!hints?.architecture) return '';
  const arm = hints.architecture === 'arm';
  if (arm && hints.bitness === '64') return 'ARM64';
  if (!arm && hints.bitness === '64') return 'x64';
  if (arm && hints.bitness === '32') return 'ARM';
  return hints.bitness === '32' ? 'x86' : hints.architecture;
};

function systemLabel(hints, ua) {
  const name = hints?.platform || ua.os.name || '';
  const version = hints?.platformVersion || ua.os.version || '';

  if (name === 'Windows') {
    const major = Number.parseInt(version, 10);
    const edition = Number.isFinite(major) && major >= WINDOWS_11_FROM ? 'Windows 11' : 'Windows 10';
    const bits = bitness(hints);
    return bits ? `${edition} ${bits}` : edition;
  }

  if (name === 'Android') {
    const major = Number.parseInt(version, 10);
    if (!Number.isFinite(major)) return 'Android';
    const api = ANDROID_API[major];
    return api ? `Android ${major} (${api})` : `Android ${major}`;
  }

  if (name === 'macOS' || name === 'Mac OS X') {
    const bits = bitness(hints);
    return [`macOS ${version}`.trim(), bits].filter(Boolean).join(' ');
  }

  if (name === 'Chrome OS') return `Chrome OS ${version}`.trim();
  if (name === 'iOS') return `iOS ${version}`.trim();

  return [name, version].filter(Boolean).join(' ') || 'Unknown system';
}

const BROWSER_NAMES = {
  'Google Chrome': 'Chrome',
  'Microsoft Edge': 'Edge',
  Chromium: 'Chromium',
};

function browserLabel(ua, hints) {
  const hintName = hints?.browser ? BROWSER_NAMES[hints.browser] ?? hints.browser : '';
  const name = hintName || ua.browser.name;
  const version = hints?.browserVersion || ua.browser.version || '';
  const major = String(version).split('.')[0];
  return [name, major].filter(Boolean).join(' ') || 'Unknown browser';
}

function typeLabel(hints, ua) {
  if (hints?.mobile === true) return 'mobile';
  if (hints?.mobile === false) return ua.device?.type || 'desktop';
  return ua.device?.type || (hints ? 'desktop' : 'desktop');
}

function brandFor(model) {
  const hit = MODEL_BRANDS.find(([pattern]) => pattern.test(model));
  return hit?.[1];
}

function deviceLabel(hints, ua) {
  // What the browser itself reported. On a phone this is the maker's model code, which is
  // still far better than "Mobile Chrome".
  if (hints?.model) {
    const brand = brandFor(hints.model);
    return brand && !hints.model.toLowerCase().startsWith(brand.toLowerCase())
      ? `${brand} ${hints.model}`
      : hints.model;
  }

  // Browsers that still put the model in the string, and iPhones and iPads.
  const model = ua.device?.model;
  if (model) {
    const vendor = ua.device?.vendor;
    return vendor && !model.toLowerCase().startsWith(vendor.toLowerCase()) ? `${vendor} ${model}` : model;
  }

  const parsed = detector.parse(ua.ua || '');
  if (parsed?.device?.brand && parsed?.device?.model) return `${parsed.device.brand} ${parsed.device.model}`;

  return null;
}

// Express reports whatever the nearest hop is, and behind a hosting provider that is often
// an address like 10.195.250.39 - private, unroutable, and impossible to place on a map.
// The edge in front of the service states the caller's own address in a header of its own,
// which a caller cannot set. Where that header is absent, whatever Express worked out from
// the forwarded chain is used.
function clientAddress(req) {
  for (const name of ['cf-connecting-ip', 'true-client-ip']) {
    const value = String(req.get(name) || '').trim().replace(/^::ffff:/, '');
    if (value && !isPrivateAddress(value) && value !== '::1' && value !== '127.0.0.1') return value;
  }
  return req.ip || req.socket?.remoteAddress || '';
}

export async function describeRequest(req) {
  const agent = req.get('user-agent') || '';
  const ua = new UAParser(agent).getResult();
  const hints = readHints(req);
  const ip = clientAddress(req);

  return {
    ip,
    userAgent: agent.slice(0, 300),
    browser: browserLabel(ua, hints),
    os: systemLabel(hints, ua),
    deviceType: typeLabel(hints, ua),
    deviceName: deviceLabel(hints, ua),
    location: await placeForAddress(ip),
  };
}
