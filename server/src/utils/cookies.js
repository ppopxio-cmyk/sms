import { env } from '../config/env.js';

export const REFRESH_COOKIE = 'rt';
export const DEVICE_COOKIE = 'did';

const base = { httpOnly: true, sameSite: 'strict', secure: env.NODE_ENV === 'production' };

export const refreshCookieOptions = (maxAge) => ({ ...base, path: '/api/auth', maxAge });
export const clearRefreshOptions = { ...base, path: '/api/auth' };
export const deviceCookieOptions = { ...base, path: '/', maxAge: 400 * 24 * 60 * 60 * 1000 };
