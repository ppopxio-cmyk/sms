import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, ShieldCheck, Users } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { formatEthiopian, timeAgo } from '../lib/ethiopianDate';
import Card, { CardBody, CardHeader } from '../components/ui/Card';
import Badge, { RoleBadge } from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import DeviceIcon from '../components/ui/DeviceIcon';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/StatePanel';

export default function AdminSessions() {
  const queryClient = useQueryClient();
  const [term, setTerm] = useState('');

  const all = useQuery({
    queryKey: ['admin-sessions'],
    queryFn: async () => (await api.get('/admin/sessions')).data,
    refetchInterval: 60_000,
  });

  const terminate = useMutation({
    mutationFn: (id) => api.delete(`/admin/sessions/${id}`),
    onSuccess: () => {
      toast.success('That session was ended.');
      queryClient.invalidateQueries({ queryKey: ['admin-sessions'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'We could not end that session.')),
  });

  const rows = useMemo(() => all.data?.sessions ?? [], [all.data]);

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((s) =>
      [s.user?.name, s.user?.email, s.user?.role, s.ip, s.browser, s.os, s.deviceType, s.location]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, term]);

  return (
    <div className="space-y-6">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">All sessions</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Every device signed in across the school. End any session to sign that person out immediately.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {all.data ? (
            <Badge tone={all.data.onlineCount > 0 ? 'success' : 'neutral'}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {all.data.onlineCount} online now
            </Badge>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => all.refetch()} loading={all.isFetching}>
            Refresh
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader
          icon={Users}
          title="Signed-in devices"
          subtitle={all.isLoading ? 'Loading…' : `${filtered.length} of ${rows.length} shown`}
        />
        <CardBody className="space-y-4">
          <Field
            label="Search"
            icon={Search}
            placeholder="Name, email, role, IP or device"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />

          {all.isLoading ? (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </>
          ) : all.isError ? (
            <ErrorState message={errorMessage(all.error)} onRetry={() => all.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState title="Nobody is signed in" message="There are no active sessions right now." icon={ShieldCheck} />
          ) : filtered.length === 0 ? (
            <EmptyState title="No matches" message="No session matches that search." icon={Search} />
          ) : (
            <ul className="space-y-3">
              {filtered.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white/70 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="flex min-w-0 gap-3.5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                      <DeviceIcon type={s.deviceType} className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-800">{s.user?.name}</p>
                        <RoleBadge role={s.user?.role} />
                        {s.online ? <Badge tone="success">Online</Badge> : <Badge tone="neutral">Away</Badge>}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{s.user?.email}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {s.browser} on {s.os} · {s.ip} · {s.location || 'Unknown place'}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        Started {formatEthiopian(s.createdAt, { time: true })} · last active {timeAgo(s.lastSeenAt)}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => terminate.mutate(s.id)}
                    loading={terminate.isPending && terminate.variables === s.id}
                    className="shrink-0"
                  >
                    End session
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
