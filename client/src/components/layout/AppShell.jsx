import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogOut, Menu, ShieldCheck, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../store/auth';
import { homeFor } from '../../lib/roles';
import { useNotificationStream } from '../../lib/notifications';
import Brand from '../ui/Brand';
import Badge, { RoleBadge } from '../ui/Badge';
import NotificationBell from './NotificationBell';
import ProfileMenu from './ProfileMenu';
import { PERSONAL_ITEMS } from '../../lib/menu';
import { formatEthiopian } from '../../lib/ethiopianDate';

// The first entry is the role's own front door, so it is the same page for everybody but
// under a different address. Everything that belongs to the person rather than the job
// (notices, profile, devices, signing out) lives in the avatar menu instead.
const navItems = (role) => [
  { to: homeFor(role), label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users, roles: ['ADMIN'] },
  { to: '/admin/sessions', label: 'All sessions', icon: ShieldCheck, roles: ['ADMIN'] },
];

const itemClass = ({ isActive }) =>
  `focus-ring flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
    isActive ? 'bg-white text-brand-700 shadow-sm ring-1 ring-brand-100' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
  }`;

function NavItems({ role, onNavigate }) {
  return navItems(role)
    .filter((item) => !item.roles || item.roles.includes(role))
    .map((item) => (
      <NavLink key={item.to} to={item.to} end={item.end} onClick={onNavigate} className={itemClass}>
        <item.icon className="h-4 w-4" />
        {item.label}
      </NavLink>
    ));
}

export default function AppShell() {
  const [open, setOpen] = useState(false);
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();

  // One live connection for the whole app: notices float in as they happen, on every page
  // and for every role. The service worker is registered once in main.jsx.
  useNotificationStream(true);

  const signOut = async () => {
    setOpen(false);
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
            <ProfileMenu />

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

            <div className="my-3 h-px bg-slate-100" />

            <div className="flex flex-col gap-1">
              {PERSONAL_ITEMS.map((item) => (
                <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)} className={itemClass}>
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
              <button
                type="button"
                onClick={signOut}
                className="focus-ring flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">{user?.name || user?.email}</p>
                {user?.name ? <p className="truncate text-xs text-slate-500">{user?.email}</p> : null}
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
  );
}
