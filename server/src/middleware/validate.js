import { AppError } from '../utils/AppError.js';

// validate(schema) checks the body. validate(schema, 'params') checks the URL parameters.
// Parsed data is never written back onto req.query or req.params: Express 5 exposes
// those as read-only getters, and the validated copy is what controllers read from
// req.body / req.valid.
export const validate = (schema, source = 'body') => (req, res, next) => {
  const input = source === 'body' ? (req.body ?? {}) : req[source];
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return next(new AppError(400, 'VALIDATION_ERROR', fields[0]?.message || 'Please check what you entered.', { fields }));
  }
  if (source === 'body') req.body = result.data;
  else req.valid = { ...req.valid, [source]: result.data };
  next();
};
