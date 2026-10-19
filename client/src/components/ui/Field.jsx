import { forwardRef, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const Field = forwardRef(function Field(
  { label, error, hint, icon: Icon, type = 'text', className = '', autoComplete, ...rest },
  ref,
) {
  const id = useId();
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && show ? 'text' : type;

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
          } ${isPassword ? 'pr-11' : 'pr-3.5'} ${error ? 'border-rose-300' : 'border-slate-200'}`}
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
        ) : null}
      </div>
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
});

export default Field;
