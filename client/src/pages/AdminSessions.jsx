import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Clock3,
  Fingerprint,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { deviceSubtitle, deviceTitle, placeLine } from '../lib/deviceName';
import { formatEthiopian, timeAgo } from '../lib/ethiopianDate';
import { number, roleLabel } from '../lib/format';
import { useDebounced } from '../lib/useDebounced';
import { useNow } from '../lib/useNow';
import Card, { CardBody, CardHeader } from '../components/ui/Card';
import Badge, { RoleBadge } from '../components/ui/Badge';
import Button from '../components/ui/Button';
import DeviceIcon from '../components/ui/DeviceIcon';
import ExportMenu from '../components/ui/ExportMenu';
import FilterTabs from '../components/ui/FilterTabs';
import LiveStamp from '../components/ui/LiveStamp';
import Modal from '../components/ui/Modal';
import Pagination from '../components/ui/Pagination';
import SearchInput from '../components/ui/SearchInput';
import StatCard from '../components/ui/StatCard';
import { SkeletonRows } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/StatePanel';

const STATE = {
  online: { label: 'Online', tone: 'success', dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-600 ring-emerald-100' },
  away: { label: 'Away', tone: 'warning', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-600 ring-amber-100' },
  terminated: { label: 'Ended', tone: 'danger', dot: 'bg-rose-500', chip: 'bg-rose-50 text-rose-600 ring-rose-100' },
  expired: { label: 'Expired', tone: 'neutral', dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

const ROLE_OPTIONS = ['ADMIN', 'REGISTRAR', 'TEACHER', 'ACCOUNTANT'];

export default function AdminSessions() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [ending, setEnding] = useState(null);
  const now = useNow(1000);
  const debouncedSearch = useDebounced(search);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, tab, role, limit]);

  const params = {
    search: debouncedSearch || undefined,
    role: role || undefined,
    status: tab,
    page,
    limit,
  };

  const exportParams = {
    search: debouncedSearch || undefined,
    role: role || undefined,
    status: tab,
  };

  const list = useQuery({
    queryKey: ['admin-sessions', params],
    queryFn: async () => (await api.get('/admin/sessions', { params })).data,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });

  const terminate = useMutation({
    mutationFn: (id) => api.delete(`/admin/sessions/${id}`),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'That session was ended.');
      setEnding(null);
      queryClient.invalidateQueries({ queryKey: ['admin-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'We could not end that session.')),
  });

  const rows = list.data?.sessions ?? [];
  const counts = list.data?.counts;
  const total = list.data?.total ?? 0;

  useEffect(() => {
    if (list.data && page > list.data.pages) setPage(list.data.pages);
  }, [page, list.data]);

  const tabs = [
    { key: 'all', label: 'All', count: counts?.all, dot: 'bg-slate-400' },
    { key: 'active', label: 'Live', count: counts?.active, dot: 'bg-emerald-500' },
    { key: 'online', label: 'Online', count: counts?.online, dot: 'bg-sky-500' },
    { key: 'away', label: 'Away', count: counts?.away, dot: 'bg-amber-500' },
    { key: 'terminated', label: 'Ended', count: counts?.terminated, dot: 'bg-rose-500' },
    { key: 'expired', label: 'Expired', count: counts?.expired, dot: 'bg-slate-400' },
  ];

  const empty =
    tab === 'terminated'
      ? { title: 'No ended sessions', message: 'Sessions ended by an administrator will stay listed here until they expire.' }
      : tab === 'online' || tab === 'active'
        ? { title: 'Nobody is signed in', message: 'No live session matches this view right now.' }
        : { title: 'No sessions match', message: 'Try a different search, role or category.' };

  return (
    <div className="space-y-6">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Clock3 className="h-4 w-4 text-brand-500" />
              {formatEthiopian(now, { time: true })}
            </p>
            <LiveStamp updatedAt={list.dataUpdatedAt} label="Sessions live" />
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Sessions</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Every browser signed in across the school, including the ones that were ended. End a live session to sign that person
            out immediately.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={(counts?.online ?? 0) > 0 ? 'success' : 'neutral'}>
            <span className={`h-1.5 w-1.5 rounded-full ${(counts?.online ?? 0) > 0 ? 'animate-pulse-dot bg-current' : 'bg-slate-400'}`} />
            {number(counts?.online ?? 0)} online now
          </Badge>
          <Button variant="secondary" size="sm" onClick={() => list.refetch()} loading={list.isFetching}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <ExportMenu
            basePath="/admin/sessions/export"
            params={exportParams}
            filenamePrefix="sessions"
            disabled={list.isLoading || total === 0}
          />
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Fingerprint}
          tone="indigo"
          label="Live sessions"
          value={number(counts?.active ?? 0)}
          hint="Signed in and not expired"
          loading={list.isLoading}
        />
        <StatCard
          icon={Wifi}
          tone="emerald"
          label="Online now"
          value={number(counts?.online ?? 0)}
          hint="Active in the last two minutes"
          loading={list.isLoading}
        />
        <StatCard
          icon={WifiOff}
          tone="amber"
          label="Away"
          value={number(counts?.away ?? 0)}
          hint="Still signed in, but quiet"
          loading={list.isLoading}
        />
        <StatCard
          icon={ShieldCheck}
          tone="rose"
          label="Ended"
          value={number(counts?.terminated ?? 0)}
          hint="Sessions an administrator stopped"
          loading={list.isLoading}
        />
      </section>

      <Card>
        <CardHeader
          icon={MonitorSmartphone}
          title="Signed-in devices"
          subtitle={
            list.isLoading
              ? 'Loading sessions…'
              : `${number(total)} session${total === 1 ? '' : 's'} in this view${role ? ` · ${roleLabel(role)}` : ''}`
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
            value={tab}
            onChange={(value) => {
              setTab(value);
              setPage(1);
            }}
            label="Filter sessions by state"
          />

          <div className="flex flex-col gap-3 sm:flex-row">
            <SearchInput
              id="session-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, email, IP or device"
              label="Search sessions"
              loading={list.isFetching && Boolean(debouncedSearch)}
              className="flex-1"
            />
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
              aria-label="Filter sessions by role"
              className="focus-ring h-11 rounded-xl border border-slate-200 bg-white/85 px-3 text-sm text-slate-700"
            >
              <option value="">Every role</option>
              {ROLE_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {roleLabel(value)}
                </option>
              ))}
            </select>
          </div>

          <p className="-mt-1 text-xs text-slate-500">
            A place is estimated from the IP address and may not always be accurate. A browser cannot read the model of a laptop.
          </p>

          {list.isLoading ? (
            <SkeletonRows rows={6} />
          ) : list.isError ? (
            <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={tab === 'online' || tab === 'active' ? ShieldCheck : MonitorSmartphone}
              title={empty.title}
              message={empty.message}
            />
          ) : (
            <>
              <ul className="space-y-3">
                {rows.map((session, index) => {
                  const state = STATE[session.state] ?? STATE.away;
                  const live = session.state === 'online' || session.state === 'away';
                  const subtitle = deviceSubtitle(session);

                  return (
                    <li
                      key={session.id}
                      className="animate-rise flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white/75 px-4 py-4 transition hover:bg-white lg:flex-row lg:items-center lg:justify-between"
                      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
                    >
                      <div className="flex min-w-0 gap-3.5">
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${state.chip}`}>
                          <DeviceIcon type={session.deviceType} className="h-5 w-5" />
                        </span>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-800">
                              {session.user?.name || session.user?.email}
                            </p>
                            <RoleBadge role={session.user?.role} />
                            <Badge tone={state.tone}>
                              {session.state === 'online' ? <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-current" /> : null}
                              {state.label}
                            </Badge>
                          </div>
                          {session.user?.name ? <p className="mt-0.5 truncate text-xs text-slate-500">{session.user.email}</p> : null}
                          <p className="mt-1 truncate text-xs font-medium text-slate-600">{deviceTitle(session)}</p>
                          {subtitle ? <p className="mt-0.5 truncate text-xs text-slate-400">{subtitle}</p> : null}
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            {placeLine(session)} · {session.ip || 'address unavailable'}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            Started {formatEthiopian(session.createdAt, { time: true })} · last active {timeAgo(session.lastSeenAt)}
                            {session.revokedAt ? ` · ended ${timeAgo(session.revokedAt)}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 lg:flex-col lg:items-end">
                        {live ? (
                          session.current ? (
                            <Badge tone="brand">This device</Badge>
                          ) : (
                            <Button variant="danger" size="sm" onClick={() => setEnding(session)} className="shrink-0">
                              End session
                            </Button>
                          )
                        ) : (
                          <Badge tone={state.tone}>{state.label}</Badge>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

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
        open={!!ending}
        title="End this session?"
        subtitle={ending ? `${ending.user?.name || ending.user?.email} will be signed out on this device immediately.` : ''}
        onClose={() => setEnding(null)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEnding(null)}>
              Keep it signed in
            </Button>
            <Button
              variant="danger"
              loading={terminate.isPending}
              onClick={() => terminate.mutate(ending.id)}
            >
              End session
            </Button>
          </>
        }
      >
        {ending ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm">
                <DeviceIcon type={ending.deviceType} className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">{deviceTitle(ending)}</p>
                <p className="truncate text-xs text-slate-500">
                  {placeLine(ending)} · {ending.ip}
                </p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-slate-600">
              The refresh cookie stops working at once, so this browser cannot continue as that person. They can sign in again if
              the account is still active.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
