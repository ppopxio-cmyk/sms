import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bell, Fingerprint, LayoutDashboard, LogOut, Menu, ShieldCheck, UserRound, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../store/auth';
import { homeFor } from '../../lib/roles';
import { useNotificationStream } from '../../lib/notifications';
import { registerServiceWorker } from '../../lib/push';
import Brand from '../ui/Brand';
import Badge, { RoleBadge } from '../ui/Badge';
import NotificationBell from './NotificationBell';
import { formatEthiopian } from '../../lib/ethiopianDate';

// The first entry is the role's own front door, so it is the same page for everybody but
// under a different address. The rest is the same for every role.
const navItems = (role) => [
  { to: homeFor(role), label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users, roles: ['ADMIN'] },
  { to: '/admin/sessions', label: 'All sessions', icon: ShieldCheck, roles: ['ADMIN'] },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/me', label: 'My profile', icon: UserRound, end: true },
  { to: '/me/devices', label: 'My devices', icon: Fingerprint },
];

const initials = (name) =>
  (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || 'U';

function NavItems({ role, onNavigate }) {
  return navItems(role)
    .filter((item) => !item.roles || item.roles.includes(role))
    .map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        onClick={onNavigate}
        className={({ isActive }) =>
          `focus-ring flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
            isActive ? 'bg-white text-brand-700 shadow-sm ring-1 ring-brand-100' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
          }`
        }
      >
        <item.icon className="h-4.5 w-4.5" />
        {item.label}
      </NavLink>
    ));
}

export default function AppShell() {
  const [open, setOpen] = useState(false);
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();

  // The service worker is what lets a notice arrive with the tab closed. It caches
  // nothing, so registering it here is enough.
  useEffect(() => {
    void registerServiceWorker();
  }, []);

  // One live connection for the whole app: notices appear as they happen.
  useNotificationStream(true);

  const signOut = async () => {
    await logout();
    toast.success('You have been signed out.');
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen">
      <header className="glass-header sticky top-0 z-30">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Brand size="sm" subtitle={formatEthiopian(new Date())} />

          <nav className="hidden items-center gap-1 lg:flex">
            <NavItems role={user?.role} />
          </nav>

          <div className="flex items-center gap-2">
            <NotificationBell />

            <Link
              to="/me"
              title="My profile"
              className="focus-ring hidden items-center gap-3 rounded-2xl px-2 py-1.5 transition hover:bg-white/70 sm:flex"
            >
              <span className="brand-gradient flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white">
                {initials(user?.name)}
              </span>
              <span className="hidden text-left xl:block">
                <span className="block text-sm font-semibold leading-tight text-slate-800">{user?.name}</span>
                <span className="block text-xs leading-tight text-slate-500">{user?.email}</span>
              </span>
              <RoleBadge role={user?.role} />
            </Link>

            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
              className="focus-ring rounded-xl p-2.5 text-slate-500 transition hover:bg-white/80 hover:text-rose-600"
            >
              <LogOut className="h-4.5 w-4.5" />
            </button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className="focus-ring rounded-xl p-2.5 text-slate-500 transition hover:bg-white/80 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="animate-rise absolute inset-x-3 top-3 rounded-3xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <Brand size="sm" subtitle="Menu" />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="focus-ring rounded-xl p-2 text-slate-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-col gap-1">
              <NavItems role={user?.role} onNavigate={() => setOpen(false)} />
            </div>
            <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">{user?.name}</p>
                <p className="text-xs text-slate-500">{user?.email}</p>
              </div>
              <RoleBadge role={user?.role} />
            </div>
          </div>
        </div>
      ) : null}

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <p className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <Badge tone="neutral">SMS - PORTAL</Badge>
          <span>All times shown in the Ethiopian calendar, Africa/Addis_Ababa.</span>
        </p>
      </footer>
    </div>
  );
}
