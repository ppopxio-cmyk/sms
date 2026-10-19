import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Fingerprint,
  MailCheck,
  Megaphone,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../store/auth';
import { api } from '../lib/api';
import { formatEthiopian, timeAgo } from '../lib/ethiopianDate';
import Card, { CardBody, CardHeader } from '../components/ui/Card';
import Badge, { RoleBadge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';

const MODULES = [
  { label: 'Students', icon: Users, note: 'Admission, profiles, classes' },
  { label: 'Attendance', icon: ClipboardCheck, note: 'Daily and per period' },
  { label: 'Marks', icon: BookOpen, note: 'Assessments and report cards' },
  { label: 'Finance', icon: Wallet, note: 'Fees, payments, receipts' },
  { label: 'Analytics', icon: BarChart3, note: 'Trends and comparisons' },
  { label: 'Notices', icon: Megaphone, note: 'Announcements and alerts' },
];

function Stat({ icon: Icon, label, value, tone = 'brand', hint }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    success: 'bg-emerald-50 text-emerald-600',
    warning: 'bg-amber-50 text-amber-600',
    neutral: 'bg-slate-100 text-slate-500',
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1.5 text-lg font-bold text-slate-900">{value}</p>
          {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const user = useAuth((s) => s.user);

  const sessions = useQuery({
    queryKey: ['my-sessions'],
    queryFn: async () => (await api.get('/auth/sessions')).data,
  });

  const devices = sessions.data?.sessions ?? [];
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="space-y-7">
      <header className="animate-rise">
        <p className="text-sm font-medium text-slate-500">{formatEthiopian(new Date())}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
          Good to see you, <span className="text-brand-gradient">{firstName}</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          This is your home screen. Your account, your devices and everything coming to the system next.
        </p>
      </header>

      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Signed in as</p>
          <p className="mt-1.5 truncate text-lg font-bold text-slate-900">{user?.name}</p>
          <div className="mt-2">
            <RoleBadge role={user?.role} />
          </div>
        </Card>

        <Stat
          icon={MailCheck}
          label="Email"
          value={user?.emailVerified ? 'Confirmed' : 'Not confirmed'}
          tone={user?.emailVerified ? 'success' : 'warning'}
          hint={user?.email}
        />

        {sessions.isLoading ? (
          <Card className="p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-5 w-32" />
          </Card>
        ) : (
          <Stat
            icon={Fingerprint}
            label="Devices"
            value={devices.length}
            tone="brand"
            hint={devices.length === 1 ? '1 device signed in' : `${devices.length} devices signed in`}
          />
        )}

        <Stat
          icon={ShieldCheck}
          label="Two-step sign-in"
          value={user?.twoStepEnabled ? 'On' : 'Off'}
          tone={user?.twoStepEnabled ? 'success' : 'neutral'}
          hint={user?.twoStepEnabled ? 'A code is required' : 'Password only'}
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader
            icon={Fingerprint}
            title="Your devices"
            subtitle="Where your account is signed in right now."
            action={
              <Link to="/sessions" className="focus-ring inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-brand-600 transition hover:bg-brand-50">
                Manage
                <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
          <CardBody className="space-y-3">
            {sessions.isLoading ? (
              <>
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </>
            ) : devices.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">
                No active devices were found. Sign in again if this looks wrong.
              </p>
            ) : (
              devices.slice(0, 3).map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50/80 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {s.browser} on {s.os}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {s.ip} · {timeAgo(s.lastSeenAt)}
                    </p>
                  </div>
                  {s.current ? <Badge tone="success">This device</Badge> : <Badge tone="neutral">{s.deviceType}</Badge>}
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={CalendarDays} title="Ethiopian calendar" subtitle="Dates are stored once and shown in Ethiopian time." />
          <CardBody className="space-y-4">
            <div className="rounded-2xl bg-linear-to-br from-brand-50 to-sky-50 px-5 py-6 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Today</p>
              <p className="mt-1.5 text-2xl font-bold text-slate-900">{formatEthiopian(new Date())}</p>
              <p className="mt-1 text-xs text-slate-500">{formatEthiopian(new Date(), { time: true })}</p>
            </div>
            <p className="text-sm leading-relaxed text-slate-600">
              Every screen uses the Ethiopian month names, so reports read naturally for staff and parents.
            </p>
          </CardBody>
        </Card>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Coming next</h2>
          <Badge tone="brand">Planned</Badge>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <Card
              key={m.label}
              className="p-5 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-600/10"
            >
              <div className="flex items-center gap-3">
                <span className="glass-soft flex h-10 w-10 items-center justify-center rounded-xl text-brand-600">
                  <m.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{m.label}</p>
                  <p className="text-xs text-slate-500">{m.note}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
