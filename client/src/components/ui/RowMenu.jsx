import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

const MENU_WIDTH = 208;

// A compact action menu for table rows. It is rendered in a portal and positioned from
// the button's own rectangle, so a scrolling table or a rounded card can never clip it.
// Items are plain objects:
// { label, icon: Icon, onClick, tone: 'danger', disabled, separator }
export default function RowMenu({ items = [], label = 'Row actions', align = 'right' }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const wrap = useRef(null);
  const button = useRef(null);
  const menu = useRef(null);

  const place = () => {
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;

    const left = Math.min(
      Math.max(8, align === 'left' ? rect.left : rect.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - 8,
    );
    const openUp = window.innerHeight - rect.bottom < 220;

    setPosition(
      openUp
        ? { left, bottom: window.innerHeight - rect.top + 8 }
        : { left, top: rect.bottom + 8 },
    );
  };

  useEffect(() => {
    if (!open) return undefined;

    const onDown = (event) => {
      if (wrap.current?.contains(event.target)) return;
      if (menu.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const close = () => setOpen(false);

    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const visible = items.filter(Boolean);
  if (visible.length === 0) return null;

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    place();
    setOpen(true);
  };

  return (
    <div ref={wrap} className="relative inline-flex">
      <button
        ref={button}
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-500 transition hover:bg-white hover:text-slate-800"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && position
        ? createPortal(
            <div
              ref={menu}
              role="menu"
              aria-label={label}
              style={{ left: position.left, top: position.top, bottom: position.bottom, width: MENU_WIDTH }}
              className="animate-rise fixed z-[60] max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-100 bg-white p-1.5 shadow-2xl thin-scroll"
            >
              {visible.map((item, index) =>
                item.separator ? (
                  <div key={`separator-${index}`} className="my-1 h-px bg-slate-100" />
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(false);
                      item.onClick?.();
                    }}
                    className={`focus-ring flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      item.tone === 'danger'
                        ? 'text-rose-600 hover:bg-rose-50'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    {item.icon ? <item.icon className="h-4 w-4 shrink-0" /> : null}
                    {item.label}
                  </button>
                ),
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
