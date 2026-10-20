import axios from 'axios';
import { deviceFingerprint } from './fingerprint';
import { primeDeviceInfo } from './device-info';
import { readLocation, locationHeader } from './location';

// Vite proxies /api to the Express server, so this stays same-origin in dev
// and works unchanged if the built site is served by the API in production.
export const API_URL = import.meta.env.VITE_API_URL || '/api';

// The access token lives in memory only. It is never written to localStorage,
// so an injected script cannot read it back after the page is closed.
//
// The refresh cookie is HttpOnly and cannot be read here, so a one-word hint is kept
// instead: it says whether this browser ever had a session. Without it a visitor who has
// never signed in would still ask for a refresh on every visit and be answered 401 - a
// wasted round trip and a scary line in the console.
const SESSION_HINT = 'sms.session';

export const markSessionHint = () => {
  try {
    localStorage.setItem(SESSION_HINT, '1');
  } catch {
    // a browser that refuses storage simply asks once more; nothing breaks
  }
};

export const clearSessionHint = () => {
  try {
    localStorage.removeItem(SESSION_HINT);
  } catch {
    // nothing to do
  }
};

export const hasSessionHint = () => {
  try {
    return localStorage.getItem(SESSION_HINT) === '1';
  } catch {
    return true;
  }
};

let accessToken = null;
let onSessionRefreshed = null;
let onSessionLost = null;

export const setAccessToken = (token) => {
  accessToken = token ?? null;
};

export const getAccessToken = () => accessToken;

export const setSessionHandlers = ({ refreshed, lost }) => {
  onSessionRefreshed = refreshed;
  onSessionLost = lost;
};

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { 'X-Requested-With': 'sms-web', 'X-Device-Fingerprint': deviceFingerprint() },
});

// What the browser will say about its own system, once it has answered (see device-info).
primeDeviceInfo(api);

// A place the person already allowed on this sign-in screen. The header carries only the
// rounded coordinates, and the server turns them into a city and keeps nothing else.
const sharedLocation = readLocation();
if (sharedLocation) api.defaults.headers.common['X-Device-Location'] = locationHeader(sharedLocation);

export const applyLocationHeader = (location) => {
  api.defaults.headers.common['X-Device-Location'] = locationHeader(location);
};

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// A page refresh wipes the in-memory token, so the app asks /auth/refresh once on
// start-up. Two tabs refreshing together are handled server-side by a grace window.
let refreshInFlight = null;

function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post(
        `${API_URL}/auth/refresh`,
        {},
        { withCredentials: true, headers: { 'X-Requested-With': 'sms-web', 'X-Device-Fingerprint': deviceFingerprint() } },
      )
      .then((res) => res.data)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

// Called on start-up. A visitor who has never signed in never reaches the network.
export async function bootstrapSessionIfSignedIn() {
  if (!hasSessionHint()) return null;
  const data = await refreshSession();
  markSessionHint();
  return data;
}

const SESSION_DEAD = new Set(['SESSION_ENDED', 'NO_SESSION', 'TICKET_INVALID']);

// The shell listens for this while the portal is closed. It signs the current person out
// and sends them to the public maintenance screen. Admin requests never produce it unless
// their refresh cookie has also expired, in which case signing in again is the right move.
function announceMaintenance(payload) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('sms:maintenance', { detail: payload ?? null }));
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { config, response } = error;
    const status = response?.status;
    const code = response?.data?.code;

    // Maintenance returns 503 rather than 401. An Admin whose 15-minute access token has
    // expired must still be able to recover, so try one silent refresh and replay. If the
    // refresh cookie belongs to another role, that refresh is refused and the shell is
    // told to show the maintenance page.
    if (status === 503 && code === 'MAINTENANCE' && config) {
      const url = String(config.url || '');
      if (!config._maintenanceRetried && !url.includes('/auth/login') && !url.includes('/auth/refresh')) {
        config._maintenanceRetried = true;
        try {
          const data = await refreshSession();
          setAccessToken(data.accessToken);
          onSessionRefreshed?.(data);
          config.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(config);
        } catch {
          setAccessToken(null);
          onSessionLost?.();
        }
      } else if (!url.includes('/auth/login')) {
        setAccessToken(null);
        onSessionLost?.();
      }

      announceMaintenance(response?.data?.maintenance ?? response?.data?.data?.maintenance);
      throw error;
    }

    if (status !== 401 || !config) throw error;
    if (String(config.url || '').includes('/auth/refresh')) throw error;

    if (code && SESSION_DEAD.has(code)) {
      setAccessToken(null);
      onSessionLost?.();
      throw error;
    }

    // Only an expired access token is worth a silent retry. Anything else
    // (bad password, missing token) is a real answer and is passed through.
    if (code !== 'TOKEN_EXPIRED' || config._retried) throw error;
    config._retried = true;

    try {
      const data = await refreshSession();
      setAccessToken(data.accessToken);
      onSessionRefreshed?.(data);
      config.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(config);
    } catch {
      setAccessToken(null);
      onSessionLost?.();
      throw error;
    }
  },
);

export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  return error?.response?.data?.message || error?.message || fallback;
}

export function errorFields(error) {
  return error?.response?.data?.data?.fields ?? [];
}
