import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  File,
  FileSpreadsheet,
  FileText,
  Fingerprint,
  LockKeyhole,
  Megaphone,
  MonitorSmartphone,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';
import { number } from '../lib/format';
import Card, { CardHeader } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import ExportMenu from '../components/ui/ExportMenu';
import FilterTabs from '../components/ui/FilterTabs';
import LiveStamp from '../components/ui/LiveStamp';
import { Skeleton } from '../components/ui/Skeleton';

const REPORT_TABS = [
  { key: 'users', label: 'Users', icon: Users },
  { key: 'sessions', label: 'Sessions', icon: MonitorSmartphone },
  { key: 'audit', label: 'Audit Logs', icon: ScrollText },
  { key: 'security', label: 'Security Events', icon: ShieldAlert },
  { key: 'analytics', label: 'System Analytics', icon: BarChart3 },
  { key: 'announcements', label: 'Announcements', icon: Megaphone },
];

const REPORT_META = {
  users: {
    title: 'User account register',
    description: 'Names, roles, account state, verification, two-step status and last sign-in. Passwords and tokens are never included.',
    icon: Users,
    accent: 'from-indigo-500 to-violet-500',
    basePath: '/admin/users/export',
    filenamePrefix: 'accounts',
  },
  sessions: {
    title: 'Session and device history',
    description: 'Live and ended sessions, device labels, approximate place, last activity and how each session ended.',
    icon: MonitorSmartphone,
    accent: 'from-sky-500 to-cyan-500',
    basePath: '/admin/sessions/export',
    filenamePrefix: 'sessions',
  },
  audit: {
    title: 'Audit log extract',
    description: 'Who did what, from where and with what outcome. Choose a category and window to make a focused record.',
    icon: ScrollText,
    accent: 'from-slate-600 to-slate-800',
    basePath: '/admin/audit-logs/export',
    filenamePrefix: 'audit-log',
  },
  security: {
    title: 'Security event report',
    description: 'The security subset of the audit trail: password changes, two-step changes, new devices and sign-in failures.',
    icon: ShieldAlert,
    accent: 'from-rose-500 to-orange-500',
    basePath: '/admin/audit-logs/export',
    filenamePrefix: 'security-events',
  },
  analytics: {
    title: 'System analytics summary',
    description: 'A rolling cross-section of accounts, roles, live sessions, sign-in health, audit activity and announcement reach.',
    icon: BarChart3,
    accent: 'from-emerald-500 to-teal-500',
    basePath: '/admin/exports/analytics',
    filenamePrefix: 'system-analytics',
  },
  announcements: {
    title: 'Announcement delivery register',
    description: 'Every notice with its audience, status, recipient count, read receipts and email delivery outcome.',
    icon: Megaphone,
    accent: 'from-fuchsia-500 to-pink-500',
    basePath: '/admin/announcements/export',
    filenamePrefix: 'announcements',
  },
};

const STATUS_OPTIONS = {
  users: [
    ['', 'All account states'],
    ['active', 'Active'],
    ['pending', 'Awaiting setup'],
    ['disabled', 'Turned off'],
  ],
  sessions: [
    ['all', 'All sessions'],
    ['active', 'Active'],
    ['online', 'Online now'],
    ['away', 'Away'],
    ['expired', 'Expired'],
    ['terminated', 'Terminated'],
  ],
  audit: [
    ['all', 'Any outcome'],
    ['success', 'Succeeded'],
    ['fail', 'Failed'],
  ],
  security: [
    ['all', 'Any outcome'],
    ['success', 'Succeeded'],
    ['fail', 'Failed'],
  ],
};

function Select({ label, value, onChange, children }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white/90 px-3 text-sm font-medium text-slate-700"
      >
        {children}
      </select>
    </label>
  );
}

const initialFilters = {
  users: { role: '', status: '' },
  sessions: { role: '', status: 'all' },
  audit: { category: 'all', status: 'all', range: '30' },
  security: { status: 'all', range: '30' },
  analytics: { days: '30' },
  announcements: { status: 'all', type: 'all', priority: 'all' },
};

const clean = (value) => Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== '' && entry !== undefined));

export default function AdminExportCenter() {
  const [tab, setTab] = useState('users');
  const [filters, setFilters] = useState(initialFilters);

  const setFilter = (report, key, value) =>
    setFilters((current) => ({ ...current, [report]: { ...current[report], [key]: value } }));

  const params = useMemo(() => {
    if (tab === 'security') return { category: 'security', status: filters.security.status, range: filters.security.range };
    if (tab === 'analytics') return { days: filters.analytics.days };
    return clean(filters[tab]);
  }, [tab, filters]);

  const exportParams = useMemo(() => {
    if (tab === 'security') return { category: 'security', status: filters.security.status, range: filters.security.range };
    if (tab === 'analytics') return { days: filters.analytics.days };
    return clean(filters[tab]);
  }, [tab, filters]);

  const preview = useQuery({
    queryKey: ['export-preview', tab, params],
    queryFn: async () => {
      if (tab === 'users') {
        return (await api.get('/admin/users', { params: { ...params, page: 1, limit: 1 } })).data;
      }
      if (tab === 'sessions') {
        return (await api.get('/admin/sessions', { params: { ...params, page: 1, limit: 1 } })).data;
      }
      if (tab === 'audit' || tab === 'security') {
        return (await api.get('/admin/audit-logs', { params: { ...params, page: 1, limit: 1 } })).data;
      }
      if (tab === 'announcements') {
        return (await api.get('/admin/announcements', { params: { ...params, page: 1, limit: 1 } })).data;
      }
      return (await api.get('/admin/overview', { params })).data;
    },
    refetchInterval: 60_000,
    placeholderData: (previous) => previous,
  });

  const meta = REPORT_META[tab];
  const Icon = meta.icon;
  const count =
    tab === 'analytics'
      ? preview.data?.staff?.total
      : tab === 'announcements'
        ? preview.data?.counts?.all
        : preview.data?.total;

  const countLabel =
    tab === 'users'
      ? 'accounts'
      : tab === 'sessions'
        ? 'sessions'
        : tab === 'audit'
          ? 'audit events'
          : tab === 'security'
            ? 'security events'
            : tab === 'analytics'
              ? 'active accounts in view'
              : 'notices in view';

  return (
    <div className="space-y-6">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">Take it with you</span>
            <LiveStamp updatedAt={preview.dataUpdatedAt || preview.data?.generatedAt} label="Reports live" />
          </div>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-slate-900">Export Center</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Build a real report in Excel, Word or PDF. Each download follows the filters you see, is scoped to your admin role, and is recorded in the audit log.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="success"><ShieldCheck className="h-3.5 w-3.5" /> Role-scoped</Badge>
          <Badge tone="brand"><LockKeyhole className="h-3.5 w-3.5" /> No secrets</Badge>
          <Badge tone="warning">5,000 row cap</Badge>
        </div>
      </header>

      <FilterTabs tabs={REPORT_TABS} value={tab} onChange={setTab} label="Export reports" className="animate-rise" />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: FileSpreadsheet, title: 'Excel workbook', text: 'Clean columns for filtering and reuse.', tone: 'bg-emerald-50 text-emerald-600' },
          { icon: FileText, title: 'Word document', text: 'An editable report for signatures or print.', tone: 'bg-sky-50 text-sky-600' },
          { icon: File, title: 'PDF document', text: 'A fixed copy with Ethiopic typefaces.', tone: 'bg-rose-50 text-rose-600' },
        ].map((format) => (
          <div key={format.title} className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/70 px-4 py-3 shadow-sm">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${format.tone}`}>
              <format.icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-800">{format.title}</p>
              <p className="text-[11px] text-slate-500">{format.text}</p>
            </div>
          </div>
        ))}
      </div>

      <Card className="overflow-visible">
        <div className="grid lg:grid-cols-[1.25fr_0.75fr]">
          <div className="p-6 sm:p-7">
            <div className="flex items-start gap-4">
              <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br ${meta.accent} text-white shadow-lg`}>
                <Icon className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">{meta.title}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">{meta.description}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {tab === 'users' ? (
                <>
                  <Select label="Role" value={filters.users.role} onChange={(value) => setFilter('users', 'role', value)}>
                    <option value="">All roles</option>
                    <option value="ADMIN">Administrator</option>
                    <option value="REGISTRAR">Registrar</option>
                    <option value="TEACHER">Teacher</option>
                    <option value="ACCOUNTANT">Accountant</option>
                  </Select>
                  <Select label="Account state" value={filters.users.status} onChange={(value) => setFilter('users', 'status', value)}>
                    {STATUS_OPTIONS.users.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                </>
              ) : null}

              {tab === 'sessions' ? (
                <>
                  <Select label="Role" value={filters.sessions.role} onChange={(value) => setFilter('sessions', 'role', value)}>
                    <option value="">All roles</option>
                    <option value="ADMIN">Administrator</option>
                    <option value="REGISTRAR">Registrar</option>
                    <option value="TEACHER">Teacher</option>
                    <option value="ACCOUNTANT">Accountant</option>
                  </Select>
                  <Select label="Session state" value={filters.sessions.status} onChange={(value) => setFilter('sessions', 'status', value)}>
                    {STATUS_OPTIONS.sessions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                </>
              ) : null}

              {tab === 'audit' ? (
                <>
                  <Select label="Category" value={filters.audit.category} onChange={(value) => setFilter('audit', 'category', value)}>
                    <option value="all">All categories</option>
                    <option value="signin">Sign-in</option>
                    <option value="security">Security</option>
                    <option value="admin">Administration</option>
                    <option value="settings">Settings</option>
                    <option value="announcements">Announcements</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="account">Account</option>
                    <option value="export">Exports</option>
                    <option value="other">Other</option>
                  </Select>
                  <div className="grid grid-cols-2 gap-4">
                    <Select label="Outcome" value={filters.audit.status} onChange={(value) => setFilter('audit', 'status', value)}>
                      {STATUS_OPTIONS.audit.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </Select>
                    <Select label="Window" value={filters.audit.range} onChange={(value) => setFilter('audit', 'range', value)}>
                      <option value="1">Today</option>
                      <option value="7">7 days</option>
                      <option value="30">30 days</option>
                      <option value="all">All time</option>
                    </Select>
                  </div>
                </>
              ) : null}

              {tab === 'security' ? (
                <>
                  <Select label="Outcome" value={filters.security.status} onChange={(value) => setFilter('security', 'status', value)}>
                    {STATUS_OPTIONS.security.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                  <Select label="Window" value={filters.security.range} onChange={(value) => setFilter('security', 'range', value)}>
                    <option value="1">Today</option>
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                    <option value="all">All time</option>
                  </Select>
                </>
              ) : null}

              {tab === 'analytics' ? (
                <div className="sm:col-span-2">
                  <Select label="Rolling window" value={filters.analytics.days} onChange={(value) => setFilter('analytics', 'days', value)}>
                    <option value="7">Last 7 days</option>
                    <option value="14">Last 14 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                  </Select>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    The same window is used for user growth, sign-ins, audit activity and the dashboard. The report also includes account and announcement totals that are not date-bound.
                  </p>
                </div>
              ) : null}

              {tab === 'announcements' ? (
                <>
                  <Select label="Status" value={filters.announcements.status} onChange={(value) => setFilter('announcements', 'status', value)}>
                    <option value="all">All statuses</option>
                    <option value="draft">Drafts</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="published">Published</option>
                    <option value="expired">Expired</option>
                    <option value="archived">Archived</option>
                  </Select>
                  <div className="grid grid-cols-2 gap-4">
                    <Select label="Type" value={filters.announcements.type} onChange={(value) => setFilter('announcements', 'type', value)}>
                      <option value="all">All types</option>
                      <option value="general">General</option>
                      <option value="academic">Academic</option>
                      <option value="exam">Exam</option>
                      <option value="event">Event</option>
                      <option value="administrative">Administrative</option>
                      <option value="emergency">Emergency</option>
                      <option value="holiday">Holiday</option>
                      <option value="finance">Finance</option>
                    </Select>
                    <Select label="Priority" value={filters.announcements.priority} onChange={(value) => setFilter('announcements', 'priority', value)}>
                      <option value="all">All priorities</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </Select>
                  </div>
                </>
              ) : null}
            </div>

            <div className="mt-6 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
              {[
                'Amharic month names and Ethiopian dates in the report',
                'Only fields this report needs are selected',
                'Formula-leading values are neutralised before writing',
                'Each download writes an audit entry with the filter set',
              ].map((line) => (
                <p key={line} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                  {line}
                </p>
              ))}
            </div>
          </div>

          <aside className="flex flex-col justify-between gap-5 border-t border-slate-100 bg-linear-to-br from-slate-50/90 to-white p-6 lg:border-l lg:border-t-0 sm:p-7">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">This report will contain</p>
              {preview.isLoading ? (
                <Skeleton className="mt-2 h-10 w-32" />
              ) : (
                <p className="mt-1.5 text-4xl font-bold tracking-tight text-slate-900">
                  {count === undefined ? 'Live' : number(count)}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">{countLabel}</p>
              {preview.isError ? <p className="mt-2 text-xs font-medium text-rose-600">The live count could not be loaded, but the export still uses the current filters.</p> : null}
            </div>

            <div className="space-y-3">
              <ExportMenu
                basePath={meta.basePath}
                filenamePrefix={meta.filenamePrefix}
                params={exportParams}
                label="Download report"
                className="w-full [&>span]:w-full [&_button]:w-full"
              />
              <p className="text-[11px] leading-relaxed text-slate-400">
                Choose Excel, Word or PDF from the menu. The download uses the filters on this screen and is capped at 5,000 rows.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white/80 p-3.5">
              <p className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <Fingerprint className="h-3.5 w-3.5 text-brand-500" /> Audited download
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                The audit entry records who exported, which report, the filters, and whether the 5,000-row cap truncated it.
              </p>
            </div>
          </aside>
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={ShieldCheck}
          title="What every export protects"
          subtitle="One shared pipeline, so a new report cannot quietly skip these rules."
        />
        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Server-side scope', 'The API checks the admin role on every request. A browser cannot ask for another role\'s data.'],
            ['No credentials', 'Passwords, tokens, refresh hashes and mail credentials are never selected.'],
            ['Formula safe', 'Cells beginning with =, +, - or @ are neutralised before Excel sees them.'],
            ['Ethiopian dates', 'Formatted as a real Ethiopian date, with Amharic month names where the report supports them.'],
          ].map(([title, text]) => (
            <div key={title} className="rounded-2xl border border-slate-100 bg-white/60 p-4">
              <p className="text-sm font-semibold text-slate-800">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{text}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
