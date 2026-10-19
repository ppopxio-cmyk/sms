const TONES = {
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-100',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  warning: 'bg-amber-50 text-amber-700 ring-amber-100',
  danger: 'bg-rose-50 text-rose-700 ring-rose-100',
};

export default function Badge({ tone = 'neutral', children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

const ROLE_TONES = { ADMIN: 'brand', REGISTRAR: 'success', TEACHER: 'neutral', ACCOUNTANT: 'warning' };

export function RoleBadge({ role }) {
  return <Badge tone={ROLE_TONES[role] ?? 'neutral'}>{role?.toLowerCase() ?? 'unknown'}</Badge>;
}
