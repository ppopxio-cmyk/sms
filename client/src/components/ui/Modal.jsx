import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const SIZES = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' };

// One reusable dialog for add, edit and delete, as the design plan asks. Escape
// closes it, the backdrop closes it, and the panel is scrollable on a small screen.
export default function Modal({ open, title, subtitle, onClose, children, footer, size = 'md', dismissible = true }) {
  useEffect(() => {
    if (!open || !dismissible) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, dismissible]);

  if (!open) return null;

  // A dialog belongs to the page, not to the card it happens to be written inside. Several
  // panels use backdrop blur, which would otherwise trap a fixed overlay inside them.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      {dismissible ? (
        <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-slate-900/40 backdrop-blur-sm" />
      ) : (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`animate-rise relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl ${SIZES[size] ?? SIZES.md}`}
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm leading-relaxed text-slate-500">{subtitle}</p> : null}
          </div>
          {dismissible ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="focus-ring rounded-xl p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}
        </header>

        <div className="mt-5">{children}</div>

        {footer ? <footer className="mt-6 flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
