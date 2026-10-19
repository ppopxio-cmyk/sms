import { forwardRef, useId, useState } from 'react';
import { CircleAlert, CircleCheck, Eye, EyeOff } from 'lucide-react';

// status is the live verdict while typing: 'ok' or 'error'. It is ignored on
// password fields, where the toggle button takes that spot and PasswordMeter
// below the field does the reporting.
const Field = forwardRef(function Field(
  { label, error, hint, icon: Icon, status, type = 'text', className = '', children, autoComplete, ...rest },
  ref,
) {
  const id = useId();
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && show ? 'text' : type;

  const border = error
    ? 'border-rose-300'
    : status === 'ok'
      ? 'border-emerald-300'
      : status === 'error'
        ? 'border-rose-200'
        : 'border-slate-200';

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>

      <div className="relative">
        {Icon ? <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /> : null}

        <input
          id={id}
          ref={ref}
          type={inputType}
          autoComplete={autoComplete}
          aria-invalid={error ? 'true' : 'false'}
          className={`focus-ring h-11 w-full rounded-xl border bg-white/85 text-sm text-slate-900 transition placeholder:text-slate-400 ${
            Icon ? 'pl-10' : 'pl-3.5'
          } ${isPassword || status ? 'pr-11' : 'pr-3.5'} ${border}`}
          {...rest}
        />

        {isPassword ? (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Hide password' : 'Show password'}
            className="focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition hover:text-slate-600"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        ) : status ? (
          status === 'ok' ? (
            <CircleCheck className="animate-pop absolute right-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-emerald-500" />
          ) : (
            <CircleAlert className="absolute right-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-rose-400" />
          )
        ) : null}
      </div>

      {children}

      {error ? (
        <p className="animate-rise mt-1.5 text-xs font-medium text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
});

export default Field;
