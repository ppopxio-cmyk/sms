import mongoose from 'mongoose';
import { User } from '../models/User.js';

// A tiny cache so authenticate() does not hit the database on every single request.
// Anything that changes a user's status must call forgetUser() in the same request
// that makes the change, exactly like forgetSession().
const CACHE_MS = 30_000;
const cache = new Map(); // userId -> { status, mustChangePassword, deleted, until }

export const forgetUser = (id) => cache.delete(String(id));

export async function userFlags(userId) {
  const key = String(userId);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.until > now) return hit;

  if (!mongoose.isValidObjectId(key)) return null;
  const user = await User.findById(key).select('status mustChangePassword deletedAt').lean();
  if (!user) {
    cache.delete(key);
    return null;
  }

  const flags = {
    status: user.status,
    mustChangePassword: !!user.mustChangePassword,
    deleted: !!user.deletedAt,
    until: now + CACHE_MS,
  };
  cache.set(key, flags);
  return flags;
}
