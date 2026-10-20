// permission -> roles that have it
export const PERMISSIONS = {
  'dashboard:view': ['ADMIN'],
  'sessions:view-all': ['ADMIN'],
  'sessions:terminate': ['ADMIN'],
  'audit:read': ['ADMIN'],
  'users:manage': ['ADMIN'],
  'students:view': ['ADMIN', 'REGISTRAR'],
  'students:manage': ['REGISTRAR'],
  'attendance:mark': ['TEACHER'],
  'assessments:enter': ['TEACHER'],
  'finance:manage': ['ACCOUNTANT'],
};
