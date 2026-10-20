import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Menu, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import { useAuth } from '../../store/auth';
import { useNotificationStream } from '../../lib/notifications';
import Badge from '../ui/Badge';
import NotificationBell from './NotificationBell';
import ProfileMenu from './ProfileMenu';
import GlobalSearch from './GlobalSearch';
import Sidebar from './Sidebar';
import CommandPalette from './CommandPalette';

// The app has one fixed column on a wide screen and a drawer on a phone. The header keeps
// the three things that are always wanted within reach: search, notices and the account.
export default function AppShell() {
  const [open, setOpen] = useState(false);
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();

  // One live connection for the whole app: notices float in as they happen, on every page
  // and for every role. The service worker is registered once in main.jsx.
  useNotificationStream(true);

  const status = useQuery({
    queryKey: ['system-status'],
    queryFn: async () => (await api.get('/status')).data,
    refetchInterval: 60_000,
    retry: 0,
    staleTime: 30_000,
  });
  const maintenance = status.data?.maintenance;
  const isAdmin = user?.role === 'ADMIN';

  const signOut = async () => {
    setOpen(false);
    await logout();
    toast.success('You have been signed out.');
    navigate('/login', { replace: true });
  };

  const close = () => setOpen(false);

  return (
    <div className="min-h-screen">
      {/* Wide screens: a column that never moves and never scrolls with the page. */}
      <aside className="glass-header fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-white/70 lg:block">
        <Sidebar role={user?.role} user={user} onSignOut={signOut} />
      </aside>

      <div className="lg:pl-64">
        <header className="glass-header sticky top-0 z-30">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className="focus-ring rounded-xl p-2.5 text-slate-500 transition hover:bg-white/80 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <GlobalSearch />

            <div className="ml-auto flex items-center gap-2">
              {isAdmin ? <CommandPalette /> : null}
              <NotificationBell />
              <ProfileMenu />
            </div>
          </div>
        </header>

        {maintenance?.enabled ? (
          <div className="border-b border-amber-200/80 bg-amber-50/90">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2.5 text-xs text-amber-900 sm:px-6">
              <Wrench className="h-4 w-4 shrink-0 text-amber-600" />
              <p className="min-w-0 flex-1">
                <span className="font-semibold">Maintenance mode is on.</span> {maintenance.message}
                {maintenance.until ? ` It is planned to end ${new Date(maintenance.until).toLocaleString()}.` : ''}
              </p>
              {isAdmin ? (
                <NavLink
                  to="/admin/settings"
                  state={{ tab: 'maintenance' }}
                  className="focus-ring rounded-lg bg-white/80 px-2.5 py-1 font-semibold text-amber-800 ring-1 ring-amber-200 hover:bg-white"
                >
                  Open settings
                </NavLink>
              ) : null}
            </div>
          </div>
        ) : null}

        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          <Outlet />
        </main>

        <footer className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <p className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">SMS - PORTAL</Badge>
              <span>All times shown in the Ethiopian calendar, Africa/Addis_Ababa.</span>
            </p>
            <p className="flex items-center gap-2">
              <NavLink to="/privacy" className="transition hover:text-slate-600">
                Privacy
              </NavLink>
              <span aria-hidden="true">·</span>
              <NavLink to="/terms" className="transition hover:text-slate-600">
                Terms
              </NavLink>
            </p>
          </div>
        </footer>
      </div>

      {/* Phones: the same column, sliding in over the page. */}
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={close}
            className="absolute inset-0 cursor-default bg-slate-900/30 backdrop-blur-sm"
          />
          <div className="animate-slide-left glass absolute inset-y-0 left-0 w-72 max-w-[85%] shadow-2xl">
            <Sidebar role={user?.role} user={user} onNavigate={close} onClose={close} onSignOut={signOut} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
