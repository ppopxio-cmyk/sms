import { CircleCheck } from 'lucide-react';
import { meterState } from '../../lib/validation';

const BAR = ['bg-rose-400', 'bg-rose-400', 'bg-amber-400', 'bg-emerald-500', 'bg-brand-500'];
const TEXT = ['text-rose-500', 'text-rose-500', 'text-amber-600', 'text-emerald-600', 'text-brand-600'];

// Live on every keystroke. Keying each row on its own state means the tick
// re-mounts and pops the moment a rule is satisfied.
export default function PasswordMeter({ value = '', className = '' }) {
  const { rules, score, max, label, valid } = meterState(value);

  return (
    <div className={className}>
      <div className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i < score ? BAR[score] : 'bg-slate-200'}`}
          />
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <span className={`text-xs font-semibold ${value ? TEXT[score] : 'text-slate-400'}`}>
          {value ? label : 'Password strength'}
        </span>
        <span className="text-xs text-slate-400">{value && valid ? 'Ready to use' : 'Not ready yet'}</span>
      </div>

      <ul className="mt-2.5 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {rules.map((rule) => (
          <li
            key={`${rule.id}-${rule.ok}`}
            className={`flex items-center gap-1.5 text-xs transition-colors ${rule.ok ? 'text-emerald-600' : 'text-slate-400'}`}
          >
            {rule.ok ? (
              <CircleCheck className="animate-pop h-4 w-4 shrink-0" />
            ) : (
              <span className="h-4 w-4 shrink-0 rounded-full border border-dashed border-slate-300" />
            )}
            <span>{rule.label}</span>
            {rule.required ? null : (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">bonus</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
