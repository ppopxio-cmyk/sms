import mongoose from 'mongoose';
import { escapeRegex } from '../utils/text.js';

export function pageOf(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

export function sortOf(query, allowed, fallback = 'createdAt') {
  const field = allowed.includes(query.sort) ? query.sort : fallback;
  return { [field]: query.order === 'asc' ? 1 : -1 };
}

export function searchFilter(search, fields) {
  const value = String(search || '').trim();
  if (!value) return null;
  const rx = new RegExp(escapeRegex(value), 'i');
  return ownFilter({ $or: fields.map((field) => ({ [field]: rx })) });
}

export function mergeFilters(...parts) {
  return ownFilter(Object.assign({}, ...parts.filter(Boolean)));
}

export function paged(rows, total, page, limit) {
  return {
    rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export const publicId = (doc) => {
  if (!doc) return null;
  if (doc._id) {
    const { _id, __v, ...rest } = doc;
    return { ...rest, id: String(_id) };
  }
  return doc;
};

export const idOf = (value) => String(value?._id ?? value ?? '');

// Every filter in this workspace is assembled from validated server-side values. The
// global sanitizeFilter setting still wraps operator objects unless they are explicitly
// trusted, so this helper marks the operator nodes without ever passing a client object
// through as a query.
export function ownFilter(input) {
  if (Array.isArray(input)) {
    for (const item of input) ownFilter(item);
    return input;
  }
  if (!input || typeof input !== 'object' || input instanceof Date || input instanceof mongoose.Types.ObjectId) {
    return input;
  }
  for (const key of Object.keys(input)) {
    if (key.startsWith('$')) {
      ownFilter(input[key]);
      input[key] = mongoose.trusted(input[key]);
    } else {
      input[key] = ownFilter(input[key]);
    }
  }
  return input;
}
