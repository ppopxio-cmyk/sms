import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CircleAlert,
  Clock3,
  Gauge,
  LockKeyhole,
  Megaphone,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Users,
  Zap,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../store/auth';
import { formatEthiopian, formatEthiopianShort } from '../lib/ethiopianDate';
import { number, percent, roleLabel } from '../lib/format';
import { useNow } from '../lib/useNow';
import { useReducedMotion } from '../lib/useReducedMotion';
import Card, { CardBody, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import ExportMenu from '../components/ui/ExportMenu';
import LiveStamp from '../components/ui/LiveStamp';
import { SkeletonChart, SkeletonRows, SkeletonStats } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/StatePanel';

const COLORS = {
  indigo: '#4f46e5',
  violet: '#8b5cf6',
  sky: '#0ea5e9',
  cyan: '#06b6d4',
  teal: '#2dd4bf',
  saffron: '#f4c95d',
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

const MODULE_LABEL = {
  auth: 'Sign-ins and security',
  admin: 'Administration',
  user: 'Account',
  export: 'Exports',
  notification: 'Notices',
  system: 'System',
  settings: 'Settings',
  announcements: 'Announcements',
  maintenance: 'Maintenance',
};

const STATUS_COLORS = {
  Active: COLORS.emerald,
  'Awaiting setup': COLORS.amber,
  Disabled: COLORS.slate,
};

function dayDate(value) {
  return new Date(`${value}T12:00:00+03:00`);
}

function ActivityTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-slate-100 bg-white/95 px-3.5 py-3 text-xs shadow-2xl backdrop-blur">
      <p className="font-semibold text-slate-700">{formatEthiopian(dayDate(label))}</p>
      <div className="mt-2 space-y-1">
        {payload.map((item) => (
          <p key={item.dataKey} className="flex items-center justify-between gap-6 text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
            <span className="font-semibold tabular-nums text-slate-800">{number(item.value)}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

function SliceTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-2xl border border-slate-100 bg-white/95 px-3.5 py-2.5 text-xs shadow-2xl backdrop-blur">
      <p className="font-semibold text-slate-800">{row.name}</p>
      <p className="mt-0.5 tabular-nums text-slate-500">{number(row.value)} accounts</p>
    </div>
  );
}

function ModuleTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-2xl border border-slate-100 bg-white/95 px-3.5 py-2.5 text-xs shadow-2xl backdrop-blur">
      <p className="font-semibold text-slate-800">{row.name}</p>
      <p className="mt-0.5 tabular-nums text-slate-500">{number(row.count)} recorded actions</p>
    </div>
  );
}

function RangePicker({ days, onChange }) {
  return (
    <div className="flex rounded-2xl bg-slate-100/90 p-1">
      {[7, 14, 30].map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          className={`focus-ring rounded-xl px-3 py-1.5 text-[11px] font-semibold transition ${
            days === value ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {value} days
        </button>
      ))}
    </div>
  );
}

function HealthGauge({ rate, animate }) {
  const data = [{ name: 'Successful sign-ins', value: rate ?? 0 }];
  return (
    <div className="relative flex h-[220px] items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={data}
          innerRadius="76%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
          barSize={15}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar
            dataKey="value"
            cornerRadius={20}
            background={{ fill: 'rgba(255,255,255,.08)' }}
            fill={COLORS.saffron}
            isAnimationActive={animate}
            animationDuration={1100}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-1">
        <span className="text-4xl font-black tabular-nums tracking-[-0.06em] text-white">
          {rate === null || rate === undefined ? '—' : `${rate}%`}
        </span>
        <span className="mt-1 text-[10px] font-semibold text-slate-400">sign-in success</span>
      </div>
    </div>
  );
}

function PulseLine({ daily = [], animate = true }) {
  if (!daily.length) {
    return <p className="py-5 text-center text-[10px] text-slate-500">Waiting for the first day of activity.</p>;
  }

  const width = 1000;
  const height = 58;
  const inset = 5;
  const values = daily.map((day) => Number(day.total) || 0);
  const maxValue = Math.max(0, ...values);
  const peak = Math.max(1, maxValue);
  const step = width / Math.max(1, values.length - 1);
  const points = values.map((value, index) => [
    index * step,
    height - inset - (value / peak) * (height - inset * 2),
  ]);
  const line = points.map(([x, y], index) => `${index ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  const last = points[points.length - 1];

  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="h-14 w-full overflow-visible"
          role="img"
          aria-label={`Daily recorded actions across ${daily.length} days`}
        >
          <defs>
            <linearGradient id="pulse-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={COLORS.teal} />
              <stop offset="58%" stopColor="#a7f3d0" />
              <stop offset="100%" stopColor={COLORS.saffron} />
            </linearGradient>
            <linearGradient id="pulse-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.teal} stopOpacity="0.2" />
              <stop offset="100%" stopColor={COLORS.teal} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#pulse-area)" />
          <path
            d={line}
            fill="none"
            stroke="url(#pulse-line)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            pathLength="1"
            className={animate ? 'animate-draw' : ''}
          />
        </svg>
        <span
          aria-hidden="true"
          className="absolute right-0 h-2 w-2 -translate-y-1/2 translate-x-1/2 rounded-full bg-amber-300 shadow-[0_0_0_4px_rgba(244,201,93,.14)]"
          style={{ top: `${(last[1] / height) * 100}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[9px] font-medium text-slate-500">
        <span>{formatEthiopianShort(dayDate(daily[0].date))}</span>
        <span>{daily.length} days, peak {number(maxValue)}</span>
        <span>{formatEthiopianShort(dayDate(daily[daily.length - 1].date))}</span>
      </div>
    </div>
  );
}

function RoleBars({ roles = [] }) {
  const total = roles.reduce((sum, role) => sum + role.total, 0);
  if (!total) {
    return <p className="py-10 text-center text-sm text-slate-500">No accounts have been created yet.</p>;
  }

  return (
    <div className="space-y-5 py-2">
      {roles
        .filter((role) => role.total > 0)
        .map((role) => {
          const width = Math.max(3, (role.total / total) * 100);
          return (
            <div key={role.role}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                <span className="flex items-center gap-2 font-semibold text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ROLE_COLORS[role.role] }} />
                  {roleLabel(role.role)}
                </span>
                <span className="tabular-nums text-slate-500">
                  {number(role.total)} <span className="text-slate-300">/</span> {number(role.active)} active
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100" style={{ width: `${width}%` }}>
                <div className="flex h-full w-full">
                  <span
                    className="h-full"
                    style={{ width: `${(role.active / role.total) * 100}%`, backgroundColor: ROLE_COLORS[role.role] }}
                  />
                  <span
                    className="h-full bg-amber-300"
                    style={{ width: `${(role.pending / role.total) * 100}%` }}
                  />
                  <span
                    className="h-full bg-slate-200"
                    style={{ width: `${(role.disabled / role.total) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Active</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-300" /> Awaiting setup</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-200" /> Disabled</span>
      </div>
    </div>
  );
}

function ActivityHeatmap({ daily = [] }) {
  const peak = Math.max(1, ...daily.map((day) => day.total));
  if (!daily.length) {
    return <p className="py-12 text-center text-sm text-slate-500">No activity in this window yet.</p>;
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {daily.map((day, index) => {
          const strength = day.total / peak;
          const background = day.total
            ? `rgba(79, 70, 229, ${0.12 + strength * 0.78})`
            : '#f1f5f9';
          return (
            <div
              key={day.date}
              title={`${formatEthiopian(dayDate(day.date))}: ${number(day.total)} actions`}
              className="group relative flex aspect-square items-end justify-center rounded-xl border border-white/70 p-1.5 transition hover:scale-[1.06] hover:ring-2 hover:ring-brand-300"
              style={{ backgroundColor: background, transitionDelay: `${index * 6}ms` }}
            >
              <span
                className={`text-[10px] font-bold tabular-nums ${
                  strength > 0.52 ? 'text-white' : day.total ? 'text-brand-800' : 'text-slate-300'
                }`}
              >
                {day.total ? day.total : '·'}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>Each square is one day. The number is recorded actions.</span>
        <span className="flex items-center gap-1.5">
          quiet
          {[0.12, 0.32, 0.52, 0.72, 0.92].map((opacity) => (
            <span
              key={opacity}
              className="h-3 w-3 rounded-[4px]"
              style={{ backgroundColor: `rgba(79, 70, 229, ${opacity})` }}
            />
          ))}
          busy
        </span>
      </div>
    </div>
  );
}

function Signals({ staff, sessions, activity }) {
  const pending = staff?.pending ?? 0;
  const locked = staff?.locked ?? 0;
  const failed = activity?.failed ?? 0;
  const away = sessions?.away ?? 0;
  const rows = [
    {
      icon: LockKeyhole,
      title: locked ? `${number(locked)} account${locked === 1 ? '' : 's'} locked` : 'No locked accounts',
      body: locked ? 'A temporary lock is protecting the account after repeated failures.' : 'Failed sign-ins have not locked anyone.',
      tone: locked ? 'amber' : 'emerald',
      to: '/admin/users',
    },
    {
      icon: UserRoundCheck,
      title: pending ? `${number(pending)} waiting for setup` : 'Every account is set up',
      body: pending ? 'These people need their first password before they can sign in.' : 'Nobody is stranded before their first sign-in.',
      tone: pending ? 'sky' : 'emerald',
      to: '/admin/users',
    },
    {
      icon: CircleAlert,
      title: failed ? `${number(failed)} failed actions` : 'No failed actions',
      body: failed ? 'Review the audit trail to see what was refused and why.' : 'Every recorded action in this window succeeded.',
      tone: failed ? 'rose' : 'emerald',
      to: '/admin/audit-logs',
    },
    {
      icon: Radio,
      title: away ? `${number(away)} session${away === 1 ? '' : 's'} away` : 'Everyone online is active',
      body: away ? 'These browsers are still signed in but quiet. They can be ended from Sessions.' : 'No idle signed-in browsers are waiting at the moment.',
      tone: away ? 'indigo' : 'emerald',
      to: '/admin/sessions',
    },
  ];
  const tones = {
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    sky: 'bg-sky-50 text-sky-600 ring-sky-100',
    rose: 'bg-rose-50 text-rose-600 ring-rose-100',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    indigo: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
  };

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Link
          key={row.title}
          to={row.to}
          className="focus-ring group flex items-start gap-3 rounded-2xl border border-slate-100 bg-white/55 p-3.5 transition hover:border-brand-100 hover:bg-white"
        >
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${tones[row.tone]}`}>
            <row.icon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-slate-800">{row.title}</span>
            <span className="mt-0.5 block text-[11px] leading-5 text-slate-500">{row.body}</span>
          </span>
          <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover:text-brand-500" />
        </Link>
      ))}
    </div>
  );
}

export default function AdminAnalytics() {
  const user = useAuth((state) => state.user);
  const [days, setDays] = useState(14);
  const reduceMotion = useReducedMotion();
  const now = useNow(30_000);

  const overview = useQuery({
    queryKey: ['admin-overview', days],
    queryFn: async () => (await api.get('/admin/overview', { params: { days } })).data,
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  });

  const announcements = useQuery({
    queryKey: ['analytics-announcements'],
    queryFn: async () =>
      (await api.get('/admin/announcements', { params: { status: 'published', page: 1, limit: 6 } })).data,
    refetchInterval: 60_000,
    placeholderData: (previous) => previous,
  });

  const data = overview.data;
  const waiting = overview.isLoading && !data;
  const failedFirstLoad = overview.isError && !data;
  const staff = data?.staff ?? {};
  const sessions = data?.sessions ?? {};
  const signins = data?.signins ?? {};
  const activity = data?.activity ?? {};
  const daily = activity.daily ?? [];
  const rate = signins.rate ?? null;
  const attempts = (signins.success ?? 0) + (signins.failed ?? 0);

  const accountMix = [
    { name: 'Active', value: staff.active ?? 0 },
    { name: 'Awaiting setup', value: staff.pending ?? 0 },
    { name: 'Disabled', value: staff.disabled ?? 0 },
  ].filter((row) => row.value > 0);

  const moduleData = (activity.modules ?? []).slice(0, 7).map((row) => ({
    name: MODULE_LABEL[row.key] ?? row.key,
    count: row.count,
  }));

  const publishedRows = announcements.data?.announcements ?? [];
  const publishedCount = announcements.data?.counts?.byStatus?.published ?? 0;
  const firstName = user?.name?.split(' ')[0] || 'there';

  const refresh = () => {
    overview.refetch();
    announcements.refetch();
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Analytics</h1>
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-bold text-brand-700 ring-1 ring-brand-100">
              Live
            </span>
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">
            How the college is moving, {firstName}: people, sessions, security and the reach of every announcement.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <LiveStamp updatedAt={overview.dataUpdatedAt} />
          <RangePicker days={days} onChange={setDays} />
          <Button variant="secondary" onClick={refresh} disabled={overview.isFetching}>
            <RefreshCw className={`h-4 w-4 ${overview.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <ExportMenu
            basePath="/admin/exports/analytics"
            params={{ days }}
            filenamePrefix="system-analytics"
            label="Export"
          />
        </div>
      </header>

      <section className="animate-rise relative overflow-hidden rounded-[2rem] bg-[#07101f] text-white shadow-2xl shadow-slate-900/15">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              'linear-gradient(rgba(148,163,184,.14) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.14) 1px, transparent 1px)',
            backgroundSize: '46px 46px',
            maskImage: 'radial-gradient(ellipse at 28% 12%, black 10%, transparent 72%)',
          }}
        />
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-cyan-400/15 blur-[90px]" />

        <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.35fr_.65fr] lg:p-10">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-semibold text-teal-200">
              <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-teal-300" />
              Live view for the last {days} days
            </p>
            <h2 className="mt-4 max-w-2xl text-3xl font-black leading-[1.02] tracking-[-0.045em] text-balance sm:text-[2.6rem]">
              A working college
              <span className="block font-light text-slate-400">leaves a pattern.</span>
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">
              Every sign-in, session, refusal and announcement leaves a mark. These charts read the whole picture, not
              four separate counters.
            </p>

            <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-4">
              {[
                { icon: Users, label: 'People', value: number(staff.total), hint: `${number(staff.new)} joined this window` },
                { icon: Radio, label: 'Online now', value: number(sessions.online), hint: `${number(sessions.signedIn)} people signed in` },
                { icon: Activity, label: 'Actions logged', value: number(activity.total), hint: `${number(activity.failed)} failed` },
                { icon: Sparkles, label: 'Verified', value: percent(staff.total ? (staff.verified / staff.total) * 100 : 0), hint: `${number(staff.locked)} locked out` },
              ].map((metric) => (
                <div key={metric.label} className="border-l border-white/10 pl-3.5">
                  <metric.icon className="h-4 w-4 text-teal-300" />
                  <p className="mt-2 text-2xl font-black tabular-nums tracking-[-0.04em] text-white">{metric.value}</p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-300">{metric.label}</p>
                  <p className="mt-0.5 text-[10px] leading-4 text-slate-500">{metric.hint}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.055] p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-white">Sign-in health</p>
                <p className="mt-0.5 text-[10px] text-slate-400">{number(attempts)} attempts in {days} days</p>
              </div>
              <Gauge className="h-4 w-4 text-amber-300" />
            </div>
            <HealthGauge rate={rate} animate={!reduceMotion} />
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/[0.07] bg-black/15 px-3 py-2">
                <p className="text-[10px] text-slate-400">Succeeded</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums text-teal-200">{number(signins.success)}</p>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-black/15 px-3 py-2">
                <p className="text-[10px] text-slate-400">Refused</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums text-rose-200">{number(signins.failed)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative border-t border-white/[0.07] px-6 py-4 sm:px-8 lg:px-10">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Activity className="h-3 w-3 text-teal-300" />
              Campus pulse, recorded actions
            </span>
            <span className="flex items-center gap-1.5">
              <Clock3 className="h-3 w-3" />
              {formatEthiopian(now, { time: true })}
            </span>
          </div>
          <div className="mt-1">
            <PulseLine daily={daily} animate={!reduceMotion} />
          </div>
          <p className="mt-1 text-[10px] text-slate-500">Updates every 30 seconds. The export follows the same window.</p>
        </div>
      </section>

      {failedFirstLoad ? (
        <Card>
          <ErrorState message={errorMessage(overview.error, 'We could not read the analytics.')} onRetry={() => overview.refetch()} />
        </Card>
      ) : waiting ? (
        <>
          <SkeletonStats count={4} />
          <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <Card><CardBody><SkeletonChart height={280} /></CardBody></Card>
            <Card><CardBody><SkeletonChart height={280} /></CardBody></Card>
          </div>
          <SkeletonRows rows={5} />
        </>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <Card>
              <CardHeader
                title="The rhythm of the window"
                subtitle="Successful and failed actions, with the total line showing the full load."
                icon={BarChart3}
                action={<span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">{days} days</span>}
              />
              <CardBody>
                <div className="h-[300px] w-full" role="img" aria-label="Daily successful and failed audit actions">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={daily} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
                      <defs>
                        <linearGradient id="success-bars" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={COLORS.indigo} />
                          <stop offset="100%" stopColor="#818cf8" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#e2e8f0" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatEthiopianShort}
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip content={<ActivityTooltip />} cursor={{ fill: 'rgba(99,102,241,.045)' }} />
                      <Bar dataKey="success" name="Succeeded" stackId="actions" fill="url(#success-bars)" isAnimationActive={!reduceMotion} />
                      <Bar dataKey="fail" name="Failed" stackId="actions" fill="#fda4af" radius={[5, 5, 0, 0]} isAnimationActive={!reduceMotion} />
                      <Line
                        type="monotone"
                        dataKey="total"
                        name="All actions"
                        stroke={COLORS.cyan}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                        isAnimationActive={!reduceMotion}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Who holds the keys"
                subtitle="Every account by its current state."
                icon={Users}
              />
              <CardBody>
                {accountMix.length ? (
                  <div className="relative h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={accountMix}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={68}
                          outerRadius={96}
                          paddingAngle={4}
                          cornerRadius={8}
                          isAnimationActive={!reduceMotion}
                        >
                          {accountMix.map((entry) => (
                            <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? COLORS.slate} stroke="none" />
                          ))}
                        </Pie>
                        <Tooltip content={<SliceTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-black tabular-nums tracking-[-0.05em] text-slate-900">{number(staff.total)}</span>
                      <span className="text-[10px] font-semibold text-slate-400">accounts</span>
                    </div>
                  </div>
                ) : (
                  <p className="py-16 text-center text-sm text-slate-500">No accounts yet.</p>
                )}
                <div className="space-y-2">
                  {accountMix.map((row) => (
                    <div key={row.name} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-slate-600">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[row.name] }} />
                        {row.name}
                      </span>
                      <span className="font-semibold tabular-nums text-slate-800">
                        {number(row.value)} <span className="font-normal text-slate-400">({percent((row.value / staff.total) * 100)})</span>
                      </span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader title="The shape of the staff" subtitle="Active, pending and disabled inside each role." icon={Users} />
              <CardBody>
                <RoleBars roles={staff.roles ?? []} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Where the work happens" subtitle="The busiest action groups in this window." icon={Zap} />
              <CardBody>
                {moduleData.length ? (
                  <div className="h-[260px]" role="img" aria-label="Audit actions by module">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={moduleData} layout="vertical" margin={{ top: 2, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 6" horizontal={false} stroke="#eef2f7" />
                        <XAxis type="number" hide />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={116}
                          tick={{ fill: '#64748b', fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<ModuleTooltip />} cursor={{ fill: 'rgba(14,165,233,.04)' }} />
                        <Bar dataKey="count" radius={[0, 7, 7, 0]} fill={COLORS.sky} isAnimationActive={!reduceMotion} barSize={13} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="py-14 text-center text-sm text-slate-500">No actions have been grouped yet.</p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="The reach of a notice"
                subtitle={`${number(publishedCount)} published announcement${publishedCount === 1 ? '' : 's'} in the register.`}
                icon={Megaphone}
                action={
                  <Link to="/admin/announcements" className="focus-ring rounded-lg text-[11px] font-semibold text-brand-600 hover:text-brand-700">
                    Open
                  </Link>
                }
              />
              <CardBody className="pt-4">
                {announcements.isLoading && !publishedRows.length ? (
                  <SkeletonRows rows={3} />
                ) : publishedRows.length ? (
                  <div className="space-y-4">
                    {publishedRows.map((row) => (
                      <div key={row.id}>
                        <div className="flex items-start justify-between gap-3">
                          <p className="line-clamp-1 text-xs font-semibold text-slate-700">{row.title}</p>
                          <span className="shrink-0 text-[10px] font-bold tabular-nums text-brand-700">{row.readRate ?? 0}%</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-sky-400"
                            style={{ width: `${Math.max(2, row.readRate ?? 0)}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[10px] text-slate-400">
                          {number(row.readCount)} read of {number(row.recipientCount)} · {formatEthiopian(row.publishedAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <Megaphone className="mx-auto h-6 w-6 text-slate-300" />
                    <p className="mt-2 text-xs font-semibold text-slate-600">No published announcements yet</p>
                    <Link to="/admin/announcements" className="mt-1 inline-block text-[11px] font-semibold text-brand-600">
                      Write the first notice
                    </Link>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.45fr_.55fr]">
            <Card>
              <CardHeader
                title="The activity field"
                subtitle="A day-by-day heatmap. Darker means more recorded actions."
                icon={Activity}
                action={<span className="text-[10px] font-semibold text-slate-400">peak {number(Math.max(0, ...daily.map((day) => day.total)))}</span>}
              />
              <CardBody>
                <ActivityHeatmap daily={daily} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Signals to watch" subtitle="What deserves a human look right now." icon={ShieldCheck} />
              <CardBody>
                <Signals staff={staff} sessions={sessions} activity={activity} />
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
