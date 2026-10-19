import axios from 'axios';
import { deviceFingerprint } from './fingerprint';

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

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { config, response } = error;
    const status = response?.status;
    const code = response?.data?.code;

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
