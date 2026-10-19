import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Bell, BellRing, CheckCheck, KeyRound, LogIn, MailCheck, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import { useNotifications, useUnread } from '../../lib/notifications';
import { timeAgo } from '../../lib/ethiopianDate';

const ICONS = {
  login: LogIn,
  user_login: ShieldCheck,
  email_verified: MailCheck,
  user_verified: MailCheck,
  password_changed: KeyRound,
  user_password_changed: KeyRound,
};

const iconFor = (type) => ICONS[type] ?? Bell;

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const unread = useUnread();
  const latest = useNotifications({ limit: 5 });
  const rows = latest.data?.notifications ?? [];
  const count = unread.data?.unread ?? 0;

  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    onError: (err) => toast.error(errorMessage(err, 'We could not update your notifications.')),
  });

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
        title="Notifications"
        className="focus-ring relative rounded-xl p-2.5 text-slate-500 transition hover:bg-white/80 hover:text-brand-600"
      >
        {count ? <BellRing className="h-4.5 w-4.5 animate-pop" /> : <Bell className="h-4.5 w-4.5" />}
        {count ? (
          <span className="brand-gradient absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white shadow-sm">
            {count > 9 ? '9+' : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="animate-rise absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">
                Notifications {count ? <span className="text-brand-600">({count})</span> : null}
              </p>
              {count ? (
                <button
                  type="button"
                  onClick={() => markAll.mutate()}
                  disabled={markAll.isPending}
                  className="focus-ring inline-flex items-center gap-1 rounded-lg text-xs font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              ) : null}
            </div>

            {latest.isLoading ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">Nothing yet. You are all caught up.</p>
            ) : (
              <ul className="max-h-80 divide-y divide-slate-50 overflow-y-auto">
                {rows.map((item) => {
                  const Icon = iconFor(item.type);
                  return (
                    <li key={item.id} className={`flex gap-3 px-4 py-3 ${item.readAt ? '' : 'bg-brand-50/40'}`}>
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-snug text-slate-800">{item.title}</p>
                        {item.body ? <p className="mt-0.5 truncate text-xs text-slate-500">{item.body}</p> : null}
                        <p className="mt-0.5 text-[11px] text-slate-400">{timeAgo(item.createdAt)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="focus-ring flex items-center justify-center gap-1.5 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-sm font-semibold text-brand-600 transition hover:bg-slate-100"
            >
              See all notifications
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
