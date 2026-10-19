import { PERMISSIONS } from '../config/permissions.js';
import { AppError } from '../utils/AppError.js';

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role)
    ? next()
    : next(new AppError(403, 'FORBIDDEN', 'You do not have permission to do that.'));

export const requirePermission = (permission) => requireRole(...(PERMISSIONS[permission] ?? []));
