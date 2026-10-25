import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend,
} from 'recharts';
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  GraduationCap,
  TrendingUp,
  Users,
} from 'lucide-react';
import { api } from '../../lib/api';
import { classMeta, classTitle, displayDate, periodLabel, statusLabel, statusTone } from '../../lib/teacher';
import { formatEthiopian } from '../../lib/ethiopianDate';
import TeacherPageHeader from '../../components/teacher/TeacherPageHeader';
import Badge from '../../components/ui/Badge';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import { EmptyState, ErrorState } from '../../components/ui/StatePanel';
import { SkeletonPage } from '../../components/ui/Skeleton';
import StatCard from '../../components/ui/StatCard';

export default function TeacherDashboard() {
  const query = useQuery({
    queryKey: ['teacher', 'dashboard'],
    queryFn: async () => (await api.get('/teacher/dashboard')).data,
  });

  if (query.isLoading) {
    return <SkeletonPage cards={4} />;
  }

  if (query.isError) {
    return (
      <>
        <TeacherPageHeader eyebrow="Teacher workspace" title="Dashboard" />
        <Card className="mt-6">
          <ErrorState message="We could not load your workspace." onRetry={query.refetch} />
        </Card>
      </>
    );
  }

  const data = query.data;
  const summary = data.summary ?? {};
  const courses = data.courses ?? [];

  const performanceData = useMemo(() => {
    return courses.map((course) => {
      const code = course.courseCode || course.course?.code || course.courseTitle || 'Class';
      const students = course.studentCount ?? 0;
      const assessments =
        course.assessmentCount ??
        Object.values(course.assessments || {}).reduce((sum, value) => sum + value, 0);
      return {
        name: code.length > 12 ? `${code.slice(0, 10)}…` : code,
        fullName: classTitle(course),
        students,
        assessments,
      };
    });
  }, [courses]);

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        eyebrow="Teacher workspace"
        title="Today at a glance"
        subtitle={`${formatEthiopian(new Date(), { time: true })} · Everything here comes from the classes the registrar assigned to you.`}
        actions={
          <Link
            to="/teacher/classes"
            className="focus-ring inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white/85 px-4 text-sm font-semibold text-slate-700 transition hover:bg-white"
          >
            <BookOpen className="h-4 w-4" />
            My classes
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={BookOpen} label="Active classes" value={summary.classes ?? 0} hint="Assigned to you" tone="indigo" />
        <StatCard icon={Users} label="Students" value={summary.students ?? 0} hint="Registered across your classes" tone="emerald" />
        <StatCard
          icon={ClipboardCheck}
          label="Attendance drafts"
          value={summary.attendanceDrafts ?? 0}
          hint="Waiting to be finalized"
          tone="amber"
        />
        <StatCard
          icon={ClipboardList}
          label="Marks to submit"
          value={summary.gradesAwaitingSubmission ?? 0}
          hint={`${summary.drafts ?? 0} draft assessment${summary.drafts === 1 ? '' : 's'}`}
          tone="violet"
        />
      </div>

      {courses.length > 0 ? (
        <Card>
          <CardHeader
            title="Class performance & enrollment"
            subtitle="Live breakdown of enrolled students and active assessments across your assigned classes."
            icon={TrendingUp}
          />
          <CardBody>
            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={performanceData} margin={{ top: 10, right: 20, bottom: 20, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <ChartTooltip
                    contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  />
                  <Legend wrapperStyle={{ paddingTop: '8px', fontSize: '12px' }} />
                  <Bar yAxisId="left" dataKey="students" name="Enrolled students" fill="#4f46e5" radius={[6, 6, 0, 0]} animationDuration={1200} />
                  <Line yAxisId="right" type="monotone" dataKey="assessments" name="Assessments" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }} animationDuration={1500} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {!courses.length ? (
        <Card>
          <EmptyState
            icon={GraduationCap}
            title="No active classes"
            message="You have no classes open for teaching right now. Completed classes remain available under My classes."
          />
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
          <Card>
            <CardHeader title="My classes" subtitle="Open a class to mark attendance, enter marks or share a note." icon={BookOpen} />
            <CardBody className="space-y-3">
              {courses.map((course) => (
                <Link
                  key={course.id}
                  to={`/teacher/classes/${course.id}`}
                  className="focus-ring group flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white/70 p-4 transition hover:border-brand-200 hover:bg-white sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">{classTitle(course)}</p>
                      <Badge tone={course.status === 'completed' ? 'neutral' : 'brand'}>{statusLabel(course.status)}</Badge>
                      {course.assessmentMode === 'competency' ? <Badge tone="warning">Competency</Badge> : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">{classMeta(course)}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        {course.studentCount ?? 0} students
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <ClipboardList className="h-3.5 w-3.5" />
                        {course.assessmentCount ?? Object.values(course.assessments || {}).reduce((sum, value) => sum + value, 0)} assessments
                      </span>
                      {course.attendanceDrafts ? (
                        <span className="inline-flex items-center gap-1.5 text-amber-600">
                          <Clock3 className="h-3.5 w-3.5" />
                          {course.attendanceDrafts} draft{course.attendanceDrafts === 1 ? '' : 's'}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <ArrowRight className="hidden h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500 sm:block" />
                </Link>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Recent attendance"
              subtitle="Finalized sheets are locked; drafts can still change."
              icon={CalendarCheck}
              action={
                <Link to="/teacher/attendance" className="focus-ring rounded-lg text-xs font-semibold text-brand-600 hover:text-brand-800">
                  View all
                </Link>
              }
            />
            <CardBody>
              {data.recentAttendance?.length ? (
                <ul className="divide-y divide-slate-100">
                  {data.recentAttendance.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{row.courseCode || row.courseTitle}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {displayDate(row.dateKey)} · {periodLabel(row.period)}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {row.present} present of {row.marked} marked
                        </p>
                      </div>
                      <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-sm font-medium text-slate-700">No attendance yet</p>
                  <p className="mt-1 text-xs text-slate-500">Open a class to start a sheet.</p>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
