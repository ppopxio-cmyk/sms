const numberFormat = new Intl.NumberFormat('en-US');

export const number = (value) => numberFormat.format(Number(value) || 0);

export const percent = (value) => `${Math.max(0, Math.min(100, Math.round(Number(value) || 0)))}%`;

// Audit actions are stored as machine names ("admin.user_created"). A screen should read
// them as words, without a second translation table for every new action.
export const humanizeAction = (action = '') => {
  const tail = String(action).split('.').pop() || action;
  const words = tail.replaceAll('_', ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Action';
};

export const roleLabel = (role = '') => {
  const labels = { ADMIN: 'Administrator', REGISTRAR: 'Registrar', TEACHER: 'Teacher', ACCOUNTANT: 'Accountant' };
  return labels[role] ?? (role ? role.toLowerCase() : 'Unknown');
};

export const initials = (value) =>
  (value || '')
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'U';
