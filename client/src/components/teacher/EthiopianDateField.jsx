import { CalendarDays, X } from 'lucide-react';
import { ETH_MONTHS, dateKeyToEthiopian, ethiopianToDateKey } from '../../lib/ethiopianDate';
import { todayKey } from '../../lib/teacher';

const selectClass =
  'focus-ring h-10 rounded-xl border border-slate-200 bg-white/85 px-2.5 text-sm text-slate-800 transition';

const daysInMonth = (month, year) => {
  if (Number(month) < 13) return 30;
  return Number(year) % 4 === 3 ? 6 : 5;
};

export default function EthiopianDateField({
  value,
  onChange,
  label = 'Date',
  max = todayKey(),
  allowEmpty = false,
  disabled = false,
  className = '',
}) {
  const today = dateKeyToEthiopian(todayKey());
  const parts = value ? dateKeyToEthiopian(value) : null;

  const years = new Set();
  const anchor = parts?.year || today.year;
  // Attendance and report dates stop at today, while an optional due date may be in a
  // later academic year. Keep the list honest by extending it only when no maximum is set.
  const lastYear = Math.max(anchor, today.year) + (max === null ? 10 : 2);
  for (let year = Math.min(anchor, today.year) - 5; year <= lastYear; year += 1) {
    years.add(year);
  }

  const apply = (next) => {
    const key = ethiopianToDateKey(next);
    if (!key || (max && key > max)) return;
    onChange?.(key);
  };

  if (!value && allowEmpty) {
    return (
      <div className={className}>
        <p className="mb-1.5 block text-sm font-medium text-slate-700">{label}</p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange?.(todayKey())}
          className="focus-ring inline-flex h-10 items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/70 px-3 text-sm font-medium text-slate-500 transition hover:border-brand-300 hover:text-brand-700 disabled:opacity-60"
        >
          <CalendarDays className="h-4 w-4" />
          Set a date
        </button>
      </div>
    );
  }

  const current = parts || today;

  const change = (patch) => {
    const next = {
      year: Number(current.year),
      month: Number(current.month),
      day: Number(current.day),
      ...patch,
    };
    const maxDay = daysInMonth(next.month, next.year);
    if (next.day > maxDay) next.day = maxDay;
    apply(next);
  };

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        {allowEmpty ? (
          <button
            type="button"
            onClick={() => onChange?.('')}
            disabled={disabled}
            className="focus-ring inline-flex items-center gap-1 rounded-md text-[11px] font-semibold text-slate-400 transition hover:text-slate-700 disabled:opacity-60"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-[1fr_1.5fr_1fr] gap-1.5">
        <select
          aria-label={`${label} day`}
          value={current.day}
          disabled={disabled}
          onChange={(event) => change({ day: Number(event.target.value) })}
          className={selectClass}
        >
          {Array.from({ length: daysInMonth(current.month, current.year) }, (_, index) => index + 1).map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label} month`}
          value={current.month}
          disabled={disabled}
          onChange={(event) => change({ month: Number(event.target.value) })}
          className={selectClass}
        >
          {ETH_MONTHS.map((month, index) => (
            <option key={month} value={index + 1}>
              {month}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label} year`}
          value={current.year}
          disabled={disabled}
          onChange={(event) => change({ year: Number(event.target.value) })}
          className={selectClass}
        >
          {[...years].sort((a, b) => a - b).map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400">Ethiopian calendar · Gregorian {value || '—'}</p>
    </div>
  );
}
