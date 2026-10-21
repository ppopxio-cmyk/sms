// Every role has its own front door. Pages that belong to a role live under that
// prefix, and pages that belong to the person - profile, devices, notifications -
// live under /me and are the same for everybody.
export const HOME = {
  ADMIN: '/admin',
  REGISTRAR: '/registrar/dashboard',
  TEACHER: '/teacher/dashboard',
  ACCOUNTANT: '/accountant',
};

export const homeFor = (role) => HOME[role] ?? '/me';

export const ROLE_LABEL = {
  ADMIN: 'Administrator',
  REGISTRAR: 'Registrar',
  TEACHER: 'Teacher',
  ACCOUNTANT: 'Accountant',
};

// The role pages that exist so far. Administrators and teachers have their real screens;
// the remaining roles land on a dashboard while their tools are built.
export const ROLE_PAGE = (role) => `${homeFor(role)}`;
