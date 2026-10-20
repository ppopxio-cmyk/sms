import { logger } from './logger.js';

// Where a sign-in came from, as far as an address can say. Nothing here is precise: a mobile
// carrier hands out addresses registered somewhere else entirely, and an office proxy can
// hide the town. Every screen that shows this says so.
//
// Two sources are used. The bundled database answers instantly and offline, but it often
// knows only the country. When it cannot name a city, one lookup service is asked (over
// HTTPS, no key, nothing but the address is sent) and the answer is kept for a few hours.
// The address is a caller's own, already visible to every server it reaches.
let regionNames = null;
try {
  regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
} catch {
  // an older runtime: the two-letter code is still shown
}

let geoip;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map(); // key -> { place, until }

// Addresses that cannot be looked up and should never pretend to be a place.
const PRIVATE =
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|127\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|f[cd][0-9a-f]{2}:|fe80:|::1$)/i;

export const isPrivateAddress = (ip) => PRIVATE.test(String(ip || '').replace(/^::ffff:/, ''));

export const countryName = (code) => {
  const value = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(value)) return '';
  return regionNames?.of(value) ?? value;
};

const remember = (key, place) => {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { place, until: Date.now() + CACHE_TTL_MS });
  return place;
};

async function askOnline(ip) {
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(1200),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return '';
    const data = await res.json();
    if (!data?.success) return '';
    return [data.city || data.region, data.country].filter(Boolean).join(', ');
  } catch {
    return '';
  }
}

export async function placeForAddress(rawIp) {
  const ip = String(rawIp ?? '').replace(/^::ffff:/, '').trim();
  if (!ip) return 'Unknown place';
  if (ip === '::1' || ip.startsWith('127.')) return 'This computer';
  if (isPrivateAddress(ip)) return 'Local network';

  const hitCache = cache.get(ip);
  if (hitCache && hitCache.until > Date.now()) return hitCache.place;

  let city = '';
  let country = '';
  try {
    geoip ??= (await import('geoip-lite')).default;
    const hit = geoip.lookup(ip);
    if (hit) {
      city = hit.city || '';
      country = countryName(hit.country);
    }
  } catch (err) {
    logger.error({ err: err.message }, 'the bundled address database could not be read');
  }

  if (city) return remember(ip, [city, country].filter(Boolean).join(', '));

  const online = await askOnline(ip);
  if (online) return remember(ip, online);

  return remember(ip, country || 'Unknown place');
}

// The place the person themselves allowed the browser to share. The coordinates never
// leave this function: only a city and a country are kept, and only for a sign-in record.
// OpenStreetMap's service is free, needs no key, and asks for a name in the request, which
// is why one is sent.
export async function placeForCoordinates(lat, lon) {
  const rounded = `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`;
  const hitCache = cache.get(`c:${rounded}`);
  if (hitCache && hitCache.until > Date.now()) return hitCache.place;

  try {
    const url =
      'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&accept-language=en' +
      `&lat=${Number(lat).toFixed(4)}&lon=${Number(lon).toFixed(4)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(1800),
      headers: {
        accept: 'application/json',
        'user-agent': 'SchoolManagementSystem/1.0 (sign-in location record)',
      },
    });
    if (!res.ok) return '';
    const data = await res.json();
    const address = data?.address ?? {};
    const city = address.city || address.town || address.village || address.municipality || address.county || address.state || '';
    const country = address.country || countryName(address.country_code);
    return remember(`c:${rounded}`, [city, country].filter(Boolean).join(', '));
  } catch {
    return '';
  }
}
