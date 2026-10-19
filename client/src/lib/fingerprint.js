const STORE_KEY = 'sms.device.fp';
const VALID = /^[0-9a-f]{16,64}$/;

// FNV-1a run twice with different seeds, so the result is 16 hex characters. No
// library, no canvas: a handful of stable signals is plenty for counting device
// slots. The server never treats this as proof of who somebody is.
function hash(input) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
    h2 ^= h2 >>> 13;
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

function signals() {
  const nav = navigator;
  const zone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    } catch {
      return '';
    }
  })();
  return [
    nav.userAgent,
    nav.platform ?? '',
    nav.language ?? '',
    (nav.languages ?? []).join(','),
    screen.width,
    screen.height,
    screen.colorDepth,
    window.devicePixelRatio ?? 1,
    nav.hardwareConcurrency ?? 0,
    nav.maxTouchPoints ?? 0,
    new Date().getTimezoneOffset(),
    zone,
  ].join('|');
}

// Cached per browser in localStorage, so it stays the same until the browser looks
// materially different. Private windows, where storage throws, simply recompute it.
export function deviceFingerprint() {
  try {
    const cached = localStorage.getItem(STORE_KEY);
    if (cached && VALID.test(cached)) return cached;
    const fresh = hash(signals());
    localStorage.setItem(STORE_KEY, fresh);
    return fresh;
  } catch {
    return hash(signals());
  }
}
