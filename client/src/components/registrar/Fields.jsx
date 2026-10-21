import { useId } from 'react';

export function SelectField({ label, error, hint, children, className = '', ...rest }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? 'true' : 'false'}
        className={`focus-ring h-11 w-full rounded-xl border bg-white/85 px-3.5 text-sm text-slate-900 transition ${
          error ? 'border-rose-300' : 'border-slate-200'
        }`}
        {...rest}
      >
        {children}
      </select>
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextAreaField({ label, error, hint, className = '', rows = 4, ...rest }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? 'true' : 'false'}
        className={`focus-ring w-full rounded-xl border bg-white/85 px-3.5 py-2.5 text-sm leading-relaxed text-slate-900 transition ${
          error ? 'border-rose-300' : 'border-slate-200'
        }`}
        {...rest}
      />
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormGrid({ children, className = '' }) {
  return <div className={`grid gap-4 sm:grid-cols-2 ${className}`}>{children}</div>;
}
