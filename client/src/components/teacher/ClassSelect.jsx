import { useId } from 'react';
import { classTitle } from '../../lib/teacher';

export default function ClassSelect({
  assignments = [],
  value = '',
  onChange,
  label = 'Class',
  allLabel,
  disabled = false,
  className = '',
}) {
  const id = useId();
  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
        className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white/85 px-3.5 text-sm text-slate-800 transition disabled:opacity-60"
      >
        {allLabel ? <option value="">{allLabel}</option> : null}
        {assignments.map((assignment) => (
          <option key={assignment.id} value={assignment.id}>
            {classTitle(assignment)}
          </option>
        ))}
      </select>
    </div>
  );
}
