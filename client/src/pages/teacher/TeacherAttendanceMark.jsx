import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardCheck, LockKeyhole, Save, TriangleAlert, Undo2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import { classMeta, classTitle, displayDate, periodLabel, statusLabel, todayKey } from '../../lib/teacher';
import EthiopianDateField from '../../components/teacher/EthiopianDateField';
import TeacherPageHeader from '../../components/teacher/TeacherPageHeader';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import { EmptyState, ErrorState } from '../../components/ui/StatePanel';
import { SkeletonRows } from '../../components/ui/Skeleton';

const PERIODS = ['day', 'period-1', 'period-2', 'period-3'];
const STATUSES = [
  { key: 'present', label: 'Present', active: 'bg-emerald-600 text-white border-emerald-600' },
  { key: 'absent', label: 'Absent', active: 'bg-rose-600 text-white border-rose-600' },
  { key: 'late', label: 'Late', active: 'bg-amber-500 text-white border-amber-500' },
  { key: 'excused', label: 'Excused', active: 'bg-sky-600 text-white border-sky-600' },
];

export default function TeacherAttendanceMark() {
  const { assignmentId } = useParams();
  const [params, setParams] = useSearchParams();
  const initialDate = params.get('date') || todayKey();
  const initialPeriod = PERIODS.includes(params.get('period')) ? params.get('period') : 'day';
  const [date, setDate] = useState(initialDate);
  const [period, setPeriod] = useState(initialPeriod);
  const [draft, setDraft] = useState({ key: '', values: {} });
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const queryClient = useQueryClient();

  const queryKey = ['teacher', 'attendance-roster', assignmentId, date, period];
  const query = useQuery({
    queryKey,
    queryFn: async () =>
      (await api.get(`/teacher/courses/${assignmentId}/attendance`, { params: { date, period } })).data,
    retry: false,
  });

  const students = useMemo(() => query.data?.students ?? [], [query.data?.students]);
  const session = query.data?.session;
  const canEdit = Boolean(query.data?.canEdit);
  const baseStatuses = useMemo(
    () => Object.fromEntries(students.map((student) => [student.id, student.attendanceStatus || ''])),
    [students],
  );
  const dataKey = useMemo(
    () =>
      `${query.data?.date || ''}|${query.data?.period || ''}|${session?.revision ?? ''}|${students
        .map((student) => `${student.id}:${student.attendanceStatus ?? ''}`)
        .join(',')}`,
    [query.data?.date, query.data?.period, session?.revision, students],
  );
  const statuses = draft.key === dataKey ? draft.values : baseStatuses;
  const dirty = useMemo(
    () => students.some((student) => (statuses[student.id] ?? '') !== baseStatuses[student.id]),
    [students, statuses, baseStatuses],
  );

  const unmarked = useMemo(() => students.filter((student) => !statuses[student.id]), [students, statuses]);
  const marked = students.length - unmarked.length;

  const goTo = (nextDate, nextPeriod) => {
    if (dirty) {
      toast.info('Save your draft before changing the date or period.');
      return;
    }
    setDate(nextDate);
    setPeriod(nextPeriod);
    setParams({ date: nextDate, period: nextPeriod });
  };

  const saveMutation = useMutation({
    mutationFn: async () =>
      (
        await api.put(`/teacher/courses/${assignmentId}/attendance`, {
          date,
          period,
          revision: session?.revision,
          records: students
            .filter((student) => statuses[student.id])
            .map((student) => ({ studentId: student.id, status: statuses[student.id], note: '' })),
        })
      ).data,
    onSuccess: async () => {
      toast.success('Attendance draft saved.');
      setDraft({ key: '', values: {} });
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(errorMessage(error, 'We could not save this attendance sheet.')),
  });

  const finalizeMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/teacher/courses/${assignmentId}/attendance/${session?.id}/finalize`, {
          revision: session?.revision,
        })
      ).data,
    onSuccess: async () => {
      setConfirmFinalize(false);
      toast.success('Attendance finalized and locked.');
      await queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'attendance'] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'class', assignmentId] });
    },
    onError: (error) => toast.error(errorMessage(error, 'We could not finalize this attendance sheet.')),
  });

  const setStatus = (studentId, status) => {
    setDraft((current) => {
      const values = current.key === dataKey ? current.values : baseStatuses;
      return { key: dataKey, values: { ...values, [studentId]: status } };
    });
  };

  if (query.isLoading) return <SkeletonRows rows={8} />;

  if (query.isError) {
    return (
      <>
        <TeacherPageHeader backTo="/teacher/attendance" eyebrow="Attendance" title="Mark attendance" />
        <Card className="mt-6">
          <ErrorState
            message={query.error?.response?.data?.message || 'We could not open this attendance sheet.'}
            onRetry={query.refetch}
          />
        </Card>
      </>
    );
  }

  const assignment = query.data.assignment;
  const finalized = session?.status === 'finalized';
  const readOnly = !canEdit;
  const allMarked = students.length > 0 && unmarked.length === 0;
  const canFinalize = canEdit && Boolean(session) && !dirty && allMarked && !finalized;

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        backTo="/teacher/attendance"
        eyebrow="Attendance"
        title={classTitle(assignment)}
        subtitle={`${classMeta(assignment)} · ${displayDate(date)} · ${periodLabel(period)}`}
        actions={
          finalized ? (
            <Badge tone="success">
              <LockKeyhole className="h-3.5 w-3.5" />
              Finalized
            </Badge>
          ) : session ? (
            <Badge tone="warning">Draft saved</Badge>
          ) : (
            <Badge tone="neutral">Not saved</Badge>
          )
        }
      />

      {finalized ? (
        <Alert tone="success" title="This sheet is finalized">
          Finalized attendance is read-only and already counts in the attendance report. Choose another date or period to start a new sheet.
        </Alert>
      ) : readOnly ? (
        <Alert tone="info" title="This class is read-only">
          The registrar has closed this class for new teaching changes, so attendance can no longer be edited.
        </Alert>
      ) : null}

      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_220px_auto] lg:items-end">
          <EthiopianDateField
            label="Meeting date"
            value={date}
            max={todayKey()}
            disabled={dirty || saveMutation.isPending}
            onChange={(value) => goTo(value, period)}
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="attendance-period">
              Session
            </label>
            <select
              id="attendance-period"
              value={period}
              disabled={dirty || saveMutation.isPending}
              onChange={(event) => goTo(date, event.target.value)}
              className="focus-ring h-10 w-full rounded-xl border border-slate-200 bg-white/85 px-3 text-sm text-slate-800 disabled:opacity-60"
            >
              {PERIODS.map((value) => (
                <option key={value} value={value}>
                  {periodLabel(value)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-1">
            <Button
              variant="secondary"
              onClick={() => {
                const next = { ...statuses };
                students.forEach((student) => {
                  if (!next[student.id]) next[student.id] = 'present';
                });
                setDraft({ key: dataKey, values: next });
              }}
              disabled={!canEdit || !students.length || unmarked.length === 0}
            >
              <CheckCircle2 className="h-4 w-4" />
              Mark remaining present
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Roster"
          subtitle={`${marked} of ${students.length} students marked${unmarked.length ? ` · ${unmarked.length} still missing` : ''}`}
          icon={Users}
          action={
            <div className="hidden items-center gap-2 sm:flex">
              {STATUSES.map((item) => (
                <span key={item.key} className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      item.key === 'present'
                        ? 'bg-emerald-500'
                        : item.key === 'absent'
                          ? 'bg-rose-500'
                          : item.key === 'late'
                            ? 'bg-amber-500'
                            : 'bg-sky-500'
                    }`}
                  />
                  {item.label}
                </span>
              ))}
            </div>
          }
        />
        <CardBody>
          {!students.length ? (
            <EmptyState
              icon={Users}
              title="No registered students"
              message="The registrar has not registered any students in this class, so there is no attendance to mark."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {students.map((student) => {
                const value = statuses[student.id];
                return (
                  <li key={student.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{student.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {student.studentNumber || 'No student ID'}
                        {student.program ? ` · ${student.program}` : ''}
                      </p>
                    </div>
                    {readOnly ? (
                      <Badge tone={value === 'present' ? 'success' : value === 'absent' ? 'danger' : value ? 'warning' : 'neutral'}>
                        {value ? statusLabel(value) : 'Not marked'}
                      </Badge>
                    ) : (
                      <div className="grid grid-cols-4 gap-1.5 sm:flex" role="group" aria-label={`Attendance for ${student.name}`}>
                        {STATUSES.map((item) => {
                          const active = value === item.key;
                          return (
                            <button
                              key={item.key}
                              type="button"
                              aria-pressed={active}
                              onClick={() => setStatus(student.id, active ? '' : item.key)}
                              className={`focus-ring rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition ${
                                active
                                  ? item.active
                                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800'
                              }`}
                            >
                              {item.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {!readOnly && students.length ? (
        <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-xl shadow-slate-900/5 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            {dirty ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-amber-600">
                <TriangleAlert className="h-3.5 w-3.5" />
                Unsaved changes
              </span>
            ) : session ? (
              `Draft revision ${session.revision}`
            ) : (
              'Save a draft before finalizing.'
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setDraft({ key: '', values: {} });
                toast.info('Unsaved changes discarded.');
              }}
              disabled={!dirty || saveMutation.isPending}
            >
              <Undo2 className="h-4 w-4" />
              Discard
            </Button>
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending} disabled={!dirty}>
              <Save className="h-4 w-4" />
              Save draft
            </Button>
            <Button
              onClick={() => setConfirmFinalize(true)}
              loading={finalizeMutation.isPending}
              disabled={!canFinalize}
              className="sm:min-w-[132px]"
            >
              <ClipboardCheck className="h-4 w-4" />
              Finalize
            </Button>
          </div>
        </div>
      ) : null}

      {!readOnly && students.length && !allMarked ? (
        <p className="text-xs text-slate-500">
          Mark every student before finalizing. You can still save a partial draft and return later.
        </p>
      ) : null}

      <Modal
        open={confirmFinalize}
        onClose={() => setConfirmFinalize(false)}
        title="Finalize this attendance sheet?"
        subtitle={`${classTitle(assignment)} · ${displayDate(date)} · ${periodLabel(period)}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmFinalize(false)}>
              Cancel
            </Button>
            <Button onClick={() => finalizeMutation.mutate()} loading={finalizeMutation.isPending}>
              Finalize and lock
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-slate-600">
          All {students.length} students have a status. After finalizing, this sheet cannot be edited from this workspace.
        </p>
      </Modal>
    </div>
  );
}
