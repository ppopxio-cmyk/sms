import { logger } from './logger.js';

// Where a sign-in came from, as far as an address can say. Nothing here is precise:
// a mobile carrier hands out addresses registered somewhere else entirely, and an
// office proxy can hide the town. Every screen that shows this says so.
//
// The bundled database answers instantly and offline, but it is easily out of date and
// often knows only the country. The online service is asked first, because it also
// says who owns the address. That matters: a cloud or VPN address belongs to a data
// centre, not to the person signing in, and must not be shown as their country.
//
// The address is a caller's own, already visible to every server it reaches. No
// browser coordinates are accepted or stored. The only value kept is an approximate
// place name and the normalised fields below.
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

export const UNKNOWN_LOCATION = 'Unknown location';

// Addresses that cannot be looked up and should never pretend to be a place.
const PRIVATE =
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|127\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|f[cd][0-9a-f]{2}:|fe80:|::1$)/i;

export const isPrivateAddress = (ip) => PRIVATE.test(String(ip || '').replace(/^::ffff:/, ''));

const clean = (value, max = 80) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
};

const codeOf = (value) => {
  const raw = clean(value, 3).toUpperCase();
  return raw.length === 2 && /^[A-Z]{2}$/.test(raw) ? raw : '';
};

export const countryName = (code) => {
  const value = codeOf(code);
  if (!value) return '';
  return regionNames?.of(value) ?? value;
};

// One shape for every caller. `location` is the human line existing screens already
// display; the other fields are the canonical values new code can query and audit.
export function locationResult({
  location,
  city = '',
  region = '',
  country = '',
  countryCode = '',
  locationSource = 'network',
  detectionStatus = 'estimated',
  detectedAt = new Date(),
} = {}) {
  const code = codeOf(countryCode);
  const countryLabel = clean(country) || countryName(code);
  const cityLabel = clean(city);
  const regionLabel = clean(region);
  const place =
    clean(location) ||
    [cityLabel || regionLabel, countryLabel].filter(Boolean).join(', ') ||
    UNKNOWN_LOCATION;

  return {
    location: place,
    country: countryLabel,
    countryCode: code,
    city: cityLabel,
    region: regionLabel,
    locationSource,
    detectionStatus,
    detectedAt,
  };
}

export function localLocation(ip) {
  const address = String(ip || '').replace(/^::ffff:/, '');
  if (!address || address === '::1' || address.startsWith('127.')) {
    return locationResult({
      location: 'This computer',
      locationSource: 'local',
      detectionStatus: 'local',
    });
  }
  return locationResult({
    location: 'Local network',
    locationSource: 'local',
    detectionStatus: 'local',
  });
}

const remember = (key, place) => {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { place, until: Date.now() + CACHE_TTL_MS });
  return place;
};

// Cloud, hosting and VPN addresses describe the proxy, never the person. The list is
// deliberately about providers, not countries: a normal Ethiopian mobile address is
// untouched. If the provider cannot tell us who owns the address, we leave the normal
// country answer in place.
const HOSTING =
  /(amazon|aws|google cloud|microsoft azure|\bazure\b|digitalocean|linode|hetzner|\bovh\b|leaseweb|contabo|m247|oracle cloud|fastly|akamai|cloudflare|vercel|render|hosting|data ?cent(er|re)|\bvpn\b|\bproxy\b|\bcolo\b)/i;

const ownerText = (data) =>
  [data?.connection?.org, data?.connection?.isp, data?.connection?.domain]
    .filter(Boolean)
    .join(' ')
    .slice(0, 240);

async function askOnline(ip) {
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(1200),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.success) return null;

    if (HOSTING.test(ownerText(data))) {
      return locationResult({
        detectionStatus: 'proxy',
        locationSource: 'network',
      });
    }

    return locationResult({
      city: data.city,
      region: data.region,
      country: data.country,
      countryCode: data.country_code,
      locationSource: 'network',
      detectionStatus: 'estimated',
    });
  } catch {
    return null;
  }
}

// The offline database is a last resort. It is not allowed to supply a city here:
// an outdated city is worse than a country, and the online answer is tried first.
async function offlineAddress(ip) {
  try {
    geoip ??= (await import('geoip-lite')).default;
    const hit = geoip.lookup(ip);
    if (!hit?.country) return null;
    return locationResult({
      countryCode: hit.country,
      locationSource: 'network',
      detectionStatus: 'estimated',
    });
  } catch (err) {
    logger.error({ err: err.message }, 'the bundled address database could not be read');
    return null;
  }
}

export async function lookupAddress(rawIp) {
  const ip = String(rawIp ?? '').replace(/^::ffff:/, '').trim();
  if (!ip) {
    return locationResult({
      detectionStatus: 'unavailable',
      locationSource: 'none',
    });
  }
  if (ip === '::1' || ip.startsWith('127.') || isPrivateAddress(ip)) {
    return localLocation(ip);
  }

  const hitCache = cache.get(ip);
  if (hitCache && hitCache.until > Date.now()) return hitCache.place;

  const online = await askOnline(ip);
  if (online) return remember(ip, online);

  const offline = await offlineAddress(ip);
  if (offline) return remember(ip, offline);

  return remember(
    ip,
    locationResult({
      detectionStatus: 'unavailable',
      locationSource: 'none',
    }),
  );
}

// Kept for callers that only need the sentence. New code should use lookupAddress so
// the country, city and detection status travel together.
export async function placeForAddress(rawIp) {
  return (await lookupAddress(rawIp)).location;
}
