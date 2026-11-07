import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  Receipt,
  BookOpen,
  UserCheck,
  AlertTriangle,
  Gift,
  Trophy,
  FileBarChart,
  Settings,
  Sparkles,
  BarChart3,
  Megaphone,
} from 'lucide-react';

const financeNavSections = [
  {
    title: 'Operations',
    items: [
      { to: '/accountant/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/accountant/cycles', label: 'Payment Cycles', icon: CalendarDays },
      { to: '/accountant/collections', label: 'Collections', icon: Receipt },
      { to: '/accountant/ledger', label: 'Payments Ledger', icon: BookOpen },
      { to: '/accountant/awards', label: 'Award Payments', icon: Trophy },
      { to: '/accountant/announcements', label: 'Announcements', icon: Megaphone },
    ],
  },
  {
    title: 'Compliance & Holds',
    items: [
      { to: '/accountant/overdue', label: 'Overdue & Holds', icon: AlertTriangle },
      { to: '/accountant/waivers', label: 'Waivers & Grants', icon: Gift },
    ],
  },
  {
    title: 'Analytics & Admin',
    items: [
      { to: '/accountant/analytics', label: 'Finance Analytics', icon: BarChart3 },
      { to: '/accountant/reports', label: 'Reports & 13-Months', icon: FileBarChart },
      { to: '/accountant/settings', label: 'Finance Settings', icon: Settings },
    ],
  },
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
  `${collapsed ? 'h-5 w-5' : 'h-4 w-4'} shrink-0 transition ${
    isActive ? 'text-white' : 'text-slate-400 group-hover:text-brand-500'
  }`;

export default function AccountantNav({ onNavigate, collapsed }) {
  return (
    <div className="flex flex-col gap-5">
      {financeNavSections.map((section) => (
        <div key={section.title} className="flex flex-col gap-1">
          {collapsed ? null : (
            <p className="px-3.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {section.title}
            </p>
          )}
          {section.items.map((item) => (
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
          ))}
        </div>
      ))}
    </div>
  );
}
