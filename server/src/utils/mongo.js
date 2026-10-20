import mongoose from 'mongoose';

// sanitizeFilter is enabled globally, which is the right default for user-facing
// queries. It wraps any object containing a `$` key in `$eq` unless the object has
// been marked trusted. Every filter built by our own code that uses an operator
// (dates, $in, $not, ...) must therefore pass through these helpers. Without this,
// Mongoose tries to cast `{ $gt: Date }` as a Date and throws a CastError.
export const trusted = (value) => mongoose.trusted(value);

export const after = (value) => trusted({ $gt: value });
export const atOrAfter = (value) => trusted({ $gte: value });
export const before = (value) => trusted({ $lt: value });
export const atOrBefore = (value) => trusted({ $lte: value });
export const oneOf = (values) => trusted({ $in: values });
export const not = (value) => trusted({ $not: value });
export const exists = (value = true) => trusted({ $exists: value });
