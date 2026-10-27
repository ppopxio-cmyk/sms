import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  CreditCard,
  FileBarChart,
  FileCheck2,
  FileText,
  Fingerprint,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  ScrollText,
  UserRound,
  Users,
  UserSquare2,
} from 'lucide-react';

const GROUPS = [
  {
    id: 'people',
    label: 'People',
    icon: Users,
    items: [
      { to: '/registrar/students', label: 'Students', icon: Users },
      { to: '/registrar/batches', label: 'Batches', icon: UserSquare2 },
      { to: '/registrar/graduated', label: 'Graduated', icon: GraduationCap },
    ],
  },
  {
    id: 'planning',
    label: 'Academic planning',
    icon: BookOpen,
    items: [
      { to: '/registrar/academic-structure', label: 'Academic structure', icon: BookOpen },
      { to: '/registrar/academic-calendar', label: 'Academic calendar', icon: CalendarDays },
      { to: '/registrar/curriculum', label: 'Curriculum', icon: ScrollText },
      { to: '/registrar/course-registration', label: 'Course registration', icon: ClipboardCheck },
    ],
  },
  {
    id: 'records',
    label: 'Records & documents',
    icon: FileText,
    items: [
      { to: '/registrar/results', label: 'Results', icon: FileCheck2 },
      { to: '/registrar/gpa-cgpa', label: 'GPA & CGPA', icon: CreditCard },
      { to: '/registrar/grading-policy', label: 'Grading policy', icon: FileBarChart },
      { to: '/registrar/transcripts', label: 'Transcripts', icon: FileText },
      { to: '/registrar/certificates', label: 'Certificates', icon: GraduationCap },
    ],
  },
  {
    id: 'communication',
    label: 'Communication',
    icon: Megaphone,
    items: [
      { to: '/registrar/announcements', label: 'Announcements', icon: Megaphone },
      { to: '/registrar/reports', label: 'Reports & exports', icon: FileBarChart },
    ],
  },
  {
    id: 'account',
    label: 'My account',
    icon: UserRound,
    items: [
      { to: '/registrar/my-account', label: 'My account', icon: UserRound },
      { to: '/registrar/my-devices', label: 'My devices', icon: Fingerprint },
    ],
  },
];

const childClass = ({ isActive }) =>
  `focus-ring group flex items-center gap-2.5 rounded-xl py-2 pl-9 pr-3 text-[13px] font-medium transition ${
    isActive
      ? 'bg-brand-50 text-brand-800 ring-1 ring-brand-100'
      : 'text-slate-600 hover:bg-white hover:text-slate-900'
  }`;

const childIcon = ({ isActive }) =>
  `h-3.5 w-3.5 shrink-0 ${isActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-brand-500'}`;

function matches(pathname, to) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

export default function RegistrarNav({ onNavigate, collapsed = false, onExpand }) {
  const { pathname } = useLocation();
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const root = useRef(null);
  const activeGroup = GROUPS.find((group) => group.items.some((item) => matches(pathname, item.to)));
  const activeId = activeGroup?.id;

  useEffect(() => {
    if (!activeId) return;
    setOpenGroups((current) => {
      if (current.has(activeId)) return current;
      const next = new Set(current);
      next.add(activeId);
      return next;
    });
  }, [pathname, activeId]);

  useEffect(() => {
    const keepActive = () => {
      if (!activeId) return new Set();
      return new Set([activeId]);
    };
    const onPointerDown = (event) => {
      if (!root.current?.contains(event.target)) setOpenGroups(keepActive());
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpenGroups(keepActive());
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [activeId]);

  const toggle = (id) => {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        if (id === activeId) return current;
        next.delete(id);
      } else next.add(id);
      return next;
    });
  };

  if (collapsed) {
    const railClass = 'focus-ring group flex h-11 w-11 items-center justify-center rounded-2xl transition';
    return (
      <div className="flex flex-col items-center gap-1.5">
        <NavLink
          to="/registrar/dashboard"
          end
          onClick={onNavigate}
          title="Dashboard"
          className={({ isActive }) =>
            `${railClass} ${isActive ? 'brand-gradient text-white shadow-lg shadow-brand-600/25' : 'text-slate-500 hover:bg-white hover:text-brand-700'}`
          }
        >
          <LayoutDashboard className="h-5 w-5" />
        </NavLink>
        <NavLink
          to="/registrar/analytics"
          onClick={onNavigate}
          title="Analytics"
          className={({ isActive }) =>
            `${railClass} ${isActive ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-100' : 'text-slate-500 hover:bg-white hover:text-brand-700'}`
          }
        >
          <BarChart3 className="h-5 w-5" />
        </NavLink>
        {GROUPS.map((group) => (
          <button
            key={group.id}
            type="button"
            title={group.label}
            aria-label={group.label}
            onClick={() => {
              onExpand?.();
              setOpenGroups((current) => new Set(current).add(group.id));
            }}
            className={`${railClass} ${
              group.id === activeId
                ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-100'
                : 'text-slate-500 hover:bg-white hover:text-brand-700'
            }`}
          >
            <group.icon className="h-5 w-5" />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={root} className="space-y-1.5" data-registrar-nav>
      <NavLink
        to="/registrar/dashboard"
        end
        onClick={onNavigate}
        className={({ isActive }) =>
          `focus-ring group flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition ${
            isActive
              ? 'brand-gradient text-white shadow-lg shadow-brand-600/25'
              : 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <LayoutDashboard className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-brand-500'}`} />
            Dashboard
          </>
        )}
      </NavLink>

      <NavLink
        to="/registrar/analytics"
        onClick={onNavigate}
        className={({ isActive }) =>
          `focus-ring group flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition ${
            isActive
              ? 'bg-brand-50 text-brand-800 ring-1 ring-brand-100'
              : 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <BarChart3 className={`h-4 w-4 shrink-0 ${isActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-brand-500'}`} />
            Analytics
          </>
        )}
      </NavLink>

      {GROUPS.map((group) => {
        const expanded = openGroups.has(group.id);
        const active = group.items.some((item) => matches(pathname, item.to));
        return (
          <div key={group.id} className="rounded-2xl">
            <button
              type="button"
              onClick={() => toggle(group.id)}
              aria-expanded={expanded}
              aria-controls={`registrar-group-${group.id}`}
              className={`focus-ring flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-sm font-semibold transition ${
                active && !expanded
                  ? 'bg-brand-50/70 text-brand-800'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900'
              }`}
            >
              <group.icon className={`h-4 w-4 shrink-0 ${active ? 'text-brand-600' : 'text-slate-400'}`} />
              <span className="min-w-0 flex-1 truncate">{group.label}</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>

            {expanded ? (
              <div id={`registrar-group-${group.id}`} className="mt-1 space-y-0.5">
                {group.items.map((item) => (
                  <NavLink key={item.to} to={item.to} onClick={onNavigate} className={childClass}>
                    {({ isActive }) => (
                      <>
                        <item.icon className={childIcon({ isActive })} />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {isActive ? <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-label="Current page" /> : null}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
