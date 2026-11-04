import { PERMISSIONS } from '../config/permissions.js';
import { AppError } from '../utils/AppError.js';

export const requireRole = (...roles) => {
  const allowed = roles.flat();
  return (req, res, next) =>
    allowed.includes(req.user?.role)
      ? next()
      : next(new AppError(403, 'FORBIDDEN', 'You do not have permission to do that.'));
};

export const requirePermission = (permission) => requireRole(...(PERMISSIONS[permission] ?? []));
