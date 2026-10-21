import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CalendarRange,
  ClipboardCheck,
  FileBadge2,
  GraduationCap,
  Layers3,
  ScrollText,
  Users,
} from 'lucide-react';
import { api } from '../../lib/api';
import { REGISTRAR, displayDate, humanStatus, toneForStatus } from '../../lib/registrar';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import { ErrorState } from '../../components/ui/StatePanel';
import { SkeletonCard } from '../../components/ui/Skeleton';
import StatCard from '../../components/ui/StatCard';

const quickLinks = [
  { to: '/registrar/students', label: 'Student register', icon: Users, hint: 'Profiles, photos, enrolment' },
  { to: '/registrar/curriculum', label: 'Curriculum', icon: ScrollText, hint: 'Plan, version and publish' },
  { to: '/registrar/course-offerings', label: 'Offerings', icon: BookOpen, hint: 'Classes and teachers' },
  { to: '/registrar/results', label: 'Results review', icon: ClipboardCheck, hint: 'Approve and publish' },
  { to: '/registrar/graduation-eligibility', label: 'Graduation', icon: GraduationCap, hint: 'Evaluate eligibility' },
  { to: '/registrar/certificates', label: 'Certificates', icon: FileBadge2, hint: 'Issue and verify' },
];

export default function RegistrarDashboard() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['registrar', 'dashboard'],
    queryFn: async () => (await api.get(`${REGISTRAR}/dashboard`)).data,
  });

  const metrics = data?.metrics ?? {};
  const stats = [
    { label: 'Students', value: metrics.students ?? 0, hint: `${metrics.activeStudents ?? 0} active`, icon: Users, tone: 'indigo' },
    { label: 'Open offerings', value: metrics.openOfferings ?? 0, hint: `${metrics.activeRegistrations ?? 0} active registrations`, icon: BookOpen, tone: 'emerald' },
    { label: 'Results waiting', value: metrics.pendingResults ?? 0, hint: 'Submitted or under review', icon: ClipboardCheck, tone: 'amber' },
    { label: 'Eligible students', value: metrics.eligibleStudents ?? 0, hint: 'Latest evaluation', icon: GraduationCap, tone: 'sky' },
    { label: 'Certificates issued', value: metrics.issuedCertificates ?? 0, hint: 'Official records', icon: FileBadge2, tone: 'violet' },
    { label: 'Batches', value: metrics.batches ?? 0, hint: 'Planned and active', icon: Layers3, tone: 'rose' },
  ];

  if (error) {
    return (
      <div className="space-y-5">
        <RegistrarPageHeader title="Registrar dashboard" />
        <Card>
          <ErrorState message={error?.response?.data?.message || 'The Registrar dashboard could not be loaded.'} onRetry={refetch} />
        </Card>
      </div>
    );
  }

  const graduation = data?.charts?.graduation ?? {};
  const pipeline = [
    { key: 'eligible', label: 'Eligible', tone: 'success' },
    { key: 'certificate_issued', label: 'Certificate issued', tone: 'brand' },
    { key: 'pending_review', label: 'Pending review', tone: 'warning' },
    { key: 'in_progress', label: 'In progress', tone: 'neutral' },
    { key: 'not_eligible', label: 'Not eligible', tone: 'danger' },
  ];
  const maxProgramme = Math.max(1, ...(data?.charts?.byProgramme ?? []).map((row) => row.count));

  return (
    <div className="space-y-7">
      <RegistrarPageHeader
        eyebrow="Registrar office"
        title="Academic records at a glance"
        subtitle="Enrolment, curriculum, result review and official documents — all resolved from the records held by the college."
        actions={
          <Link
            to="/registrar/students"
            className="focus-ring brand-gradient inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:brightness-110"
          >
            Open student register <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} loading={isLoading} />
        ))}
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Current academic year"
            subtitle="The calendar drives registration windows and plan selection."
            icon={CalendarRange}
            action={
              <Link to="/registrar/academic-calendar" className="focus-ring rounded-lg text-xs font-semibold text-brand-700 hover:underline">
                Manage calendar
              </Link>
            }
          />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            {isLoading ? (
              <>
                <SkeletonCard lines={2} />
                <SkeletonCard lines={2} />
              </>
            ) : (
              <>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Academic year</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{data?.currentYear?.label || 'Not configured'}</p>
                  {data?.currentYear ? (
                    <p className="mt-1 text-xs text-slate-500">
                      {displayDate(data.currentYear.startDate)} – {displayDate(data.currentYear.endDate)}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-amber-700">Create the academic year before opening registration.</p>
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Registration window</p>
                  {data?.registrationWindow ? (
                    <>
                      <p className="mt-1 text-lg font-bold text-slate-900">{data.registrationWindow.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {data.registrationWindow.term ? `${data.registrationWindow.term} · ` : ''}
                        {displayDate(data.registrationWindow.startDate)} – {displayDate(data.registrationWindow.endDate)}
                      </p>
                      <Badge tone="success" className="mt-2">Open now</Badge>
                    </>
                  ) : (
                    <>
                      <p className="mt-1 text-lg font-bold text-slate-900">Closed</p>
                      <p className="mt-1 text-xs text-slate-500">No registration event covers today.</p>
                    </>
                  )}
                </div>
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Graduation pipeline" subtitle="Latest evaluation per student." icon={GraduationCap} />
          <CardBody className="space-y-3">
            {isLoading ? (
              <SkeletonCard lines={4} />
            ) : (
              pipeline.map((row) => (
                <div key={row.key} className="flex items-center justify-between gap-3">
                  <Badge tone={row.tone}>{row.label}</Badge>
                  <span className="text-sm font-bold tabular-nums text-slate-800">{graduation[row.key] ?? 0}</span>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Active students by programme" subtitle="A live view of the register." icon={Users} />
          <CardBody className="space-y-4">
            {isLoading ? (
              <SkeletonCard lines={4} />
            ) : !data?.charts?.byProgramme?.length ? (
              <p className="text-sm text-slate-500">No active students are recorded yet.</p>
            ) : (
              data.charts.byProgramme.map((row) => (
                <div key={row.id || row.name}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate font-medium text-slate-700">{row.name}</span>
                    <span className="font-semibold tabular-nums text-slate-500">{row.count}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="brand-gradient h-full rounded-full" style={{ width: `${Math.max(4, (row.count / maxProgramme) * 100)}%` }} />
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Recent Registrar activity"
            subtitle="Actions recorded in the audit trail."
            icon={ClipboardCheck}
            action={<Link to="/registrar/reports" className="text-xs font-semibold text-brand-700 hover:underline">Reports</Link>}
          />
          <CardBody className="space-y-3">
            {isLoading ? (
              <SkeletonCard lines={4} />
            ) : !data?.recentActivity?.length ? (
              <p className="text-sm text-slate-500">No Registrar action has been recorded yet.</p>
            ) : (
              data.recentActivity.map((row) => (
                <div key={row.id} className="flex items-start gap-3 border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{humanStatus(row.action?.split('.').pop())}</p>
                    <p className="text-xs text-slate-500">
                      {row.targetType || 'Record'} · {displayDate(row.at)}
                    </p>
                  </div>
                  <Badge tone={toneForStatus(row.status)}>{humanStatus(row.status || 'recorded')}</Badge>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Jump into the workspace</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="group glass flex items-center gap-3 rounded-2xl p-4 transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <item.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-800">{item.label}</span>
                <span className="block text-xs text-slate-500">{item.hint}</span>
              </span>
              <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
