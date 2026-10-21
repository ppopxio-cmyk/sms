import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../store/auth';
import { useUnread } from '../../lib/notifications';
import { personalItems } from '../../lib/menu';
import { RoleBadge } from '../ui/Badge';

const initials = (value) =>
  (value || '')
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || 'U';

// The avatar sits next to the bell. Everything that belongs to the person rather than to
// their job lives behind it: their notices, their profile, their devices, and signing out.
export default function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const user = useAuth((s) => s.user);
  const status = useAuth((s) => s.status);
  const logout = useAuth((s) => s.logout);
  const unread = useUnread({ enabled: status === 'ready' && Boolean(user) });
  const navigate = useNavigate();

  const count = unread.data?.unread ?? 0;
  const label = user?.name || user?.email || '';

  const signOut = async () => {
    setOpen(false);
    await logout();
    toast.success('You have been signed out.');
    navigate('/login', { replace: true });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Your menu"
        aria-expanded={open}
        title="Your menu"
        className="focus-ring flex items-center rounded-full p-0.5 transition hover:bg-white/70"
      >
        <span className="brand-gradient flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white">
          {initials(label)}
        </span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close your menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="animate-rise absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-3xl border border-slate-100 bg-white p-2 shadow-2xl">
            <div className="px-3 py-2.5">
              <p className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-slate-800">{user?.name || user?.email}</span>
                <RoleBadge role={user?.role} />
              </p>
              {user?.name ? <p className="mt-0.5 truncate text-xs text-slate-500">{user?.email}</p> : null}
            </div>

            <div className="my-1 h-px bg-slate-100" />

            {personalItems(user?.role).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className="focus-ring flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {item.to.endsWith('/notifications') && count ? (
                  <span className="brand-gradient ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white">
                    {count > 9 ? '9+' : count}
                  </span>
                ) : null}
              </Link>
            ))}

            <div className="my-1 h-px bg-slate-100" />

            <button
              type="button"
              onClick={signOut}
              className="focus-ring flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
