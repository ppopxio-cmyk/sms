import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  GraduationCap,
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
