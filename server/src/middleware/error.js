import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

export const notFound = (req, res, next) => next(new AppError(404, 'NOT_FOUND', 'That address does not exist.'));

export function errorHandler(err, req, res, _next) {
  let e = err;
  if (err?.code === 11000) e = new AppError(409, 'DUPLICATE', 'That value is already in use.');
  else if (err?.type === 'entity.parse.failed') e = new AppError(400, 'BAD_JSON', 'The request body is not valid JSON.');
  else if (err?.type === 'entity.too.large') e = new AppError(413, 'TOO_LARGE', 'That request is too big.');
  // A bad ObjectId is a client problem. Any other cast failure (most often a date
  // operator that bypassed the trusted-filter helpers) is our bug and must not be
  // disguised as a validation error.
  else if (err?.name === 'CastError' && err?.kind === 'ObjectId') e = new AppError(400, 'BAD_ID', 'That id is not valid.');
  else if (err?.name === 'CastError') {
    logger.error({ err, path: req.path }, 'query cast failed');
    e = new AppError(500, 'SERVER_ERROR', 'Something went wrong on our side. Please try again.');
  }

  if (!(e instanceof AppError)) {
    logger.error({ err, path: req.path }, 'unhandled error');
    e = new AppError(500, 'SERVER_ERROR', 'Something went wrong on our side. Please try again.');
  }
  res.status(e.status).json({ code: e.code, message: e.message, ...(e.data ? { data: e.data } : {}) });
}
