import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, Calculator, ClipboardList, GraduationCap, LockKeyhole, Send, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import { classMeta, classTitle } from '../../lib/teacher';
import TeacherPageHeader from '../../components/teacher/TeacherPageHeader';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card, { CardBody } from '../../components/ui/Card';
import CodeInput from '../../components/ui/CodeInput';
import Modal from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/StatePanel';
import { SkeletonRows } from '../../components/ui/Skeleton';

const isReady = (row) =>
  Boolean(
    row.ready ??
      (row.policy &&
        row.studentCount > 0 &&
        row.calculatedStudents === row.studentCount &&
        !row.submittedStudents),
  );

export default function TeacherCourseMarks() {
  const queryClient = useQueryClient();
  const [program, setProgram] = useState('all');
  const [confirmSend, setConfirmSend] = useState(false);
  const [sendCode, setSendCode] = useState('');
  const query = useQuery({
    queryKey: ['teacher', 'course-mark-courses'],
    queryFn: async () => (await api.get('/teacher/course-marks')).data,
  });
  const courses = useMemo(() => query.data?.courses ?? [], [query.data?.courses]);
  const programs = useMemo(() => {
    const map = new Map();
    for (const row of courses) {
      if (row.assignment.programId) map.set(row.assignment.programId, row.assignment.programName || row.assignment.program);
    }
    return [...map.entries()];
  }, [courses]);
  const visible = courses.filter((row) => program === 'all' || row.assignment.programId === program);
  const ready = visible.filter(isReady);
  const submitted = visible.filter((row) => row.submittedStudents > 0);

  const groupedCourseMarks = useMemo(() => {
    const groups = new Map();
    for (const row of visible) {
      const a = row.assignment;
      const progId = a.programId || a.program || 'default';
      const batchId = a.batchId || a.batch || 'default';
      const level = a.level || 1;
      const key = `${progId}-${batchId}-${level}`;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          programId: progId,
          programName: a.programName || a.program || 'Programme',
          qualificationType: a.qualificationType || 'degree',
          level,
          batchCode: a.batchCode || a.batch || '',
          stream: a.batch?.category || a.category || 'regular',
          rows: [],
        });
      }
      groups.get(key).rows.push(row);
    }

    return [...groups.values()].map((group) => {
      group.rows.sort((a, b) =>
        (a.assignment?.courseCode || a.assignment?.course?.code || '').localeCompare(
          b.assignment?.courseCode || b.assignment?.course?.code || '',
        ),
      );

      let previousCompleted = true;
      const rowsWithLock = group.rows.map((row, idx) => {
        const isCompleted = row.submittedStudents > 0 || row.assignment.status === 'completed';
        const isUnlocked = idx === 0 || previousCompleted;
        const lockedBy = !isUnlocked ? group.rows[idx - 1] : null;

        if (!isCompleted) {
          previousCompleted = false;
        }

        return {
          ...row,
          isUnlocked,
          lockedBy,
        };
      });

      return {
        ...group,
        rows: rowsWithLock,
      };
    });
  }, [visible]);

  const requestCodeMutation = useMutation({
    mutationFn: async () => (await api.post('/teacher/course-marks/submit-code')).data,
    onSuccess: (data) => {
      setSendCode('');
      toast.success(data?.message || 'A confirmation code was emailed to your account.');
    },
    onError: (error) => toast.error(errorMessage(error, 'The confirmation code could not be sent.')),
  });

  const sendMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post('/teacher/course-marks/submit', {
          offeringIds: ready.map((row) => row.assignment.id),
          code: sendCode,
        })
      ).data,
    onSuccess: async (data) => {
      setConfirmSend(false);
      setSendCode('');
      toast.success(
        `${data.courses.length} course${data.courses.length === 1 ? '' : 's'} sent to the registrar.`,
      );
      await queryClient.invalidateQueries({ queryKey: ['teacher', 'course-mark-courses'] });
      await queryClient.invalidateQueries({ queryKey: ['teacher', 'course-marks'] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'dashboard'] });
    },
    onError: (error) => toast.error(errorMessage(error, 'We could not send these course marks.')),
  });

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        eyebrow="Assessment"
        title="Course marks"
        subtitle="Enter marks from your policy, calculate totals and grades, then send the course to the registrar."
        actions={
          <>
            <Link
              to="/teacher/course-mark-policy"
              className="focus-ring inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 text-sm font-semibold text-slate-700 transition hover:bg-white"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Mark policies
            </Link>
            <Button
              onClick={() => setConfirmSend(true)}
              disabled={!ready.length}
              loading={sendMutation.isPending}
            >
              <Send className="h-4 w-4" />
              Send ready courses
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Courses', visible.length, ClipboardList],
          ['Ready to send', ready.length, Calculator],
          ['Sent to registrar', submitted.length, Send],
        ].map(([label, value, Icon]) => (
          <div key={label} className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/70 p-4 shadow-sm">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="font-mono text-xl font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">My courses</p>
              <p className="text-xs text-slate-500">Filter by the programme the registrar assigned.</p>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-500">
              Programme
              <select
                value={program}
                onChange={(event) => setProgram(event.target.value)}
                className="focus-ring h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
              >
                <option value="all">All programmes</option>
                {programs.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {query.isError ? (
            <Alert tone="danger">We could not load your courses.</Alert>
          ) : query.isLoading ? (
            <SkeletonRows rows={5} />
          ) : !visible.length ? (
            <EmptyState icon={ClipboardList} title="No courses to mark" message="The registrar has not assigned you a course yet." />
          ) : (
            <div className="space-y-6">
              {groupedCourseMarks.map((group) => {
                const durationLabel =
                  group.qualificationType === 'degree'
                    ? `Year ${group.level}`
                    : group.qualificationType === 'diploma'
                      ? `Level ${group.level}`
                      : `Duration ${group.level}`;

                return (
                  <Card key={group.key} className="overflow-hidden border border-slate-200/90 shadow-sm">
                    <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 shadow-sm">
                            <GraduationCap className="h-5 w-5" />
                          </span>
                          <div>
                            <h2 className="text-base font-bold text-slate-900">{group.programName}</h2>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {durationLabel} · Batch: {group.batchCode || 'Regular'} · {group.rows.length} course{group.rows.length === 1 ? '' : 's'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone={group.stream === 'extension' ? 'warning' : 'brand'}>
                            {group.stream === 'extension' ? 'Extension' : 'Regular'}
                          </Badge>
                          <Badge tone="neutral">{group.qualificationType ? group.qualificationType.toUpperCase() : 'DEGREE'}</Badge>
                        </div>
                      </div>
                    </div>

                    <div className="p-5">
                      <div className="grid gap-4 md:grid-cols-2">
                        {group.rows.map((row) => {
                          const rowReady = isReady(row);
                          const sent = row.submittedStudents > 0 || row.assignment.status === 'completed';

                          return (
                            <div
                              key={row.assignment.id}
                              className={`flex flex-col justify-between rounded-2xl border p-4.5 transition ${
                                !row.isUnlocked
                                  ? 'border-slate-200/60 bg-slate-50/80 opacity-80'
                                  : 'border-slate-200 bg-white shadow-sm hover:border-brand-300'
                              }`}
                            >
                              <div>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <span className="font-mono text-xs font-bold text-brand-700">
                                      {row.assignment.courseCode || 'Course'}
                                    </span>
                                    <h3 className="line-clamp-2 text-sm font-semibold text-slate-800 mt-0.5">
                                      {classTitle(row.assignment)}
                                    </h3>
                                    <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{classMeta(row.assignment)}</p>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1">
                                    {!row.isUnlocked ? (
                                      <Badge tone="neutral">
                                        <LockKeyhole className="h-3 w-3 mr-1 inline" />
                                        Locked
                                      </Badge>
                                    ) : (
                                      <Badge tone={sent ? 'success' : rowReady ? 'brand' : row.policy ? 'neutral' : 'warning'}>
                                        {sent ? 'Completed' : rowReady ? 'Ready' : row.policy ? 'Calculating' : 'No policy'}
                                      </Badge>
                                    )}
                                  </div>
                                </div>

                                {!row.isUnlocked ? (
                                  <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800 border border-amber-200/60">
                                    <LockKeyhole className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                                    <span>
                                      Complete <strong>{row.lockedBy?.assignment?.courseCode || 'the previous course'}</strong> first to start and fill marks.
                                    </span>
                                  </div>
                                ) : (
                                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500 border-t border-slate-100 pt-3">
                                    <span>
                                      {row.calculatedStudents ?? 0} / {row.studentCount} calculated
                                    </span>
                                    <span className="text-right">{row.policy ? `Policy ${row.policy.total}` : 'Policy required'}</span>
                                  </div>
                                )}
                              </div>

                              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                                {row.isUnlocked ? (
                                  row.policy ? (
                                    <Link
                                      to={`/teacher/course-marks/${row.assignment.id}`}
                                      className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-800"
                                    >
                                      Open mark sheet
                                      <ArrowRight className="h-3.5 w-3.5" />
                                    </Link>
                                  ) : (
                                    <Link
                                      to="/teacher/course-mark-policy"
                                      className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                                    >
                                      Set policy first
                                      <ArrowRight className="h-3.5 w-3.5" />
                                    </Link>
                                  )
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                                    <LockKeyhole className="h-3.5 w-3.5" />
                                    Mark sheet locked
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={confirmSend}
        onClose={() => setConfirmSend(false)}
        title="Send ready course marks?"
        subtitle={`${ready.length} course${ready.length === 1 ? '' : 's'} with every student calculated`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmSend(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => sendMutation.mutate()}
              loading={sendMutation.isPending}
              disabled={sendCode.length !== 6}
            >
              <Send className="h-4 w-4" />
              Confirm & Close Course
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-slate-600">
          Sending marks will close this course as <strong>completed</strong> and notify the registrar. Marks remain viewable to you, and the next course in this programme will be unlocked for teaching.
        </p>
        <p className="text-sm leading-6 text-slate-600">
          The registrar receives a notification and each mark sheet becomes read-only. Courses with missing or
          uncalculated students are left out.
        </p>
        <ul className="mt-4 space-y-2">
          {ready.map((row) => (
            <li key={row.assignment.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <span className="min-w-0 truncate font-medium text-slate-700">{classTitle(row.assignment)}</span>
              <span className="shrink-0 font-mono text-xs text-slate-500">{row.studentCount} students</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-700">Email confirmation code</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => requestCodeMutation.mutate()}
              loading={requestCodeMutation.isPending}
            >
              Email me a code
            </Button>
          </div>
          <div className="mt-3">
            <CodeInput value={sendCode} onChange={setSendCode} disabled={sendMutation.isPending} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
