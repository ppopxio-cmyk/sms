import { NavLink } from 'react-router-dom';
import {
  Bell,
  Download,
  Fingerprint,
  LayoutDashboard,
  LogOut,
  Megaphone,
  ScrollText,
  Settings2,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import Brand from '../ui/Brand';
import { RoleBadge } from '../ui/Badge';
import { formatEthiopian } from '../../lib/ethiopianDate';

// The first entry is the role's own front door, so it is the same page for everybody but
// under a different address. Personal pages (notices, profile, devices, signing out) live
// in the avatar menu, so they are not repeated here.
const navItems = () => [
  // The admin workspace is ordered the way it is used: watch the college, then people,
  // then communication, then the levers that change the platform.
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true, roles: ['ADMIN'] },
  { to: '/admin/sessions', label: 'Sessions', icon: ShieldCheck, roles: ['ADMIN'] },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText, roles: ['ADMIN'] },
  { to: '/admin/users', label: 'Users', icon: Users, roles: ['ADMIN'] },
  { to: '/admin/announcements', label: 'Announcements', icon: Megaphone, roles: ['ADMIN'] },
  { to: '/admin/notifications', label: 'Notifications', icon: Bell, roles: ['ADMIN'] },
  { to: '/admin/export', label: 'Export Center', icon: Download, roles: ['ADMIN'] },
  { to: '/admin/settings', label: 'System Settings', icon: Settings2, roles: ['ADMIN'] },
  { to: '/admin/account', label: 'My Account', icon: UserRound, roles: ['ADMIN'] },
  { to: '/admin/devices', label: 'My Devices', icon: Fingerprint, roles: ['ADMIN'] },
  { to: '/registrar', label: 'Dashboard', icon: LayoutDashboard, end: true, roles: ['REGISTRAR'] },
  { to: '/teacher', label: 'Dashboard', icon: LayoutDashboard, end: true, roles: ['TEACHER'] },
  { to: '/accountant', label: 'Dashboard', icon: LayoutDashboard, end: true, roles: ['ACCOUNTANT'] },
];

const itemClass = ({ isActive }) =>
  `focus-ring group relative flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition ${
    isActive
      ? 'brand-gradient text-white shadow-lg shadow-brand-600/25'
      : 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm'
  }`;

const iconClass = ({ isActive }) =>
  `h-4 w-4 shrink-0 transition ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-brand-500'}`;

function NavItems({ role, onNavigate }) {
  return navItems()
    .filter((item) => !item.roles || item.roles.includes(role))
    .map((item) => (
      <NavLink key={item.to} to={item.to} end={item.end} onClick={onNavigate} className={itemClass}>
        {({ isActive }) => (
          <>
            <item.icon className={iconClass({ isActive })} />
            {item.label}
          </>
        )}
      </NavLink>
    ));
}

// A fixed column on a wide screen, and the same content inside the drawer on a phone, so
// the two can never drift apart.
export default function Sidebar({ role, user, onNavigate, onClose, onSignOut }) {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-4 py-5 thin-scroll">
      <div className="flex items-center justify-between gap-2">
        <Brand size="sm" subtitle={formatEthiopian(new Date())} />

        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="focus-ring rounded-xl p-2 text-slate-500 transition hover:bg-white"
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      <nav className="flex flex-col gap-1.5">
        <p className="px-3.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Menu</p>
        <NavItems role={role} onNavigate={onNavigate} />
      </nav>

      <div className="mt-auto rounded-3xl border border-white/70 bg-white/70 p-3 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">
            {(user?.name || user?.email || 'U')
              .split(/[\s@._-]+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0])
              .join('')
              .toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">{user?.name || user?.email}</p>
            {user?.name ? <p className="truncate text-xs text-slate-500">{user?.email}</p> : null}
          </div>
          <RoleBadge role={user?.role} />
        </div>

        <button
          type="button"
          onClick={onSignOut}
          className="focus-ring mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}
