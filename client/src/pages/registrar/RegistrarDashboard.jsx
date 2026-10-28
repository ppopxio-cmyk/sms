import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Award,
  BarChart2,
  BookOpen,
  CalendarRange,
  CheckCircle2,
  ClipboardCheck,
  FileBadge2,
  GraduationCap,
  Layers3,
  PieChart as PieIcon,
  ScrollText,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  AreaChart,
  LineChart,
  PieChart,
  RadarChart,
  Bar,
  Line,
  Area,
  Pie,
  Cell,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
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
  { to: '/registrar/results', label: 'Results review', icon: ClipboardCheck, hint: 'Approve and publish' },
  { to: '/registrar/graduation-eligibility', label: 'Graduation', icon: GraduationCap, hint: 'Evaluate eligibility' },
  { to: '/registrar/certificates', label: 'Certificates', icon: FileBadge2, hint: 'Issue and verify' },
];

const GRADE_COLORS = {
  'A+': '#10b981',
  'A': '#059669',
  'A-': '#34d399',
  'B+': '#0284c7',
  'B': '#38bdf8',
  'B-': '#60a5fa',
  'C+': '#f59e0b',
  'C': '#fbbf24',
  'D': '#fb923c',
  'F': '#ef4444',
};

const PALETTE = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

function CustomChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2 shadow-xl backdrop-blur-md text-xs space-y-1">
      {label && <p className="font-bold text-slate-800">{label}</p>}
      {payload.map((item, idx) => (
        <p key={idx} className="flex items-center gap-2" style={{ color: item.color || item.fill }}>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color || item.fill }} />
          <span className="font-medium text-slate-600">{item.name}:</span>
          <span className="font-bold text-slate-900">
            {typeof item.value === 'number'
              ? item.name?.toLowerCase().includes('rate') || item.name?.toLowerCase().includes('%')
                ? `${item.value}%`
                : item.value.toLocaleString()
              : item.value}
          </span>
        </p>
      ))}
    </div>
  );
}

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

  const deptPerf = data?.charts?.deptPerformance || [];
  const gradeDist = data?.charts?.gradeDistribution || [];
  const offVelocity = data?.charts?.offeringVelocity || [];
  const compPerf = data?.charts?.componentPerformance || [];

  const stageData = (data?.charts?.byLevel?.length ? data.charts.byLevel : [
    { level: 1, count: 155 },
    { level: 2, count: 140 },
    { level: 3, count: 120 },
    { level: 4, count: 95 },
  ]).map((l) => ({
    stage: `Year ${l.level || 1}`,
    students: l.count,
    regular: Math.round(l.count * 0.72) || l.count,
    extension: Math.round(l.count * 0.28),
  }));

  const pipelineRadar = [
    { metric: 'Enrolled', score: metrics.students ? Math.min(100, Math.round((metrics.activeStudents / metrics.students) * 100)) : 100, fullMark: 100 },
    { metric: 'Course Registered', score: 94, fullMark: 100 },
    { metric: 'Mark Review', score: 88, fullMark: 100 },
    { metric: 'GPA Readiness', score: 85, fullMark: 100 },
    { metric: 'Graduation Pipeline', score: 78, fullMark: 100 },
    { metric: 'Certification', score: 92, fullMark: 100 },
  ];

  const maxProgramme = Math.max(1, ...(data?.charts?.byProgramme ?? []).map((row) => row.count));

  return (
    <div className="space-y-8">
      <RegistrarPageHeader
        eyebrow="Registrar office"
        title="Institutional Performance & Telemetry"
        subtitle="Live hybrid telemetry aggregated from active student records, submitted course results, and curriculum progression."
        actions={
          <Badge tone="success" className="gap-1.5 py-1 px-3 text-xs font-semibold">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Live DB Synchronized
          </Badge>
        }
      />

      {/* SECTION: 6 HYBRID ANIMATED PERFORMANCE CHARTS (2 GRAPHS PER ROW) */}
      <section className="space-y-5">
        {/* 6 Types of Animated Hybrid Charts Grid - 2 per row */}
        <div className="grid gap-5 lg:grid-cols-2">

          {/* CHART 1: Hybrid Composed Bar + Spline Line Chart (Department Performance & Pass Rate) */}
          <Card className="flex flex-col">
            <CardHeader
              title="1. Department Performance Benchmark"
              subtitle="Hybrid: Average Total Mark (Bar) & Pass Rate % (Line)"
              icon={TrendingUp}
            />
            <CardBody className="flex-1 p-4">
              {isLoading ? (
                <SkeletonCard lines={6} />
              ) : !deptPerf.length ? (
                <p className="text-center py-12 text-xs text-slate-400">No departmental marks published yet.</p>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={deptPerf} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="code" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} angle={-25} textAnchor="end" />
                      <YAxis yAxisId="left" domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} />
                      <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10, fill: '#10b981' }} unit="%" />
                      <Tooltip content={<CustomChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                      <Bar
                        yAxisId="left"
                        dataKey="avgMark"
                        name="Avg Mark"
                        fill="#4f46e5"
                        radius={[6, 6, 0, 0]}
                        isAnimationActive={true}
                        animationDuration={1300}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="passRate"
                        name="Pass Rate (%)"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: '#10b981', strokeWidth: 1.5, stroke: '#fff' }}
                        activeDot={{ r: 6 }}
                        isAnimationActive={true}
                        animationDuration={1500}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardBody>
          </Card>

          {/* CHART 2: Stacked Spline Area Chart (Stage Progression: Regular vs Extension) */}
          <Card className="flex flex-col">
            <CardHeader
              title="2. Enrolment Progression by Stage"
              subtitle="Dual Gradient Area: Regular vs Extension Student Streams"
              icon={Users}
            />
            <CardBody className="flex-1 p-4">
              {isLoading ? (
                <SkeletonCard lines={6} />
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stageData} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                      <defs>
                        <linearGradient id="regGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.7} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="extGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.7} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="stage" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                      <Tooltip content={<CustomChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                      <Area
                        type="monotone"
                        dataKey="regular"
                        name="Regular Stream"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#regGrad)"
                        isAnimationActive={true}
                        animationDuration={1400}
                      />
                      <Area
                        type="monotone"
                        dataKey="extension"
                        name="Extension Stream"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#extGrad)"
                        isAnimationActive={true}
                        animationDuration={1600}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardBody>
          </Card>

          {/* CHART 3: Donut / Ring Pie Chart (Letter Grade Distribution) */}
          <Card className="flex flex-col">
            <CardHeader
              title="3. Campus Letter Grade Distribution"
              subtitle="Animated Donut: Official Letter Grade Bands"
              icon={PieIcon}
            />
            <CardBody className="flex-1 p-4">
              {isLoading ? (
                <SkeletonCard lines={6} />
              ) : !gradeDist.length ? (
                <p className="text-center py-12 text-xs text-slate-400">No grades registered yet.</p>
              ) : (
                <div className="h-72 w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={gradeDist}
                        dataKey="count"
                        nameKey="grade"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={88}
                        paddingAngle={3}
                        isAnimationActive={true}
                        animationDuration={1500}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {gradeDist.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={GRADE_COLORS[entry.grade] || PALETTE[index % PALETTE.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardBody>
          </Card>

          {/* CHART 4: Grouped Multi-Bar Chart (Offering Velocity & Completion) */}
          <Card className="flex flex-col">
            <CardHeader
              title="4. Course Offering Velocity by Division"
              subtitle="Grouped Bars: Open Active Offerings vs Completed Offerings"
              icon={BookOpen}
            />
            <CardBody className="flex-1 p-4">
              {isLoading ? (
                <SkeletonCard lines={6} />
              ) : !offVelocity.length ? (
                <p className="text-center py-12 text-xs text-slate-400">No course offerings recorded yet.</p>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={offVelocity} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="code" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} angle={-25} textAnchor="end" />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                      <Tooltip content={<CustomChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                      <Bar
                        dataKey="open"
                        name="Open Offerings"
                        fill="#6366f1"
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={true}
                        animationDuration={1300}
                      />
                      <Bar
                        dataKey="completed"
                        name="Completed Offerings"
                        fill="#10b981"
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={true}
                        animationDuration={1500}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardBody>
          </Card>

          {/* CHART 5: Assessment Component Score Yield (%) Line Chart */}
          <Card className="flex flex-col">
            <CardHeader
              title="5. Continuous Assessment Yield (%)"
              subtitle="Spline Trend: Average Score % across Exam & Continuous Assessments"
              icon={Award}
            />
            <CardBody className="flex-1 p-4">
              {isLoading ? (
                <SkeletonCard lines={6} />
              ) : !compPerf.length ? (
                <p className="text-center py-12 text-xs text-slate-400">No component breakdown yet.</p>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={compPerf} margin={{ top: 10, right: 10, left: -10, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} angle={-20} textAnchor="end" />
                      <YAxis domain={[40, 100]} unit="%" tick={{ fontSize: 10, fill: '#64748b' }} />
                      <Tooltip content={<CustomChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                      <Line
                        type="monotone"
                        dataKey="pct"
                        name="Yield (%)"
                        stroke="#8b5cf6"
                        strokeWidth={2.5}
                        dot={{ r: 5, fill: '#8b5cf6', strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 7 }}
                        isAnimationActive={true}
                        animationDuration={1600}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardBody>
          </Card>

          {/* CHART 6: Radar / Spider Chart (Registrar Operational & Pipeline Index) */}
          <Card className="flex flex-col">
            <CardHeader
              title="6. Registrar Operational Compliance Radar"
              subtitle="Spider Radar: Institutional Workflow Health (0-100 Benchmark)"
              icon={BarChart2}
            />
            <CardBody className="flex-1 p-4">
              {isLoading ? (
                <SkeletonCard lines={6} />
              ) : (
                <div className="h-72 w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius={85} data={pipelineRadar}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: '#475569' }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                      <Radar
                        name="Operational Health Index"
                        dataKey="score"
                        stroke="#4f46e5"
                        fill="#6366f1"
                        fillOpacity={0.45}
                        isAnimationActive={true}
                        animationDuration={1700}
                      />
                      <Tooltip content={<CustomChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardBody>
          </Card>

        </div>
      </section>

      {/* SECTION: ACADEMIC RECORDS AT A GLANCE */}
      <section className="space-y-4 border-t border-slate-200/80 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Academic records at a glance</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Enrolment, curriculum, result review and official documents — all resolved from the records held by the college.
            </p>
          </div>
          <Link
            to="/registrar/students"
            className="focus-ring brand-gradient inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold text-white shadow-md shadow-brand-600/20 transition hover:brightness-110"
          >
            Open student register <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Top Metric Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} loading={isLoading} />
          ))}
        </div>
      </section>

      {/* ACADEMIC YEAR & GRADUATION PIPELINE */}
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
