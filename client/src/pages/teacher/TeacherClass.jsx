import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  FolderOpen,
  GraduationCap,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { api } from '../../lib/api';
import { classMeta, classTitle, displayDate, periodLabel, statusLabel, statusTone, termLabel } from '../../lib/teacher';
import TeacherPageHeader from '../../components/teacher/TeacherPageHeader';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/StatePanel';
import { SkeletonPage } from '../../components/ui/Skeleton';
import StatCard from '../../components/ui/StatCard';

const actionClass =
  'focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/85 px-4 text-sm font-semibold text-slate-700 transition hover:bg-white';

export default function TeacherClass() {
  const { assignmentId } = useParams();
  const query = useQuery({
    queryKey: ['teacher', 'class', assignmentId],
    queryFn: async () => (await api.get(`/teacher/courses/${assignmentId}`)).data,
  });

  if (query.isLoading) {
    return <SkeletonPage cards={3} />;
  }

  if (query.isError) {
    return (
      <>
        <TeacherPageHeader backTo="/teacher/classes" eyebrow="Teaching" title="Class" />
        <Card className="mt-6">
          <ErrorState
            message={query.error?.response?.data?.message || 'We could not load this class.'}
            onRetry={query.refetch}
          />
        </Card>
      </>
    );
  }

  const course = query.data;
  const counts = course.assessmentCounts ?? {};
  const totalAssessments = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const active = ['open', 'in_progress'].includes(course.status);
  const canEdit = active && course.canManage;
  const table = `?assignmentId=${course.id}`;

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        backTo="/teacher/classes"
        eyebrow="Class"
        title={classTitle(course)}
        subtitle={classMeta(course)}
        actions={
          canEdit ? (
            <>
              <Link to={`/teacher/attendance/${course.id}`} className={actionClass}>
                <ClipboardCheck className="h-4 w-4" />
                Attendance
              </Link>
              <Link to={`/teacher/assessments${table}`} className={actionClass}>
                <ClipboardList className="h-4 w-4" />
                Marks
              </Link>
            </>
          ) : null
        }
      />

      {!course.canManage ? (
        <Alert tone="info" title="Programme visibility">
          You can see this class because you are assigned to its programme. It is taught by another teacher, so attendance,
          assessments, marks and policies stay read-only. The class roster and programme materials are available to you.
        </Alert>
      ) : !active ? (
        <Alert tone="info" title="This class is read-only">
          The registrar has marked this class as {statusLabel(course.status).toLowerCase()}. You can still read its roster, marks and materials,
          but attendance and new marks are closed.
        </Alert>
      ) : null}

      {course.assessmentMode === 'competency' ? (
        <Alert tone="warning" title="Competency configuration is required">
          This course uses competency assessment. The institution has not configured its competency scales or passing rules, so numeric marks
          cannot be entered. Attendance and materials still work.
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Registered students" value={course.studentCount ?? 0} tone="emerald" />
        <StatCard icon={ClipboardList} label="Assessments" value={totalAssessments} hint={`${counts.draft ?? 0} draft`} tone="violet" />
        <StatCard icon={ClipboardCheck} label="Awaiting submission" value={(counts.published ?? 0) + (counts.closed ?? 0)} tone="amber" />
        <StatCard icon={GraduationCap} label="Submitted" value={counts.submitted ?? 0} tone="indigo" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title="Class details" subtitle="Provided by the registrar's academic records." icon={BookOpen} />
          <CardBody>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {[
                ['Course code', course.courseCode || '—'],
                ['Course title', course.courseTitle || '—'],
                ['Programme', course.program || '—'],
                ['Academic year', course.academicYear || '—'],
                ['Term', termLabel(course.term)],
                ['Level', course.level ? `Level ${course.level}` : '—'],
                ['Batch', course.batch || 'All batches'],
                ['Stream', course.category || '—'],
                ['Department', course.department || '—'],
                ['Credit hours', course.creditHours ?? '—'],
                ['Assessment mode', course.assessmentMode === 'competency' ? 'Competency' : 'Numeric marks'],
                ['Class status', statusLabel(course.status)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
            {course.schedule ? (
              <p className="mt-5 rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-600">
                <span className="font-semibold text-slate-700">Schedule: </span>
                {course.schedule}
              </p>
            ) : null}
            {course.courseActive === false ? (
              <p className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-amber-700">
                <TriangleAlert className="h-4 w-4" />
                The registrar has marked this course inactive for new offerings.
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Quick actions" subtitle="Tools for this class." icon={BookOpen} />
          <CardBody className="grid gap-2">
            {[
              ...(canEdit
                ? [
                    { to: `/teacher/attendance/${course.id}`, label: 'Mark attendance', icon: ClipboardCheck },
                    { to: `/teacher/assessments${table}`, label: 'Assessments and marks', icon: ClipboardList },
                  ]
                : []),
              { to: `/teacher/materials${table}`, label: 'Course documents', icon: FolderOpen },
              ...(course.canManage
                ? [
                    { to: `/teacher/reports${table}`, label: 'Reports and exports', icon: FileBarChart },
                    { to: `/teacher/students?assignmentId=${course.id}`, label: 'View roster', icon: Users },
                  ]
                : []),
            ].map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className="focus-ring flex items-center gap-3 rounded-xl border border-slate-100 bg-white/70 px-3.5 py-3 text-sm font-medium text-slate-700 transition hover:border-brand-200 hover:bg-white"
              >
                <item.icon className="h-4 w-4 text-brand-500" />
                {item.label}
              </Link>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Recent attendance"
          subtitle="The latest sheets for this class."
          icon={ClipboardCheck}
          action={
            course.canManage ? (
              <Link to={`/teacher/attendance?assignmentId=${course.id}`} className="focus-ring text-xs font-semibold text-brand-600 hover:text-brand-800">
                View all
              </Link>
            ) : null
          }
        />
        <CardBody>
          {course.recentAttendance?.length ? (
            <ul className="divide-y divide-slate-100">
              {course.recentAttendance.map((sheet) => (
                <li key={sheet.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{displayDate(sheet.dateKey)}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{periodLabel(sheet.period)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={statusTone(sheet.status)}>{statusLabel(sheet.status)}</Badge>
                    {course.canManage ? (
                      <Link
                        to={`/teacher/attendance/${course.id}?date=${sheet.dateKey}&period=${sheet.period}`}
                        className="focus-ring rounded-lg px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50"
                      >
                        Open
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">No attendance has been recorded for this class yet.</p>
          )}
        </CardBody>
      </Card>

      {counts.submitted ? (
        <p className="text-xs text-slate-400">
          {counts.submitted} assessment{counts.submitted === 1 ? '' : 's'} submitted. Submitted marks are visible in Reports but cannot be changed.
        </p>
      ) : null}
    </div>
  );
}
