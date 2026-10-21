import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, CornerDownLeft, Loader2, Search, UserRound, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useDebounced } from '../../lib/useDebounced';
import { timeAgo } from '../../lib/ethiopianDate';
import { useAuth } from '../../store/auth';
import { RoleBadge } from '../ui/Badge';

const initials = (value) =>
  (value || '')
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || 'U';

const SHORTCUT = /Mac|iPhone|iPad/.test(navigator.platform ?? '') ? '⌘K' : 'Ctrl K';

// One box for the whole app. It asks the server only after typing pauses, and the server
// decides what may be seen: the staff directory for an administrator, and everybody's own
// notifications. Up and down move through the answers, Enter opens one.
export default function GlobalSearch() {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef(null);
  const input = useRef(null);
  const navigate = useNavigate();

  const q = useDebounced(term.trim(), 250);
  const ready = q.length >= 2;
  const role = useAuth((s) => s.user?.role);
  const isRegistrar = role === 'REGISTRAR';

  const { data, isFetching } = useQuery({
    queryKey: ['search', role, q],
    queryFn: ({ signal }) =>
      (isRegistrar
        ? api.get('/registrar/search', { params: { search: q }, signal })
        : api.get('/search', { params: { q }, signal })
      ).then((r) => r.data),
    enabled: ready,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: false,
  });

  const results = useMemo(() => {
    if (!ready) return [];
    if (isRegistrar) {
      return (data?.results ?? []).map((row) => ({
        kind: row.kind,
        key: `${row.kind}-${row.id}`,
        title: row.label,
        detail: row.detail,
        id: row.id,
      }));
    }
    const people = (data?.users ?? []).map((u) => ({ kind: 'person', key: `u-${u.id}`, ...u }));
    const notes = (data?.notifications ?? []).map((n) => ({ kind: 'note', key: `n-${n.id}`, ...n }));
    return [...people, ...notes];
  }, [data, ready, isRegistrar]);

  // The shortcut everybody already knows from other applications.
  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (wrap.current && !wrap.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const go = (item) => {
    setOpen(false);
    setTerm('');
    input.current?.blur();
    if (isRegistrar) {
      if (item.kind === 'student') navigate(`/registrar/students/${item.id}`);
      else if (item.kind === 'curriculum') navigate(`/registrar/curriculum?plan=${item.id}`);
      else navigate('/registrar/academic-structure');
      return;
    }
    if (item.kind === 'person') navigate('/admin/users', { state: { search: item.email } });
    else navigate('/notifications');
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      setOpen(false);
      input.current?.blur();
      return;
    }
    if (!results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (i + 1) % results.length);
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      go(results[active]);
    }
  };

  const clear = () => {
    setTerm('');
    input.current?.focus();
  };

  return (
    <div ref={wrap} className="relative min-w-0 flex-1 lg:max-w-md">
      <label className="sr-only" htmlFor="global-search">
        Search
      </label>
      <div className="group relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition group-focus-within:text-brand-500" />
        <input
          id="global-search"
          ref={input}
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            // A new word means the old highlight no longer points at anything.
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search people, notices…"
          autoComplete="off"
          role="combobox"
          aria-expanded={open && ready}
          aria-controls="global-search-results"
          className="focus-ring w-full rounded-2xl border border-slate-200/80 bg-white/80 py-2.5 pl-10 pr-16 text-sm text-slate-800 shadow-inner shadow-slate-900/5 transition placeholder:text-slate-400 hover:bg-white focus:border-brand-300 focus:bg-white"
        />

        <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {isFetching && ready ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-500" /> : null}
          {term ? (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear search"
              className="focus-ring rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="hidden rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 sm:block">
              {SHORTCUT}
            </kbd>
          )}
        </span>
      </div>

      {open && term.trim() ? (
        <div
          id="global-search-results"
          role="listbox"
          className="animate-rise absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl"
        >
          {!ready ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">Keep typing…</p>
          ) : isFetching && !results.length ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">Looking…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">Nothing matches “{q}”.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1 thin-scroll">
              {results.map((item, index) => {
                const first = index === 0 || results[index - 1].kind !== item.kind;
                const highlight = index === active;
                return (
                  <Fragment key={item.key}>
                    {first ? (
                      <li className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        {isRegistrar
                          ? { student: 'Students', programme: 'Programmes', curriculum: 'Curriculum' }[item.kind] ?? 'Results'
                          : item.kind === 'person'
                            ? 'People'
                            : 'Notifications'}
                      </li>
                    ) : null}
                    <li role="option" aria-selected={highlight}>
                      <button
                        type="button"
                        onMouseEnter={() => setActive(index)}
                        onClick={() => go(item)}
                        className={`focus-ring flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                          highlight ? 'bg-brand-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        {item.kind === 'person' ? (
                          <>
                            <span className="brand-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white">
                              {initials(item.name || item.email)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-slate-800">
                                {item.name || item.email}
                              </span>
                              {item.name ? (
                                <span className="block truncate text-xs text-slate-500">{item.email}</span>
                              ) : null}
                            </span>
                            <RoleBadge role={item.role} />
                          </>
                        ) : isRegistrar ? (
                          <>
                            <span className="brand-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white">
                              {item.kind === 'student' ? initials(item.title) : <UserRound className="h-4 w-4" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-slate-800">{item.title}</span>
                              <span className="block truncate text-xs text-slate-500">{item.detail}</span>
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                              <Bell className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-slate-800">{item.title}</span>
                              <span className="block truncate text-xs text-slate-500">
                                {item.body || timeAgo(item.createdAt)}
                              </span>
                            </span>
                            <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(item.createdAt)}</span>
                          </>
                        )}
                      </button>
                    </li>
                  </Fragment>
                );
              })}
            </ul>
          )}

          <p className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <CornerDownLeft className="h-3 w-3" />
              to open
            </span>
            <span className="flex items-center gap-1.5">
              <UserRound className="h-3 w-3" />
              arrow keys to move
            </span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
