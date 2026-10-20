import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Activity,
  CircleAlert,
  Clock3,
  Download,
  Eye,
  LogIn,
  Megaphone,
  RefreshCw,
  ScrollText,
  Settings2,
  ShieldCheck,
  UserRound,
  Wrench,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { formatEthiopian, timeAgo } from '../lib/ethiopianDate';
import { humanizeAction, number } from '../lib/format';
import { useDebounced } from '../lib/useDebounced';
import { useNow } from '../lib/useNow';
import Card, { CardBody, CardHeader } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import ExportMenu from '../components/ui/ExportMenu';
import FilterTabs from '../components/ui/FilterTabs';
import LiveStamp from '../components/ui/LiveStamp';
import Modal from '../components/ui/Modal';
import Pagination from '../components/ui/Pagination';
import SearchInput from '../components/ui/SearchInput';
import StatCard from '../components/ui/StatCard';
import { SkeletonRows } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/StatePanel';

const CATEGORY = {
  signin: {
    label: 'Sign-ins',
    icon: LogIn,
    chip: 'bg-sky-50 text-sky-600 ring-sky-100',
    dot: 'bg-sky-500',
  },
  security: {
    label: 'Security',
    icon: ShieldCheck,
    chip: 'bg-rose-50 text-rose-600 ring-rose-100',
    dot: 'bg-rose-500',
  },
  admin: {
    label: 'Administration',
    icon: Settings2,
    chip: 'bg-violet-50 text-violet-600 ring-violet-100',
    dot: 'bg-violet-500',
  },
  settings: {
    label: 'Settings',
    icon: Settings2,
    chip: 'bg-teal-50 text-teal-600 ring-teal-100',
    dot: 'bg-teal-500',
  },
  announcements: {
    label: 'Announcements',
    icon: Megaphone,
    chip: 'bg-fuchsia-50 text-fuchsia-600 ring-fuchsia-100',
    dot: 'bg-fuchsia-500',
  },
  maintenance: {
    label: 'Maintenance',
    icon: Wrench,
    chip: 'bg-amber-50 text-amber-700 ring-amber-100',
    dot: 'bg-amber-500',
  },
  account: {
    label: 'Accounts',
    icon: UserRound,
    chip: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    dot: 'bg-emerald-500',
  },
  export: {
    label: 'Exports',
    icon: Download,
    chip: 'bg-amber-50 text-amber-600 ring-amber-100',
    dot: 'bg-amber-500',
  },
  other: {
    label: 'Other',
    icon: Activity,
    chip: 'bg-slate-100 text-slate-500 ring-slate-200',
    dot: 'bg-slate-400',
  },
};

const RANGE_LABEL = { 1: 'Last 24 hours', 7: 'Last 7 days', 30: 'Last 30 days', all: 'All time' };

const styleFor = (key) => CATEGORY[key] ?? CATEGORY.other;

export default function AuditLogs() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [range, setRange] = useState('7');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [selected, setSelected] = useState(null);
  const now = useNow(1000);
  const debouncedSearch = useDebounced(search);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category, status, range, limit]);

  const params = {
    search: debouncedSearch || undefined,
    category,
    status,
    range,
    page,
    limit,
  };

  const exportParams = {
    search: debouncedSearch || undefined,
    category,
    status,
    range,
  };

  const list = useQuery({
    queryKey: ['audit-logs', params],
    queryFn: async () => (await api.get('/admin/audit-logs', { params })).data,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });

  const rows = list.data?.logs ?? [];
  const counts = list.data?.counts;
  const total = list.data?.total ?? 0;

  useEffect(() => {
    if (list.data && page > list.data.pages) setPage(list.data.pages);
  }, [page, list.data]);

  const tabs = [
    { key: 'all', label: 'All', count: counts?.all, dot: 'bg-slate-400' },
    { key: 'signin', label: 'Sign-ins', count: counts?.categories?.signin, dot: 'bg-sky-500' },
    { key: 'security', label: 'Security', count: counts?.categories?.security, dot: 'bg-rose-500' },
    { key: 'admin', label: 'Admin', count: counts?.categories?.admin, dot: 'bg-violet-500' },
    { key: 'settings', label: 'Settings', count: counts?.categories?.settings, dot: 'bg-teal-500' },
    { key: 'announcements', label: 'Announcements', count: counts?.categories?.announcements, dot: 'bg-fuchsia-500' },
    { key: 'maintenance', label: 'Maintenance', count: counts?.categories?.maintenance, dot: 'bg-amber-500' },
    { key: 'account', label: 'Accounts', count: counts?.categories?.account, dot: 'bg-emerald-500' },
    { key: 'export', label: 'Exports', count: counts?.categories?.export, dot: 'bg-amber-500' },
    { key: 'other', label: 'Other', count: counts?.categories?.other, dot: 'bg-slate-400' },
  ];

  const selectedStyle = selected ? styleFor(selected.category) : null;
  const SelectedIcon = selectedStyle?.icon;

  return (
    <div className="space-y-6">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Clock3 className="h-4 w-4 text-brand-500" />
              {formatEthiopian(now, { time: true })}
            </p>
            <LiveStamp updatedAt={list.dataUpdatedAt} label="Audit live" />
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Audit log</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            An append-only record of sign-ins, security events, account changes and exports. Entries cannot be edited or deleted
            from this screen.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">
            <ShieldCheck className="h-3.5 w-3.5" />
            Append-only
          </Badge>
          <Button variant="secondary" size="sm" onClick={() => list.refetch()} loading={list.isFetching}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <ExportMenu
            basePath="/admin/audit-logs/export"
            params={exportParams}
            filenamePrefix="audit-log"
            disabled={list.isLoading || total === 0}
          />
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={ScrollText}
          tone="indigo"
          label="Audited events"
          value={number(counts?.all ?? 0)}
          hint={RANGE_LABEL[range]}
          loading={list.isLoading}
        />
        <StatCard
          icon={ShieldCheck}
          tone="emerald"
          label="Sign-in events"
          value={number(counts?.categories?.signin ?? 0)}
          hint="Successful and failed sign-ins"
          loading={list.isLoading}
        />
        <StatCard
          icon={CircleAlert}
          tone="rose"
          label="Failed actions"
          value={number(counts?.statuses?.fail ?? 0)}
          hint="Rejected attempts and errors"
          loading={list.isLoading}
        />
        <StatCard
          icon={Download}
          tone="amber"
          label="Exports"
          value={number(counts?.categories?.export ?? 0)}
          hint="Every download is recorded"
          loading={list.isLoading}
        />
      </section>

      <Card>
        <CardHeader
          icon={ShieldCheck}
          title="Recorded activity"
          subtitle={
            list.isLoading
              ? 'Reading the audit trail…'
              : `${number(total)} event${total === 1 ? '' : 's'} in this view`
          }
          action={
            <Button variant="secondary" size="sm" onClick={() => list.refetch()} loading={list.isFetching}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          }
        />

        <CardBody className="space-y-4">
          <FilterTabs
            tabs={tabs}
            value={category}
            onChange={(value) => {
              setCategory(value);
              setPage(1);
            }}
            label="Filter audit events by category"
          />

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <SearchInput
              id="audit-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Action, person, target or IP"
              label="Search the audit log"
              loading={list.isFetching && Boolean(debouncedSearch)}
              className="flex-1"
            />

            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Filter by outcome"
              className="focus-ring h-11 rounded-xl border border-slate-200 bg-white/85 px-3 text-sm text-slate-700"
            >
              <option value="all">Every outcome ({number((counts?.statuses?.success ?? 0) + (counts?.statuses?.fail ?? 0))})</option>
              <option value="success">Successful ({number(counts?.statuses?.success ?? 0)})</option>
              <option value="fail">Failed ({number(counts?.statuses?.fail ?? 0)})</option>
            </select>

            <select
              value={range}
              onChange={(event) => setRange(event.target.value)}
              aria-label="Filter by time"
              className="focus-ring h-11 rounded-xl border border-slate-200 bg-white/85 px-3 text-sm text-slate-700"
            >
              <option value="1">Last 24 hours</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="all">All time</option>
            </select>
          </div>

          {list.isLoading ? (
            <SkeletonRows rows={8} />
          ) : list.isError ? (
            <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="No events match"
              message={
                search || category !== 'all' || status !== 'all' || range !== 'all'
                  ? 'Try a wider time range, another category, or a different search.'
                  : 'Actions will be recorded here as soon as people start using the system.'
              }
            />
          ) : (
            <>
              <div className="relative space-y-2.5">
                <div className="absolute bottom-6 left-[21px] top-6 hidden w-px bg-slate-200 sm:block" aria-hidden="true" />

                {rows.map((row, index) => {
                  const style = styleFor(row.category);
                  const Icon = style.icon;

                  return (
                    <div
                      key={row.id}
                      className="animate-rise relative flex gap-3"
                      style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
                    >
                      <span
                        className={`z-10 mt-1 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 sm:flex ${style.chip}`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>

                      <div className="min-w-0 flex-1 rounded-2xl border border-slate-100 bg-white/80 px-4 py-3.5 transition hover:border-slate-200 hover:bg-white">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-800">{humanizeAction(row.action)}</p>
                            <Badge tone={row.status === 'fail' ? 'danger' : 'success'}>{row.status === 'fail' ? 'Failed' : 'Success'}</Badge>
                            <Badge tone="neutral">{style.label}</Badge>
                          </div>
                          <p className="text-[11px] text-slate-400">{timeAgo(row.createdAt)}</p>
                        </div>

                        <p className="mt-1 truncate text-xs text-slate-500">
                          {row.actor?.name || row.actor?.email || 'Unknown visitor'}
                          {row.actor?.role ? ` · ${row.actor.role.toLowerCase()}` : ''}
                          {row.targetType ? ` · ${row.targetType}` : ''}
                          {row.ip ? ` · ${row.ip}` : ''}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] text-slate-400">{formatEthiopian(row.createdAt, { time: true })}</p>
                          <button
                            type="button"
                            onClick={() => setSelected(row)}
                            className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold text-brand-600 transition hover:bg-brand-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Details
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Pagination
                page={list.data?.page ?? page}
                pages={list.data?.pages ?? 1}
                total={total}
                limit={limit}
                onPage={setPage}
                onLimit={(value) => {
                  setLimit(value);
                  setPage(1);
                }}
              />
            </>
          )}
        </CardBody>
      </Card>

      <Modal
        open={!!selected}
        title={selected ? humanizeAction(selected.action) : 'Audit entry'}
        subtitle={selected ? formatEthiopian(selected.createdAt, { time: true }) : ''}
        onClose={() => setSelected(null)}
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setSelected(null)}>
            Close
          </Button>
        }
      >
        {selected ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${selectedStyle.chip}`}>
                {SelectedIcon ? <SelectedIcon className="h-4.5 w-4.5" /> : null}
              </span>
              <Badge tone={selected.status === 'fail' ? 'danger' : 'success'}>
                {selected.status === 'fail' ? 'Failed' : 'Success'}
              </Badge>
              <Badge tone="neutral">{selectedStyle.label}</Badge>
              <Badge tone="brand">{selected.action}</Badge>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ['Who', selected.actor?.name || selected.actor?.email || 'Unknown visitor'],
                ['Role', selected.actor?.role || selected.actorRole || '—'],
                ['Target', selected.targetType || '—'],
                ['Record id', selected.targetId || '—'],
                ['IP address', selected.ip || '—'],
                ['Time', formatEthiopian(selected.createdAt, { time: true })],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
                  <dd className="mt-0.5 break-words text-sm font-medium text-slate-700">{value}</dd>
                </div>
              ))}
            </dl>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Recorded details</p>
              {selected.meta && Object.keys(selected.meta).length ? (
                <pre className="thin-scroll max-h-64 overflow-auto rounded-2xl bg-slate-900 px-4 py-3 text-xs leading-relaxed text-slate-100">
                  {JSON.stringify(selected.meta, null, 2)}
                </pre>
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">
                  This event has no extra details. Passwords, tokens and codes are never written to the audit trail.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
