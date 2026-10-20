import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CheckCheck,
  CircleCheck,
  KeyRound,
  LogIn,
  MailCheck,
  Megaphone,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../store/auth';
import { useNotifications, useUnread } from '../lib/notifications';
import { timeAgo } from '../lib/ethiopianDate';
import { number } from '../lib/format';
import Card, { CardBody, CardHeader } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import FilterTabs from '../components/ui/FilterTabs';
import Modal from '../components/ui/Modal';
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
  two_step_enabled: ShieldCheck,
  two_step_disabled: ShieldAlert,
  announcement: Megaphone,
  user_push_subscribed: Bell,
  user_push_unsubscribed: Bell,
};

const SECURITY_TYPES = new Set([
  'login',
  'user_login',
  'email_verified',
  'user_verified',
  'password_changed',
  'user_password_changed',
  'two_step_enabled',
  'two_step_disabled',
  'security',
]);

const isSecurity = (item) => SECURITY_TYPES.has(item.type) || /password|login|verified|two_step|security/i.test(item.type || '');
const isAnnouncement = (item) => item.type === 'announcement';

const iconFor = (type) => ICONS[type] ?? (isAnnouncement({ type }) ? Megaphone : Bell);

const KEY = 'notifications';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'security', label: 'Security' },
  { key: 'system', label: 'System' },
  { key: 'announcements', label: 'Announcements' },
];

function belongs(item, tab) {
  if (tab === 'unread') return !item.readAt;
  if (tab === 'security') return isSecurity(item);
  if (tab === 'announcements') return isAnnouncement(item);
  if (tab === 'system') return !isSecurity(item) && !isAnnouncement(item);
  return true;
}

export default function Notifications() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const user = useAuth((state) => state.user);
  const [tab, setTab] = useState('all');
  const [term, setTerm] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  // One list powers every tab. A person has a small number of notices, and this keeps
  // switching tabs instant and avoids four separate round trips.
  const list = useNotifications({ unread: false, limit: 100 });
  const unread = useUnread();
  const rows = list.data?.notifications ?? [];
  const count = unread.data?.unread ?? 0;

  const counts = {
    all: rows.length,
    unread: rows.filter((item) => !item.readAt).length,
    security: rows.filter(isSecurity).length,
    system: rows.filter((item) => !isSecurity(item) && !isAnnouncement(item)).length,
    announcements: rows.filter(isAnnouncement).length,
  };

  const q = term.trim().toLowerCase();
  const visible = rows
    .filter((item) => belongs(item, tab))
    .filter((item) =>
      q
        ? [item.title, item.body, item.type, item.actorName]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(q))
        : true,
    );

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
      setConfirmClear(false);
      refresh();
    },
    onError: (err) => fail(err, 'We could not clear your notifications.'),
  });

  const emptyCopy = {
    all: ['Nothing here yet', 'When something happens on your account, or the school sends a notice, it will appear here.'],
    unread: ['Nothing unread', 'You have read everything. Switch to All to see the older ones.'],
    security: ['No security notices', 'Password changes, new devices and other security events will be listed here.'],
    system: ['No system notices', 'Account and portal notices that are not security or announcements appear here.'],
    announcements: ['No announcements yet', 'College announcements appear here and are also delivered live through the bell.'],
  }[tab];

  return (
    <div className="space-y-6">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">Yours alone</span>
            {count ? <Badge tone="brand">{number(count)} unread</Badge> : <Badge tone="success">All caught up</Badge>}
          </div>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-slate-900">Notifications</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Security events, system notices and college announcements in one place. Opening an announcement also records your read receipt for the administrator.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => markAll.mutate()} loading={markAll.isPending} disabled={!count}>
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
          <Button
            variant="danger"
            onClick={() => setConfirmClear(true)}
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
          subtitle={list.isLoading ? 'Loading…' : `${number(counts.all)} in the last 30 days${count ? ` · ${number(count)} unread` : ''}`}
          action={
            <Button variant="ghost" size="sm" onClick={() => list.refetch()} loading={list.isFetching && !list.isLoading}>
              Refresh
            </Button>
          }
        />
        <CardBody className="space-y-4">
          <FilterTabs
            tabs={TABS.map((item) => ({ ...item, count: counts[item.key] }))}
            value={tab}
            onChange={(value) => setTab(value)}
            label="Notification categories"
          />

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
              title={emptyCopy[0]}
              message={emptyCopy[1]}
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={Search}
              title={q ? 'No notices match' : `No ${tab} notices`}
              message={q ? 'Try a shorter word or a different search.' : 'Switch to All to see everything in your notification history.'}
            />
          ) : (
            visible.map((item) => {
              const Icon = iconFor(item.type);
              const announcement = isAnnouncement(item);
              return (
                <div
                  key={item.id}
                  className={`flex flex-col gap-3 rounded-2xl border px-4 py-4 transition sm:flex-row sm:items-center sm:justify-between ${
                    item.readAt
                      ? 'border-slate-100 bg-white/70'
                      : announcement
                        ? 'border-fuchsia-100 bg-fuchsia-50/40'
                        : 'border-brand-100 bg-brand-50/50'
                  }`}
                >
                  <div className="flex min-w-0 gap-3.5">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        item.readAt
                          ? 'bg-slate-100 text-slate-500'
                          : announcement
                            ? 'bg-white text-fuchsia-600 ring-1 ring-fuchsia-100'
                            : 'bg-white text-brand-600 ring-1 ring-brand-100'
                      }`}
                    >
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                        {item.title}
                        {announcement && item.meta?.priority === 'critical' ? <Badge tone="danger">critical</Badge> : null}
                        {announcement && item.meta?.priority === 'high' ? <Badge tone="warning">high</Badge> : null}
                        {item.readAt ? null : <Badge tone="brand">new</Badge>}
                      </p>
                      {item.body ? <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{item.body}</p> : null}
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        <span>{timeAgo(item.createdAt)}</span>
                        <span className="text-slate-300">·</span>
                        <span>{announcement ? 'College announcement' : isSecurity(item) ? 'Security' : 'System'}</span>
                        {item.actorName ? <span>· {item.actorName}</span> : null}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {announcement && user?.role === 'ADMIN' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (!item.readAt) markOne.mutate(item.id);
                          navigate('/admin/announcements');
                        }}
                      >
                        Announcements
                      </Button>
                    ) : null}
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

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Delete every notification?"
        subtitle="This clears your personal notification history. It cannot be undone."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmClear(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => clearAll.mutate()} loading={clearAll.isPending}>
              <Trash2 className="h-4 w-4" />
              Delete all
            </Button>
          </>
        }
      >
        <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4 text-sm leading-relaxed text-rose-800">
          Announcement read receipts already recorded for administrators are kept. Deleting a
          notice here only removes it from your own list.
        </div>
      </Modal>
    </div>
  );
}
