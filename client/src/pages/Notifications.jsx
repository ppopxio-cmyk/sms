import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, CircleCheck, KeyRound, LogIn, MailCheck, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../lib/api';
import { useNotifications, useUnread } from '../lib/notifications';
import { timeAgo } from '../lib/ethiopianDate';
import Card, { CardBody, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import PushToggle from '../components/ui/PushToggle';
import SearchInput from '../components/ui/SearchInput';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/StatePanel';

const ICONS = {
  login: LogIn,
  user_login: ShieldCheck,
  email_verified: MailCheck,
  user_verified: MailCheck,
  password_changed: KeyRound,
  user_password_changed: KeyRound,
};

const iconFor = (type) => ICONS[type] ?? Bell;

const KEY = 'notifications';

export default function Notifications() {
  const queryClient = useQueryClient();
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [term, setTerm] = useState('');

  const list = useNotifications({ unread: onlyUnread, limit: 100 });
  const unread = useUnread();
  const rows = list.data?.notifications ?? [];
  const count = unread.data?.unread ?? 0;

  const q = term.trim().toLowerCase();
  const visible = q
    ? rows.filter((item) =>
        [item.title, item.body, item.type].filter(Boolean).some((value) => String(value).toLowerCase().includes(q)),
      )
    : rows;

  const refresh = () => queryClient.invalidateQueries({ queryKey: [KEY] });
  const fail = (err, fallback) => toast.error(errorMessage(err, fallback));

  const markOne = useMutation({
    mutationFn: (id) => api.post(`/notifications/${id}/read`),
    onSuccess: refresh,
    onError: (err) => fail(err, 'We could not update that notification.'),
  });

  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => {
      toast.success('Everything is marked as read.');
      refresh();
    },
    onError: (err) => fail(err, 'We could not update your notifications.'),
  });

  const removeOne = useMutation({
    mutationFn: (id) => api.delete(`/notifications/${id}`),
    onSuccess: refresh,
    onError: (err) => fail(err, 'We could not delete that notification.'),
  });

  const clearAll = useMutation({
    mutationFn: () => api.delete('/notifications'),
    onSuccess: (res) => {
      toast.success(res.data?.removed ? 'All your notifications were deleted.' : 'You had nothing to delete.');
      refresh();
    },
    onError: (err) => fail(err, 'We could not clear your notifications.'),
  });

  return (
    <div className="space-y-6">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Notifications</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Sign-ins on your account, changes to your password, and what the school is doing. These are yours alone, and you can
            delete them at any time.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => markAll.mutate()} loading={markAll.isPending} disabled={!count}>
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
          <Button
            variant="danger"
            onClick={() => clearAll.mutate()}
            loading={clearAll.isPending}
            disabled={rows.length === 0 && !count}
          >
            <Trash2 className="h-4 w-4" />
            Delete all
          </Button>
        </div>
      </header>

      <PushToggle />

      <Card>
        <CardHeader
          icon={Bell}
          title="Your notifications"
          subtitle={
            list.isLoading ? 'Loading…' : `${list.data?.total ?? 0} shown${count ? ` · ${count} unread` : ''}`
          }
          action={
            <div className="flex rounded-xl bg-slate-100 p-1">
              {[
                { id: 'all', label: 'All' },
                { id: 'unread', label: 'Unread' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setOnlyUnread(tab.id === 'unread')}
                  className={`focus-ring rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    (tab.id === 'unread') === onlyUnread ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          }
        />

        <CardBody className="space-y-3">
          <SearchInput
            id="notification-search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search your notifications"
            label="Search notifications"
            className="max-w-md"
          />

          {list.isLoading ? (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </>
          ) : list.isError ? (
            <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={CircleCheck}
              title={onlyUnread ? 'Nothing unread' : 'Nothing here yet'}
              message={
                onlyUnread
                  ? 'You have read everything. Switch to All to see the older ones.'
                  : 'When something happens on your account, or the school sends a notice, it will appear here.'
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState icon={Search} title="No notices match" message="Try a shorter word or a different search." />
          ) : (
            visible.map((item) => {
              const Icon = iconFor(item.type);
              return (
                <div
                  key={item.id}
                  className={`flex flex-col gap-3 rounded-2xl border px-4 py-4 transition sm:flex-row sm:items-center sm:justify-between ${
                    item.readAt ? 'border-slate-100 bg-white/70' : 'border-brand-100 bg-brand-50/50'
                  }`}
                >
                  <div className="flex min-w-0 gap-3.5">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        item.readAt ? 'bg-slate-100 text-slate-500' : 'bg-white text-brand-600 ring-1 ring-brand-100'
                      }`}
                    >
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                        {item.title}
                        {item.readAt ? null : <Badge tone="brand">new</Badge>}
                      </p>
                      {item.body ? <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{item.body}</p> : null}
                      <p className="mt-1 text-[11px] text-slate-400">{timeAgo(item.createdAt)}</p>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {item.readAt ? null : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => markOne.mutate(item.id)}
                        loading={markOne.isPending && markOne.variables === item.id}
                      >
                        Mark read
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Delete this notification"
                      onClick={() => removeOne.mutate(item.id)}
                      loading={removeOne.isPending && removeOne.variables === item.id}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardBody>
      </Card>
    </div>
  );
}
