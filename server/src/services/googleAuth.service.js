import { createPublicKey, createVerify } from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

// Signing in with Google, checked properly: the ID token the browser receives is signed
// by Google with RS256, so the signature is verified here against Google's published
// keys. No library is needed for that - node:crypto can read a JWK directly.
//
// The keys rotate, so they are cached and refetched at most every few hours, and once
// more if a token arrives naming a key we do not hold yet.

export const googleSignInReady = Boolean(env.GOOGLE_CLIENT_ID);

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const CACHE_MS = 6 * 60 * 60 * 1000;

let keyCache = { at: 0, keys: new Map() };

const invalid = () => new AppError(401, 'GOOGLE_TOKEN_INVALID', 'That Google sign-in could not be checked. Please try again.');

const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

async function fetchKeys() {
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw invalid();
  const body = await res.json().catch(() => ({}));
  const keys = new Map((body.keys ?? []).filter((k) => k.kid).map((k) => [k.kid, k]));
  if (!keys.size) throw invalid();
  keyCache = { at: Date.now(), keys };
  return keys;
}

async function signingKey(kid) {
  const fresh = Date.now() - keyCache.at < CACHE_MS;
  if (fresh && keyCache.keys.has(kid)) return keyCache.keys.get(kid);
  const keys = await fetchKeys();
  return keys.get(kid);
}

export async function verifyGoogleIdToken(credential) {
  const parts = String(credential ?? '').split('.');
  if (parts.length !== 3) throw invalid();

  const [rawHeader, rawPayload, rawSignature] = parts;

  let header;
  let claims;
  try {
    header = decode(rawHeader);
    claims = decode(rawPayload);
  } catch {
    throw invalid();
  }

  if (header.alg !== 'RS256' || !header.kid) throw invalid();

  const jwk = await signingKey(header.kid);
  if (!jwk) throw invalid();

  // The signature covers the first two segments exactly as they arrived, so they are
  // verified byte for byte rather than re-encoded.
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${rawHeader}.${rawPayload}`);
  let good = false;
  try {
    good = verifier.verify(createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(rawSignature, 'base64url'));
  } catch {
    good = false;
  }
  if (!good) throw invalid();

  // The signature only says "Google wrote this". These say it was written for us, for this
  // person, just now.
  if (claims.aud !== env.GOOGLE_CLIENT_ID) throw invalid();
  if (!ISSUERS.has(claims.iss)) throw invalid();
  if (String(claims.email_verified) !== 'true') throw invalid();
  if (!claims.email || Number(claims.exp) * 1000 <= Date.now()) throw invalid();

  return { email: String(claims.email).toLowerCase(), name: claims.name || '' };
}
