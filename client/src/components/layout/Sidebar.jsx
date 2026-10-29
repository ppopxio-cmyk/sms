import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  BookOpen,
  Calculator,
  ClipboardCheck,
  ClipboardList,
  Download,
  FileBarChart,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import Brand from '../ui/Brand';
import { RoleBadge } from '../ui/Badge';
import { formatEthiopian } from '../../lib/ethiopianDate';
import RegistrarNav from './RegistrarNav';
import AccountantNav from './AccountantNav';

// The first entry is the role's own front door, so it is the same page for everybody but
// under a different address. Personal pages (notices, profile, devices, signing out) live
// in the avatar menu, so they are not repeated here.
const navItems = () => [
  // The admin workspace is ordered the way it is used: watch the college, then people,
  // then communication, then the levers that change the platform.
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true, roles: ['ADMIN'] },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, roles: ['ADMIN'] },
  { to: '/admin/sessions', label: 'Sessions', icon: ShieldCheck, roles: ['ADMIN'] },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText, roles: ['ADMIN'] },
  { to: '/admin/users', label: 'Users', icon: Users, roles: ['ADMIN'] },
  { to: '/admin/announcements', label: 'Announcements', icon: Megaphone, roles: ['ADMIN'] },
  { to: '/admin/notifications', label: 'Notifications', icon: Bell, roles: ['ADMIN'] },
  { to: '/admin/export', label: 'Export Center', icon: Download, roles: ['ADMIN'] },
  { to: '/admin/settings', label: 'System Settings', icon: Settings2, roles: ['ADMIN'] },
  { to: '/registrar', label: 'Dashboard', icon: LayoutDashboard, end: true, roles: ['REGISTRAR'] },
  { to: '/teacher/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true, roles: ['TEACHER'] },
  { to: '/teacher/classes', label: 'Classes', icon: BookOpen, roles: ['TEACHER'] },
  { to: '/teacher/students', label: 'Students', icon: Users, roles: ['TEACHER'] },
  { to: '/teacher/attendance', label: 'Attendance', icon: ClipboardCheck, roles: ['TEACHER'] },
  { to: '/teacher/assessments', label: 'Assessments', icon: ClipboardList, roles: ['TEACHER'] },
  { to: '/teacher/course-mark-policy', label: 'Course mark policy', icon: SlidersHorizontal, roles: ['TEACHER'] },
  { to: '/teacher/course-marks', label: 'Course marks', icon: Calculator, roles: ['TEACHER'] },
  { to: '/teacher/materials', label: 'Materials', icon: FolderOpen, roles: ['TEACHER'] },
  { to: '/teacher/reports', label: 'Reports', icon: FileBarChart, roles: ['TEACHER'] },
  { to: '/accountant', label: 'Dashboard', icon: LayoutDashboard, end: true, roles: ['ACCOUNTANT'] },
];

const itemClass = ({ isActive }, collapsed) =>
  `focus-ring group relative flex items-center rounded-2xl text-sm font-medium transition ${
    collapsed ? 'h-11 w-11 justify-center self-center px-0' : 'gap-3 px-3.5 py-2.5'
  } ${
    isActive
      ? 'brand-gradient text-white shadow-lg shadow-brand-600/25'
      : 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm'
  }`;

const iconClass = ({ isActive }, collapsed) =>
  `${collapsed ? 'h-5 w-5' : 'h-4 w-4'} shrink-0 transition ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-brand-500'}`;

function NavItems({ role, onNavigate, collapsed }) {
  return navItems()
    .filter((item) => !item.roles || item.roles.includes(role))
    .map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        onClick={onNavigate}
        title={collapsed ? item.label : undefined}
        aria-label={collapsed ? item.label : undefined}
        className={(state) => itemClass(state, collapsed)}
      >
        {({ isActive }) => (
          <>
            <item.icon className={iconClass({ isActive }, collapsed)} />
            {collapsed ? null : <span className="truncate">{item.label}</span>}
          </>
        )}
      </NavLink>
    ));
}

// A fixed column on a wide screen, and the same content inside the drawer on a phone, so
// the two can never drift apart.
export default function Sidebar({ role, user, onNavigate, onClose, onSignOut, collapsed = false, onToggleCollapse }) {
  return (
    <div className={`flex h-full flex-col gap-6 overflow-y-auto py-5 thin-scroll ${collapsed ? 'px-2' : 'px-4'}`}>
      <div className={`flex items-center gap-2 ${collapsed ? 'flex-col' : 'justify-between'}`}>
        <Brand size="sm" subtitle={collapsed ? '' : formatEthiopian(new Date())} compact={collapsed} />

        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="focus-ring rounded-xl p-2 text-slate-500 transition hover:bg-white"
          >
            <X className="h-5 w-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
            className="focus-ring rounded-xl p-2 text-slate-500 transition hover:bg-white hover:text-slate-800"
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
        )}
      </div>

      <nav className="flex flex-col gap-1.5">
        {collapsed ? null : (
          <p className="px-3.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Menu</p>
        )}
        {role === 'REGISTRAR' ? (
          <RegistrarNav onNavigate={onNavigate} collapsed={collapsed} onExpand={onToggleCollapse} />
        ) : role === 'ACCOUNTANT' ? (
          <AccountantNav onNavigate={onNavigate} collapsed={collapsed} />
        ) : (
          <NavItems role={role} onNavigate={onNavigate} collapsed={collapsed} />
        )}
      </nav>

      <div className={`mt-auto rounded-3xl border border-white/70 bg-white/70 shadow-sm ${collapsed ? 'p-2' : 'p-3'}`}>
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
          <span
            className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
            title={collapsed ? user?.name || user?.email : undefined}
          >
            {(user?.name || user?.email || 'U')
              .split(/[\s@._-]+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0])
              .join('')
              .toUpperCase()}
          </span>
          {collapsed ? null : (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{user?.name || user?.email}</p>
                {user?.name ? <p className="truncate text-xs text-slate-500">{user?.email}</p> : null}
              </div>
              <RoleBadge role={user?.role} />
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onSignOut}
          title={collapsed ? 'Sign out' : undefined}
          aria-label={collapsed ? 'Sign out' : undefined}
          className={`focus-ring mt-3 flex items-center justify-center gap-2 rounded-2xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 ${
            collapsed ? 'h-10 w-full px-0' : 'w-full px-3 py-2.5'
          }`}
        >
          <LogOut className="h-4 w-4" />
          {collapsed ? null : 'Sign out'}
        </button>
      </div>
    </div>
  );
}
