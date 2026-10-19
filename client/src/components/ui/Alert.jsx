import { CircleAlert, CircleCheck, Info } from 'lucide-react';

const TONES = {
  danger: { wrap: 'border-rose-200 bg-rose-50', icon: 'text-rose-500', title: 'text-rose-900', body: 'text-rose-700', Icon: CircleAlert },
  success: { wrap: 'border-emerald-200 bg-emerald-50', icon: 'text-emerald-500', title: 'text-emerald-900', body: 'text-emerald-700', Icon: CircleCheck },
  info: { wrap: 'border-sky-200 bg-sky-50', icon: 'text-sky-500', title: 'text-sky-900', body: 'text-sky-700', Icon: Info },
  warning: { wrap: 'border-amber-200 bg-amber-50', icon: 'text-amber-500', title: 'text-amber-900', body: 'text-amber-700', Icon: CircleAlert },
};

export default function Alert({ tone = 'danger', title, children, className = '' }) {
  const t = TONES[tone] ?? TONES.danger;
  const Icon = t.Icon;

  return (
    <div className={`animate-fade flex gap-3 rounded-2xl border px-4 py-3 ${t.wrap} ${className}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon className={`mt-0.5 h-4.5 w-4.5 shrink-0 ${t.icon}`} />
      <div className="text-sm leading-relaxed">
        {title ? <p className={`font-semibold ${t.title}`}>{title}</p> : null}
        {children ? <div className={title ? `mt-0.5 ${t.body}` : t.body}>{children}</div> : null}
      </div>
    </div>
  );
}
