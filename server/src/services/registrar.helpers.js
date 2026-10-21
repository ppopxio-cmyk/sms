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
//
// The trusted marker has to sit on the object that *carries* the operator — the value of
// the field — because that is the object sanitizeFilter inspects. Marking the operator's
// own argument instead leaves the carrier untrusted, and the sanitizer then rewrites
// `{ status: { $in: [...] } }` into `{ status: { $eq: { $in: [...] } } }`, which fails to
// cast and surfaces as a 500.
const isOperatorObject = (value) =>
  Boolean(value) &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !(value instanceof mongoose.Types.ObjectId) &&
  !(value instanceof RegExp) &&
  Object.keys(value).length > 0 &&
  Object.keys(value).every((key) => key.startsWith('$'));

export function ownFilter(input) {
  if (Array.isArray(input)) {
    for (const item of input) ownFilter(item);
    return input;
  }
  if (
    !input ||
    typeof input !== 'object' ||
    input instanceof Date ||
    input instanceof mongoose.Types.ObjectId ||
    input instanceof RegExp
  ) {
    return input;
  }

  const keys = Object.keys(input);

  // A bare operator object such as `{ $in: [...] }` is itself the value a field will
  // carry, so it is marked as a whole.
  if (keys.length > 0 && keys.every((key) => key.startsWith('$'))) {
    for (const key of keys) ownFilter(input[key]);
    return mongoose.trusted(input);
  }

  for (const key of keys) {
    const value = input[key];

    // A logical operator holds a list of filters, not a field value. Its branches are
    // cleaned here and the list is trusted so the sanitizer does not walk into it.
    if (key === '$and' || key === '$or' || key === '$nor') {
      if (Array.isArray(value)) for (const branch of value) ownFilter(branch);
      input[key] = mongoose.trusted(value);
      continue;
    }

    // A field whose value is an operator object is the common case: the carrier is the
    // value, so that is what must carry the trusted marker.
    if (isOperatorObject(value)) {
      for (const inner of Object.keys(value)) ownFilter(value[inner]);
      input[key] = mongoose.trusted(value);
      continue;
    }

    input[key] = ownFilter(value);
  }
  return input;
}
