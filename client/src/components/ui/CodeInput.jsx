import { useRef } from 'react';

// A single real input sits invisibly on top of six styled boxes. This keeps
// paste, autofill, backspace and mobile keyboards working without any of the
// focus-juggling bugs a six-input version has.
export default function CodeInput({ value, onChange, disabled = false, autoFocus = true, length = 6 }) {
  const ref = useRef(null);
  const chars = Array.from({ length }, (_, i) => value[i] ?? '');
  const activeIndex = Math.min(value.length, length - 1);

  return (
    <div className="relative" onClick={() => ref.current?.focus()}>
      <div className="flex justify-between gap-2">
        {chars.map((c, i) => (
          <div
            key={i}
            className={`flex h-14 flex-1 items-center justify-center rounded-xl border text-2xl font-bold transition ${
              c ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white/80 text-slate-900'
            } ${!disabled && i === activeIndex && !c ? 'border-brand-400 ring-2 ring-brand-100' : ''}`}
          >
            {c}
          </div>
        ))}
      </div>
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        disabled={disabled}
        aria-label="Verification code"
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
      />
    </div>
  );
}
