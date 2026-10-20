import Card from './Card';
import { Skeleton } from './Skeleton';

const TONES = {
  indigo: {
    chip: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
    glow: 'from-indigo-500/15 to-violet-500/5',
  },
  emerald: {
    chip: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    glow: 'from-emerald-500/15 to-teal-500/5',
  },
  sky: {
    chip: 'bg-sky-50 text-sky-600 ring-sky-100',
    glow: 'from-sky-500/15 to-cyan-500/5',
  },
  amber: {
    chip: 'bg-amber-50 text-amber-600 ring-amber-100',
    glow: 'from-amber-500/15 to-orange-500/5',
  },
  rose: {
    chip: 'bg-rose-50 text-rose-600 ring-rose-100',
    glow: 'from-rose-500/15 to-pink-500/5',
  },
  violet: {
    chip: 'bg-violet-50 text-violet-600 ring-violet-100',
    glow: 'from-violet-500/15 to-fuchsia-500/5',
  },
};

export default function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'indigo',
  loading = false,
  badge,
  className = '',
  style,
}) {
  const colors = TONES[tone] ?? TONES.indigo;

  return (
    <Card className={`relative overflow-hidden p-5 ${className}`} style={style}>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-linear-to-br ${colors.glow} blur-2xl`}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
          {loading ? (
            <Skeleton className="mt-2.5 h-7 w-24" />
          ) : (
            <p className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
          )}
          {loading ? (
            <Skeleton className="mt-2 h-3 w-32" />
          ) : hint ? (
            <p className="mt-1 truncate text-xs text-slate-500">{hint}</p>
          ) : null}
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${colors.chip}`}>
          {Icon ? <Icon className="h-5 w-5" /> : null}
        </span>
      </div>
      {badge ? <div className="relative mt-3">{badge}</div> : null}
    </Card>
  );
}
