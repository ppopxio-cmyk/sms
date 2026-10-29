import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, UserRound, X } from 'lucide-react';
import { api } from '../../lib/api';
import { REGISTRAR, studentName } from '../../lib/registrar';
import { useDebounced } from '../../lib/useDebounced';

// Student lookups are server-side, so the picker never downloads the whole register. It
// returns the full row because callers need level and programme to calculate eligibility.
export default function StudentPicker({
  label = 'Student',
  value,
  onChange,
  hint,
  error,
  disabled = false,
  status,
  extraParams,
}) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const settled = useDebounced(term.trim(), 250);
  const root = useRef(null);

  const queryParams = useMemo(() => ({
    search: settled,
    limit: 8,
    sort: 'fullName',
    order: 'asc',
    ...(status ? { status } : {}),
    ...(extraParams || {}),
  }), [settled, status, extraParams]);

  const results = useQuery({
    queryKey: ['registrar', 'student-picker', queryParams],
    queryFn: async () =>
      (await api.get(`${REGISTRAR}/students`, { params: queryParams })).data,
    enabled: open,
    staleTime: 15_000,
  });

  useEffect(() => {
    const close = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const rows = results.data?.rows ?? [];

  return (
    <div ref={root} className="relative">
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      {value ? (
        <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/60 px-3 py-2.5">
          {value.photoUrl || value.photo?.thumbnailUrl || value.photo?.url ? (
            <img
              src={value.photoUrl || value.photo?.thumbnailUrl || value.photo?.url}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-brand-500 shadow-sm"
            />
          ) : (
            <span className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white">
              <UserRound className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{studentName(value)}</p>
            <p className="truncate text-xs text-slate-500">
              {[value.studentId, value.program?.code || value.program?.name, value.studentStatus ? `Status: ${value.studentStatus}` : null].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange?.(null);
              setTerm('');
            }}
            className="focus-ring rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
            aria-label="Clear selected student"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={term}
              disabled={disabled}
              onChange={(event) => {
                setTerm(event.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder="Search by name or student ID"
              className={`focus-ring h-11 w-full rounded-xl border bg-white/85 pl-10 pr-10 text-sm text-slate-800 ${
                error ? 'border-rose-300' : 'border-slate-200'
              }`}
            />
            {results.isFetching ? (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-brand-500" />
            ) : null}
          </div>
          {open ? (
            <div className="absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
              {rows.length ? (
                rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      onChange?.(row);
                      setOpen(false);
                      setTerm('');
                    }}
                    className="focus-ring flex w-full items-center gap-3 border-b border-slate-50 px-3 py-2.5 text-left last:border-0 hover:bg-brand-50/50"
                  >
                    {row.photoUrl || row.photo?.thumbnailUrl || row.photo?.url ? (
                      <img
                        src={row.photoUrl || row.photo?.thumbnailUrl || row.photo?.url}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
                      />
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        <UserRound className="h-4 w-4" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between">
                        <span className="block truncate text-sm font-semibold text-slate-800">{row.fullName}</span>
                        {row.studentStatus ? (
                          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            row.studentStatus === 'graduated'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {row.studentStatus}
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {[row.studentId, row.program?.code || row.program?.name, row.level ? `Level ${row.level}` : null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-4 py-4 text-sm text-slate-500">
                  {results.isFetching ? 'Searching…' : 'No student matches that search.'}
                </p>
              )}
            </div>
          ) : null}
        </>
      )}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
