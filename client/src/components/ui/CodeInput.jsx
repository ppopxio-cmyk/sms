import { useEffect, useRef } from 'react';

// A single real input sits invisibly on top of six styled boxes. This keeps
// paste, autofill, backspace and mobile keyboards working without any of the
// focus-juggling bugs a six-input version has. Pass a rising `shake` number to
// replay the shake on each fresh failure.
export default function CodeInput({ value, onChange, disabled = false, autoFocus = true, length = 6, shake = 0 }) {
  const ref = useRef(null);
  const boxes = useRef(null);
  const chars = Array.from({ length }, (_, i) => value[i] ?? '');
  const activeIndex = Math.min(value.length, length - 1);

  useEffect(() => {
    const node = boxes.current;
    if (!node || !shake) return;
    node.classList.remove('animate-shake');
    void node.offsetWidth; // force the browser to restart the animation
    node.classList.add('animate-shake');
  }, [shake]);

  return (
    <div className="relative" onClick={() => ref.current?.focus()}>
      <div ref={boxes} className="flex justify-between gap-2">
        {chars.map((c, i) => (
          <div
            key={i}
            className={`flex h-14 flex-1 items-center justify-center rounded-xl border text-2xl font-bold transition ${
              c ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white/80 text-slate-900'
            } ${!disabled && i === activeIndex && !c ? 'border-brand-400 ring-2 ring-brand-100' : ''}`}
          >
            {c ? (
              <span key={c} className="animate-pop">
                {c}
              </span>
            ) : null}
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
