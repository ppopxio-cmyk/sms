import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  BarChart3,
  CircleAlert,
  CircleCheck,
  Clock3,
  Fingerprint,
  KeyRound,
  Laptop,
  LogIn,
  MonitorSmartphone,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../store/auth';
import { api } from '../lib/api';
import { formatEthiopian, formatEthiopianShort, timeAgo } from '../lib/ethiopianDate';
import { humanizeAction, number, roleLabel } from '../lib/format';
import { useNow } from '../lib/useNow';
import { useReducedMotion } from '../lib/useReducedMotion';
import Card, { CardBody, CardHeader } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import LiveStamp from '../components/ui/LiveStamp';
import StatCard from '../components/ui/StatCard';
import { Skeleton, SkeletonChart, SkeletonStats } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/StatePanel';

const COLORS = {
  indigo: '#4f46e5',
  violet: '#8b5cf6',
  sky: '#0ea5e9',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  slate: '#94a3b8',
};

const ROLE_COLORS = {
  ADMIN: COLORS.indigo,
  REGISTRAR: COLORS.emerald,
  TEACHER: COLORS.sky,
  ACCOUNTANT: COLORS.amber,
};

const BAR_COLORS = [COLORS.indigo, COLORS.sky, COLORS.emerald, COLORS.violet, COLORS.amber, COLORS.rose];

const MODULE_LABEL = {
  auth: 'Sign-ins & security',
  admin: 'Administration',
  user: 'My account',
  export: 'Exports',
  notification: 'Notices',
  system: 'System',
};

const DEVICE_LABEL = { desktop: 'Desktop', mobile: 'Phone', tablet: 'Tablet', unknown: 'Unknown' };
const DEVICE_COLORS = { desktop: COLORS.indigo, mobile: COLORS.sky, tablet: COLORS.emerald, unknown: COLORS.slate };

const CATEGORY_STYLE = {
  signin: { icon: LogIn, chip: 'bg-sky-50 text-sky-600 ring-sky-100', dot: 'bg-sky-500' },
  security: { icon: ShieldCheck, chip: 'bg-rose-50 text-rose-600 ring-rose-100', dot: 'bg-rose-500' },
  admin: { icon: KeyRound, chip: 'bg-violet-50 text-violet-600 ring-violet-100', dot: 'bg-violet-500' },
  account: { icon: UserRound, chip: 'bg-emerald-50 text-emerald-600 ring-emerald-100', dot: 'bg-emerald-500' },
  export: { icon: ScrollText, chip: 'bg-amber-50 text-amber-600 ring-amber-100', dot: 'bg-amber-500' },
  other: { icon: Activity, chip: 'bg-slate-100 text-slate-500 ring-slate-200', dot: 'bg-slate-400' },
};

function ActivityTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const date = new Date(`${label}T12:00:00+03:00`);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white/95 px-3.5 py-3 text-xs shadow-2xl backdrop-blur">
      <p className="font-semibold text-slate-700">{formatEthiopian(date)}</p>
      <div className="mt-2 space-y-1">
        {payload.map((item) => (
          <p key={item.dataKey} className="flex items-center justify-between gap-5 text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
            <span className="font-semibold text-slate-800">{number(item.value)}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

function SliceTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const slice = payload[0].payload;
  return (
    <div className="rounded-2xl border border-slate-100 bg-white/95 px-3.5 py-2.5 text-xs shadow-2xl backdrop-blur">
      <p className="font-semibold text-slate-800">{slice.name || slice.type}</p>
      <p className="mt-0.5 text-slate-500">
        {number(slice.total ?? slice.count)} {slice.total !== undefined ? 'accounts' : 'sessions'}
      </p>
    </div>
  );
}

function ChartEmpty({ message = 'No activity has been recorded yet.' }) {
  return (
    <div className="flex h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
        <BarChart3 className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-700">Nothing to chart yet</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">{message}</p>
    </div>
  );
}

function RangePicker({ days, onChange }) {
  return (
    <div className="flex rounded-xl bg-slate-100/90 p-1">
      {[7, 14, 30].map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          className={`focus-ring rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
            days === value ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {value} days
        </button>
      ))}
    </div>
  );
}

function Devices({ data = [] }) {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  if (!total) return <ChartEmpty message="No device is signed in at the moment." />;

  return (
    <div className="space-y-4 py-2">
      {data.map((item) => {
        const label = DEVICE_LABEL[item.type] ?? item.type;
        const color = DEVICE_COLORS[item.type] ?? COLORS.indigo;
        const width = Math.max(4, Math.round((item.count / total) * 100));
        const Icon = item.type === 'mobile' ? Smartphone : item.type === 'desktop' ? Laptop : MonitorSmartphone;
        return (
          <div key={item.type}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-2 font-medium text-slate-600">
                <Icon className="h-3.5 w-3.5" style={{ color }} />
                {label}
              </span>
              <span className="font-semibold text-slate-800">{number(item.count)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${width}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
      <p className="pt-1 text-[11px] text-slate-400">{number(total)} live devices across all signed-in accounts.</p>
    </div>
  );
}

function RecentActivity({ rows = [] }) {
  if (!rows.length) {
    return <EmptyState title="No activity yet" message="Sign-ins and account changes will appear here." icon={Activity} />;
  }

  return (
    <div className="space-y-1.5">
      {rows.map((row, index) => {
        const style = CATEGORY_STYLE[row.category] ?? CATEGORY_STYLE.other;
        const Icon = style.icon;
        return (
          <div
            key={row.id}
            className="animate-rise flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition hover:bg-slate-50/80"
            style={{ animationDelay: `${index * 40}ms` }}
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${style.chip}`}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{humanizeAction(row.action)}</p>
              <p className="truncate text-xs text-slate-500">
                {row.actor?.name || row.actor?.email || 'System'}
                {row.targetType ? ` · ${row.targetType}` : ''}
                {row.status === 'fail' ? ' · failed' : ''}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] text-slate-400">{timeAgo(row.createdAt)}</p>
              <span className={`mt-1 inline-block h-1.5 w-1.5 rounded-full ${row.status === 'fail' ? 'bg-rose-500' : style.dot}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const QUICK_ACTIONS = [
  {
    to: '/admin/users',
    label: 'Manage people',
    note: 'Create accounts and control access',
    icon: Users,
    chip: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
    glow: 'from-indigo-500/10',
  },
  {
    to: '/admin/sessions',
    label: 'Live sessions',
    note: 'See every device that is signed in',
    icon: Fingerprint,
    chip: 'bg-sky-50 text-sky-600 ring-sky-100',
    glow: 'from-sky-500/10',
  },
  {
    to: '/admin/audit-logs',
    label: 'Audit trail',
    note: 'Read every action, attempt and change',
    icon: ScrollText,
    chip: 'bg-violet-50 text-violet-600 ring-violet-100',
    glow: 'from-violet-500/10',
  },
];

export default function AdminDashboard() {
  const user = useAuth((state) => state.user);
  const [days, setDays] = useState(14);
  const reduceMotion = useReducedMotion();
  const now = useNow(1000);

  const overview = useQuery({
    queryKey: ['admin-overview', days],
    queryFn: async () => (await api.get('/admin/overview', { params: { days } })).data,
    refetchInterval: 30_000,
  });

  const data = overview.data;
  const staff = data?.staff;
  const sessions = data?.sessions;
  const signins = data?.signins;
  const activity = data?.activity;
  const firstName = user?.name?.split(' ')[0] || 'there';

  const roleData = (staff?.roles ?? [])
    .filter((row) => row.total > 0)
    .map((row) => ({
      ...row,
      name: roleLabel(row.role),
      color: ROLE_COLORS[row.role] ?? COLORS.indigo,
    }));

  const moduleData = (activity?.modules ?? []).slice(0, 6).map((row, index) => ({
    name: MODULE_LABEL[row.key] ?? row.key,
    count: row.count,
    color: BAR_COLORS[index % BAR_COLORS.length],
  }));

  const hasDaily = (activity?.daily ?? []).some((day) => day.total > 0);

  return (
    <div className="space-y-6">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Clock3 className="h-4 w-4 text-brand-500" />
              {formatEthiopian(now, { time: true })}
            </p>
            <LiveStamp updatedAt={overview.dataUpdatedAt} label="Live" />
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            Good to see you, <span className="text-brand-gradient">{firstName}</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            A live picture of the school’s accounts, sessions and security activity. Every number below is read from the database.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="success" className="hidden sm:inline-flex">
            <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-current" />
            Live data
          </Badge>
          <RangePicker days={days} onChange={setDays} />
          <Button variant="secondary" size="sm" onClick={() => overview.refetch()} loading={overview.isFetching}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </header>

      {overview.isError && !data ? (
        <Card className="p-2">
          <ErrorState message="The dashboard could not be loaded. Check the connection and try again." onRetry={() => overview.refetch()} />
        </Card>
      ) : overview.isLoading ? (
        <>
          <SkeletonStats />
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="p-6 lg:col-span-2">
              <Skeleton className="h-5 w-44" />
              <SkeletonChart height={240} compact />
            </Card>
            <Card className="p-6">
              <Skeleton className="h-5 w-32" />
              <div className="mt-8 flex justify-center">
                <Skeleton className="h-40 w-40 rounded-full" />
              </div>
            </Card>
          </div>
        </>
      ) : data ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Users}
              tone="indigo"
              label="Staff accounts"
              value={number(staff.total)}
              hint={`${number(staff.active)} active · ${number(staff.pending)} awaiting setup`}
              style={{ animationDelay: '0ms' }}
            />
            <StatCard
              icon={MonitorSmartphone}
              tone="sky"
              label="Online now"
              value={number(sessions.online)}
              hint={`${number(sessions.signedIn)} people signed in · ${number(sessions.active)} live sessions`}
              style={{ animationDelay: '60ms' }}
              badge={
                sessions.away ? (
                  <Badge tone="neutral">{number(sessions.away)} away</Badge>
                ) : (
                  <Badge tone="success">Everyone is active</Badge>
                )
              }
            />
            <StatCard
              icon={LogIn}
              tone="emerald"
              label={`Sign-ins · ${days} days`}
              value={signins.rate === null ? '—' : `${signins.rate}%`}
              hint={`${number(signins.success)} successful · ${number(signins.failed)} failed`}
              style={{ animationDelay: '120ms' }}
            />
            <StatCard
              icon={CircleAlert}
              tone="rose"
              label={`Failed actions · ${days} days`}
              value={number(activity.failed)}
              hint={`${number(staff.locked)} locked · ${number(sessions.terminated)} sessions ended`}
              style={{ animationDelay: '180ms' }}
            />
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <Card className="overflow-hidden lg:col-span-2">
              <CardHeader
                icon={Activity}
                title="Platform activity"
                subtitle={`Every action recorded in the last ${days} days.`}
                action={
                  <div className="hidden items-center gap-3 text-[11px] font-medium text-slate-500 sm:flex">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS.indigo }} />
                      Successful
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS.rose }} />
                      Failed
                    </span>
                  </div>
                }
              />
              <CardBody>
                {hasDaily ? (
                  <div className="h-[260px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={activity.daily} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="success-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={COLORS.indigo} stopOpacity={0.34} />
                            <stop offset="100%" stopColor={COLORS.indigo} stopOpacity={0.02} />
                          </linearGradient>
                          <linearGradient id="fail-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={COLORS.rose} stopOpacity={0.26} />
                            <stop offset="100%" stopColor={COLORS.rose} stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="4 7" vertical={false} stroke="#e2e8f0" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(value) => formatEthiopianShort(new Date(`${value}T12:00:00+03:00`))}
                          tick={{ fontSize: 11, fill: '#94a3b8' }}
                          axisLine={false}
                          tickLine={false}
                          minTickGap={24}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fontSize: 11, fill: '#94a3b8' }}
                          axisLine={false}
                          tickLine={false}
                          width={38}
                        />
                        <Tooltip content={<ActivityTooltip />} cursor={{ stroke: '#c7d2fe', strokeWidth: 1 }} />
                        <Area
                          type="monotone"
                          dataKey="success"
                          name="Successful"
                          stroke={COLORS.indigo}
                          strokeWidth={2.5}
                          fill="url(#success-fill)"
                          isAnimationActive={!reduceMotion}
                          animationDuration={900}
                        />
                        <Area
                          type="monotone"
                          dataKey="fail"
                          name="Failed"
                          stroke={COLORS.rose}
                          strokeWidth={2}
                          fill="url(#fail-fill)"
                          isAnimationActive={!reduceMotion}
                          animationDuration={1100}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <ChartEmpty />
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader icon={Users} title="Team mix" subtitle="Accounts by role." />
              <CardBody>
                {roleData.length ? (
                  <>
                    <div className="relative h-[196px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={roleData}
                            dataKey="total"
                            nameKey="name"
                            innerRadius={58}
                            outerRadius={82}
                            paddingAngle={4}
                            cornerRadius={7}
                            stroke="none"
                            isAnimationActive={!reduceMotion}
                            animationDuration={900}
                          >
                            {roleData.map((entry) => (
                              <Cell key={entry.role} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip content={<SliceTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <p className="text-2xl font-bold text-slate-900">{number(staff.total)}</p>
                        <p className="text-[11px] font-medium text-slate-400">staff accounts</p>
                      </div>
                    </div>
                    <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-2">
                      {roleData.map((entry) => (
                        <li key={entry.role} className="flex items-center gap-2 text-xs">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                          <span className="min-w-0 flex-1 truncate text-slate-500">{entry.name}</span>
                          <span className="font-semibold text-slate-700">{number(entry.total)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <ChartEmpty message="Accounts will appear here as the team is added." />
                )}
              </CardBody>
            </Card>
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <Card className="overflow-hidden lg:col-span-2">
              <CardHeader
                icon={BarChart3}
                title="Activity by area"
                subtitle="Where the last few weeks of changes happened."
                action={<Badge tone="brand">{number(activity.total)} events</Badge>}
              />
              <CardBody>
                {moduleData.length ? (
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={moduleData} layout="vertical" margin={{ top: 2, right: 16, left: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="4 7" horizontal={false} stroke="#e2e8f0" />
                        <XAxis type="number" hide allowDecimals={false} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={124}
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          cursor={{ fill: 'rgba(99, 102, 241, 0.06)' }}
                          contentStyle={{
                            borderRadius: 16,
                            border: '1px solid #f1f5f9',
                            boxShadow: '0 20px 45px -25px rgba(15,23,42,.45)',
                            fontSize: 12,
                          }}
                        />
                        <Bar
                          dataKey="count"
                          name="Actions"
                          radius={[0, 8, 8, 0]}
                          barSize={18}
                          isAnimationActive={!reduceMotion}
                          animationDuration={850}
                        >
                          {moduleData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <ChartEmpty message="No audited action has been recorded in this window." />
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader icon={Fingerprint} title="Signed-in devices" subtitle="Live sessions by type." />
              <CardBody>
                <Devices data={sessions.devices} />
              </CardBody>
            </Card>
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                icon={ShieldCheck}
                title="Recent activity"
                subtitle="The latest audited actions across the system."
                action={
                  <Link
                    to="/admin/audit"
                    className="focus-ring inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-brand-600 transition hover:bg-brand-50"
                  >
                    Open audit
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              <CardBody className="pt-3">
                <RecentActivity rows={activity.recent} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader icon={Sparkles} title="Quick actions" subtitle="The tools used most." />
              <CardBody className="space-y-2.5">
                {QUICK_ACTIONS.map((action) => (
                  <Link
                    key={action.to}
                    to={action.to}
                    className="hover-lift group flex items-center gap-3 rounded-2xl border border-slate-100 bg-white/70 p-3.5"
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${action.chip}`}>
                      <action.icon className="h-4.5 w-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-800">{action.label}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">{action.note}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
                  </Link>
                ))}
              </CardBody>
            </Card>
          </section>

          <p className="flex items-center justify-center gap-2 pt-1 text-center text-[11px] text-slate-400">
            <CircleCheck className="h-3.5 w-3.5 text-emerald-500" />
            All figures come from live accounts, sessions and audit records. Counts refresh every 30 seconds.
          </p>
        </>
      ) : null}
    </div>
  );
}
