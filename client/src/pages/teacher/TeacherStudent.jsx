import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, BookOpen, CalendarDays, ClipboardList, GraduationCap, Mail, Phone, UserRound } from 'lucide-react';
import { api } from '../../lib/api';
import { classMeta, classTitle, displayDate, periodLabel, statusLabel, statusTone } from '../../lib/teacher';
import TeacherPageHeader from '../../components/teacher/TeacherPageHeader';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/StatePanel';
import { SkeletonPage } from '../../components/ui/Skeleton';
import StatCard from '../../components/ui/StatCard';

export default function TeacherStudent() {
  const { studentId } = useParams();
  const query = useQuery({
    queryKey: ['teacher', 'student', studentId],
    queryFn: async () => (await api.get(`/teacher/students/${studentId}`)).data,
  });

  if (query.isLoading) return <SkeletonPage cards={3} />;

  if (query.isError) {
    return (
      <>
        <TeacherPageHeader backTo="/teacher/students" eyebrow="People" title="Student" />
        <Card className="mt-6">
          <ErrorState
            message={query.error?.response?.data?.message || 'We could not load this student.'}
            onRetry={query.refetch}
          />
        </Card>
      </>
    );
  }

  const { student, classes = [], attendance = [], results = [], summary = {} } = query.data;
  const competencyClasses = classes.filter((row) => row.assessmentMode === 'competency');

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        backTo="/teacher/students"
        eyebrow="Student"
        title={student.name}
        subtitle={[student.studentNumber, student.program, student.batch, student.level ? `Level ${student.level}` : '']
          .filter(Boolean)
          .join(' · ')}
        actions={
          <Badge tone={student.studentStatus === 'active' ? 'success' : 'neutral'}>
            {statusLabel(student.studentStatus || student.enrollmentStatus || 'student')}
          </Badge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={BookOpen} label="Registered classes" value={summary.activeClasses ?? 0} tone="indigo" />
        <StatCard icon={CalendarDays} label="Attendance records" value={summary.attendanceSessions ?? 0} tone="sky" />
        <StatCard icon={ClipboardList} label="Marks entered" value={summary.marksEntered ?? 0} tone="violet" />
        <StatCard
          icon={GraduationCap}
          label="Absences recorded"
          value={summary.absent ?? 0}
          hint={`${summary.late ?? 0} late`}
          tone="amber"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.6fr]">
        <Card>
          <CardHeader title="Student record" subtitle="Read-only information from the registrar." icon={UserRound} />
          <CardBody>
            <dl className="space-y-4">
              {[
                ['Student ID', student.studentNumber || '—'],
                ['Full name', student.name],
                ['Sex', statusLabel(student.sex)],
                ['Programme', student.program || '—'],
                ['Batch', student.batch || '—'],
                ['Level', student.level ?? '—'],
                ['Department', student.department || '—'],
                ['Student status', statusLabel(student.studentStatus)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <dt className="text-xs font-medium text-slate-400">{label}</dt>
                  <dd className="text-right text-sm font-medium text-slate-800">{value || '—'}</dd>
                </div>
              ))}
            </dl>
            {student.email || student.phone ? (
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
                {student.email ? (
                  <p className="flex items-center gap-2 text-slate-600">
                    <Mail className="h-4 w-4 text-slate-400" />
                    {student.email}
                  </p>
                ) : null}
                {student.phone ? (
                  <p className="flex items-center gap-2 text-slate-600">
                    <Phone className="h-4 w-4 text-slate-400" />
                    {student.phone}
                  </p>
                ) : null}
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Classes with you" subtitle="Only registrations in your own classes." icon={BookOpen} />
          <CardBody className="space-y-2">
            {classes.length ? (
              classes.map((row) => (
                <Link
                  key={`${row.id}-${row.registrationId || ''}`}
                  to={`/teacher/classes/${row.id}`}
                  className="focus-ring flex items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-white/70 p-4 transition hover:border-brand-200 hover:bg-white"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{classTitle(row)}</p>
                    <p className="mt-1 text-xs text-slate-500">{classMeta(row)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge tone={row.registrationStatus === 'registered' ? 'success' : 'neutral'}>
                        {statusLabel(row.registrationStatus)}
                      </Badge>
                      {row.assessmentMode === 'competency' ? <Badge tone="warning">Competency</Badge> : null}
                    </div>
                  </div>
                  <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                </Link>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-slate-500">No class registration is visible to you.</p>
            )}
          </CardBody>
        </Card>
      </div>

      {competencyClasses.length ? (
        <Alert tone="warning" title="Competency courses are not scored here">
          {competencyClasses.length === 1 ? 'One of this student’s classes uses competency assessment' : 'Some of this student’s classes use competency assessment'}.
          The institution has not configured competency scales or passing rules, so no competency result is calculated or displayed.
        </Alert>
      ) : null}

      <Card>
        <CardHeader title="Marks" subtitle="Raw marks only; no GPA or letter grade is calculated here." icon={ClipboardList} />
        <CardBody>
          {results.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="pb-3 pr-4">Assessment</th>
                    <th className="pb-3 pr-4">Type</th>
                    <th className="pb-3 pr-4 text-right">Score</th>
                    <th className="pb-3 pr-4">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map((row) => (
                    <tr key={row.assessmentId}>
                      <td className="py-3 pr-4 font-medium text-slate-800">{row.title}</td>
                      <td className="py-3 pr-4 capitalize text-slate-500">{row.type}</td>
                      <td className="py-3 pr-4 text-right font-mono text-xs font-semibold text-slate-700">
                        {row.score === null || row.score === undefined ? '—' : `${row.score} / ${row.maxScore}`}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge tone={row.status === 'submitted' ? 'success' : statusTone(row.status)}>{statusLabel(row.status)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">No published assessments yet.</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Attendance history" subtitle="Only sessions taught by you." icon={CalendarDays} />
        <CardBody>
          {attendance.length ? (
            <div className="max-h-[520px] overflow-y-auto pr-1 thin-scroll">
              <ul className="divide-y divide-slate-100">
                {attendance.slice(0, 60).map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{displayDate(row.dateKey)}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {periodLabel(row.period)}
                        {row.note ? ` · ${row.note}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
                      {row.sheetStatus ? (
                        <span className="text-[11px] text-slate-400">{statusLabel(row.sheetStatus)}</span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
              {attendance.length > 60 ? <p className="pt-3 text-xs text-slate-400">Showing the 60 most recent records.</p> : null}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">No attendance has been recorded for this student.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
