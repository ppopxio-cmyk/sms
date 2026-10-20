// The browser's own location, only after the person allowed it. It is kept in this tab for
// a few hours so a refresh does not ask again, and it is never sent anywhere except this
// API, rounded to about a hundred metres.
const KEY = 'sms.location';
const TTL_MS = 8 * 60 * 60 * 1000;

export function readLocation() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Number.isFinite(parsed?.lat) || !Number.isFinite(parsed?.lon)) return null;
    if (!Number.isFinite(parsed?.at) || Date.now() - parsed.at > TTL_MS) return null;
    return { lat: parsed.lat, lon: parsed.lon };
  } catch {
    return null;
  }
}

export function saveLocation({ lat, lon }) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ lat, lon, at: Date.now() }));
  } catch {
    // storage refused: the sign-in still carries the location for this visit
  }
}

export function clearLocation() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing to do
  }
}

export const locationHeader = ({ lat, lon }) => `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
