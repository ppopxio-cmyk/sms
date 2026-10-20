import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  ChevronRight,
  Command,
  Download,
  Keyboard,
  LayoutDashboard,
  Megaphone,
  ScrollText,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';

const PAGES = [
  { to: '/admin', label: 'Dashboard', hint: 'Overview, charts and recent activity', icon: LayoutDashboard, keys: 'G then D' },
  { to: '/admin/analytics', label: 'Analytics', hint: 'Sign-in health, activity rhythm and reach', icon: BarChart3, keys: 'G then I' },
  { to: '/admin/sessions', label: 'Sessions', hint: 'Live devices and sign-in sessions', icon: ShieldCheck, keys: 'G then S' },
  { to: '/admin/audit-logs', label: 'Audit logs', hint: 'Every action, attempt and change', icon: ScrollText, keys: 'G then A' },
  { to: '/admin/users', label: 'Users', hint: 'Accounts, roles and access', icon: Users, keys: 'G then U' },
  { to: '/admin/announcements', label: 'Announcements', hint: 'Drafts, scheduled and published notices', icon: Megaphone, keys: 'G then N' },
  { to: '/admin/notifications', label: 'Notifications', hint: 'Your security and college notices', icon: Bell, keys: 'G then O' },
  { to: '/admin/export', label: 'Export Center', hint: 'PDF, Word and Excel reports', icon: Download, keys: 'G then E' },
  { to: '/admin/settings', label: 'System settings', hint: 'Maintenance, institution, security and mail', icon: Settings2, keys: 'G then T' },
];

const SEQUENCE = {
  d: '/admin',
  i: '/admin/analytics',
  s: '/admin/sessions',
  a: '/admin/audit-logs',
  u: '/admin/users',
  n: '/admin/announcements',
  o: '/admin/notifications',
  e: '/admin/export',
  t: '/admin/settings',
};

function isTyping(target) {
  const tag = target?.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
}

export default function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef(null);
  const lastG = useRef(0);

  const rows = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return PAGES;
    return PAGES.filter((page) =>
      [page.label, page.hint, page.to].some((value) => value.toLowerCase().includes(q)),
    );
  }, [term]);

  useEffect(() => {
    const down = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
        setTerm('');
        setActive(0);
        return;
      }

      if (event.key === 'Escape') {
        setOpen(false);
        setSheet(false);
        return;
      }

      if (isTyping(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;

      if (event.key === '?') {
        event.preventDefault();
        setSheet((value) => !value);
        return;
      }

      if (event.key.toLowerCase() === 'g') {
        lastG.current = Date.now();
        return;
      }

      if (Date.now() - lastG.current < 1300) {
        const to = SEQUENCE[event.key.toLowerCase()];
        if (to) {
          event.preventDefault();
          lastG.current = 0;
          setOpen(false);
          setSheet(false);
          navigate(to);
        }
      }
    };

    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [navigate]);

  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => input.current?.focus(), 30);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [open]);

  const go = (to) => {
    setOpen(false);
    setSheet(false);
    navigate(to);
  };

  const onPaletteKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((value) => Math.min(rows.length - 1, value + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((value) => Math.max(0, value - 1));
    } else if (event.key === 'Enter' && rows[active]) {
      event.preventDefault();
      go(rows[active].to);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTerm('');
          setActive(0);
        }}
        className="focus-ring hidden h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-2.5 text-xs font-medium text-slate-500 transition hover:bg-white hover:text-slate-800 sm:inline-flex"
        aria-label="Open command menu"
      >
        <Command className="h-3.5 w-3.5" />
        <span className="hidden md:inline">Jump to</span>
        <kbd className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">Ctrl K</kbd>
      </button>

      {open
        ? createPortal(
            <div className="fixed inset-0 z-[85] flex items-start justify-center px-3 pt-[12vh] sm:px-6">
              <button
                type="button"
                aria-label="Close command menu"
                onClick={() => setOpen(false)}
                className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-sm"
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Command menu"
                className="animate-rise relative w-full max-w-xl overflow-hidden rounded-3xl border border-white/80 bg-white shadow-2xl"
              >
                <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5">
                  <Search className="h-4 w-4 shrink-0 text-brand-500" />
                  <input
                    ref={input}
                    value={term}
                    onChange={(event) => {
                      setTerm(event.target.value);
                      setActive(0);
                    }}
                    onKeyDown={onPaletteKeyDown}
                    placeholder="Go to a page or search the admin workspace"
                    aria-label="Search pages"
                    className="h-8 min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="focus-ring rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="thin-scroll max-h-[52vh] overflow-y-auto p-2">
                  {rows.length ? (
                    rows.map((row, index) => (
                      <button
                        key={row.to}
                        type="button"
                        onClick={() => go(row.to)}
                        onMouseEnter={() => setActive(index)}
                        className={`focus-ring flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
                          index === active ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                            index === active ? 'bg-white text-brand-600 shadow-sm' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          <row.icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{row.label}</span>
                          <span className="mt-0.5 block truncate text-xs text-slate-500">{row.hint}</span>
                        </span>
                        <span className="hidden shrink-0 text-[10px] font-medium text-slate-400 sm:block">{row.keys}</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                      </button>
                    ))
                  ) : (
                    <div className="px-6 py-10 text-center">
                      <p className="text-sm font-semibold text-slate-700">Nothing matches</p>
                      <p className="mt-1 text-xs text-slate-500">Try "users", "maintenance" or "export".</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 text-[11px] text-slate-400">
                  <span className="flex items-center gap-3">
                    <span><kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 font-mono">↑↓</kbd> move</span>
                    <span><kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 font-mono">↵</kbd> open</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setSheet(true);
                    }}
                    className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 font-semibold text-brand-600 hover:bg-brand-50"
                  >
                    <Keyboard className="h-3.5 w-3.5" />
                    All shortcuts
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {sheet
        ? createPortal(
            <div className="fixed inset-0 z-[86] flex items-center justify-center p-4 sm:p-6">
              <button
                type="button"
                aria-label="Close shortcuts"
                onClick={() => setSheet(false)}
                className="absolute inset-0 cursor-default bg-slate-950/40 backdrop-blur-sm"
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Keyboard shortcuts"
                className="animate-rise relative max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl thin-scroll"
              >
                <header className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">Work faster</p>
                    <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">Keyboard shortcuts</h2>
                    <p className="mt-1 text-sm text-slate-500">They work anywhere in the admin workspace, except while you are typing.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSheet(false)}
                    className="focus-ring rounded-xl p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </header>

                <div className="mt-6 grid gap-6 sm:grid-cols-2">
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Anywhere</h3>
                    <div className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-100">
                      {[
                        ['Ctrl / ⌘ + K', 'Open the command menu'],
                        ['?', 'Open this shortcut sheet'],
                        ['Esc', 'Close a menu or dialog'],
                      ].map(([key, text]) => (
                        <div key={key} className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-sm">
                          <span className="text-slate-600">{text}</span>
                          <kbd className="rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{key}</kbd>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Go to</h3>
                    <div className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-100">
                      {PAGES.map((page) => (
                        <button
                          key={page.to}
                          type="button"
                          onClick={() => go(page.to)}
                          className="focus-ring flex w-full items-center justify-between gap-4 px-3.5 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50"
                        >
                          <span className="flex items-center gap-2">
                            <page.icon className="h-3.5 w-3.5 text-slate-400" />
                            {page.label}
                          </span>
                          <kbd className="rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{page.keys}</kbd>
                        </button>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
