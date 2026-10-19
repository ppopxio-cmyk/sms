import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Fingerprint } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { formatEthiopian, timeAgo } from '../lib/ethiopianDate';
import Card, { CardBody, CardHeader } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import DeviceIcon from '../components/ui/DeviceIcon';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/StatePanel';

export default function Sessions() {
  const queryClient = useQueryClient();

  const sessions = useQuery({
    queryKey: ['my-sessions'],
    queryFn: async () => (await api.get('/auth/sessions')).data,
  });

  const revoke = useMutation({
    mutationFn: (id) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => {
      toast.success('That device was signed out.');
      queryClient.invalidateQueries({ queryKey: ['my-sessions'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'We could not sign that device out.')),
  });

  const rows = sessions.data?.sessions ?? [];

  return (
    <div className="space-y-6">
      <header className="animate-rise">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">My devices</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Every device signed in to your account. If you see something you do not recognise, sign it out and change your password.
        </p>
      </header>

      <Card>
        <CardHeader
          icon={Fingerprint}
          title="Active devices"
          subtitle={sessions.isLoading ? 'Checking where you are signed in…' : `${rows.length} active`}
          action={
            <Button variant="secondary" size="sm" onClick={() => sessions.refetch()} loading={sessions.isFetching}>
              Refresh
            </Button>
          }
        />
        <CardBody className="space-y-3">
          {sessions.isLoading ? (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </>
          ) : sessions.isError ? (
            <ErrorState message={errorMessage(sessions.error)} onRetry={() => sessions.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState title="No active devices" message="Nothing is signed in with this account right now." />
          ) : (
            rows.map((s) => (
              <div
                key={s.id}
                className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 gap-3.5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                    <DeviceIcon type={s.deviceType} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                      {s.browser} on {s.os}
                      {s.current ? <Badge tone="success">This device</Badge> : null}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {s.ip} · {s.location || 'Unknown place'} · last active {timeAgo(s.lastSeenAt)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">Signed in {formatEthiopian(s.createdAt, { time: true })}</p>
                  </div>
                </div>

                <Button
                  variant={s.current ? 'secondary' : 'danger'}
                  size="sm"
                  onClick={() => revoke.mutate(s.id)}
                  loading={revoke.isPending && revoke.variables === s.id}
                  className="shrink-0"
                >
                  {s.current ? 'Sign this one out' : 'Sign out'}
                </Button>
              </div>
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}
