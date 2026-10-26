import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  Filter,
  History,
  LockKeyhole,
  Mail,
  Save,
  Send,
  Table,
  TriangleAlert,
  Undo2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import { classTitle, displayDate, periodLabel, statusLabel, todayKey } from '../../lib/teacher';
import { formatEthiopian } from '../../lib/ethiopianDate';
import EthiopianDateField from '../../components/teacher/EthiopianDateField';
import TeacherPageHeader from '../../components/teacher/TeacherPageHeader';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import CodeInput from '../../components/ui/CodeInput';
import { EmptyState, ErrorState } from '../../components/ui/StatePanel';
import { SkeletonRows } from '../../components/ui/Skeleton';
import ExportMenu from '../../components/ui/ExportMenu';

const PERIODS = ['day', 'period-1', 'period-2', 'period-3'];
const STATUSES = [
  { key: 'present', label: 'Present', active: 'bg-emerald-600 text-white border-emerald-600', icon: CheckCircle2 },
  { key: 'absent', label: 'Absent', active: 'bg-rose-600 text-white border-rose-600', icon: XCircle },
  { key: 'late', label: 'Late', active: 'bg-amber-500 text-white border-amber-500', icon: Clock3 },
  { key: 'excused', label: 'Leave / Excused', active: 'bg-sky-600 text-white border-sky-600', icon: Filter },
];
const DEFAULT_STATUS = 'present';

function isSkippableDay(dateKey, deliveryStream) {
  if (!dateKey) return false;
  const d = new Date(`${dateKey}T12:00:00+03:00`);
  if (Number.isNaN(d.getTime())) return false;
  const dayOfWeek = d.getUTCDay(); // Friday=5, Saturday=6, Sunday=0
  if (deliveryStream === 'regular') return dayOfWeek === 6 || dayOfWeek === 0;
  if (deliveryStream === 'extension') return dayOfWeek !== 6 && dayOfWeek !== 0;
  return false;
}

export default function TeacherAttendanceMark() {
  const { assignmentId } = useParams();
  const [params, setParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('daily'); // 'daily' | 'history'

  const initialDate = params.get('date') || todayKey();
  const initialPeriod = PERIODS.includes(params.get('period')) ? params.get('period') : 'day';
  const [date, setDate] = useState(initialDate);
  const [period, setPeriod] = useState(initialPeriod);

  const [draft, setDraft] = useState({ key: '', values: {} });
  const [confirmFinalizeSheet, setConfirmFinalizeSheet] = useState(false);

  // Finalize course attendance & sync marks state
  const [confirmFinalizeCourse, setConfirmFinalizeCourse] = useState(false);
  const [finalizeCode, setFinalizeCode] = useState('');

  const queryClient = useQueryClient();

  const queryKey = ['teacher', 'attendance-roster', assignmentId, date, period];
  const query = useQuery({
    queryKey,
    queryFn: async () =>
      (await api.get(`/teacher/courses/${assignmentId}/attendance`, { params: { date, period } })).data,
    retry: false,
  });

  const historyQueryKey = ['teacher', 'attendance-history', assignmentId];
  const historyQuery = useQuery({
    queryKey: historyQueryKey,
    queryFn: async () => (await api.get(`/teacher/attendance/${assignmentId}/history`)).data,
    staleTime: 60_000,
  });

  const students = useMemo(() => query.data?.students ?? [], [query.data?.students]);
  const session = query.data?.session;
  const canEdit = Boolean(query.data?.canEdit);
  const isCourseClosed = Boolean(query.data?.assignment?.attendanceClosed || historyQuery.data?.isAttendanceClosed);
  const deliveryStream = query.data?.deliveryStream || historyQuery.data?.deliveryStream || 'regular';

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
      await queryClient.invalidateQueries({ queryKey: historyQueryKey });
    },
    onError: (error) => toast.error(errorMessage(error, 'We could not save this attendance sheet.')),
  });

  const finalizeSheetMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/teacher/courses/${assignmentId}/attendance/${session?.id}/finalize`, {
          revision: session?.revision,
        })
      ).data,
    onSuccess: async () => {
      setConfirmFinalizeSheet(false);
      toast.success('Attendance sheet finalized and locked.');
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: historyQueryKey });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'attendance'] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'dashboard'] });
    },
    onError: (error) => toast.error(errorMessage(error, 'We could not finalize this attendance sheet.')),
  });

  // Finalize course attendance code request
  const requestFinalizeCodeMutation = useMutation({
    mutationFn: async () =>
      (await api.post(`/teacher/attendance/${assignmentId}/finalize-code`)).data,
    onSuccess: () => {
      toast.success('A 6-digit confirmation code has been sent to your email.');
    },
    onError: (error) =>
      toast.error(errorMessage(error, 'Could not send confirmation code.')),
  });

  // Finalize whole course attendance and sync marks
  const finalizeCourseMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/teacher/attendance/${assignmentId}/finalize-course`, {
          code: finalizeCode,
        })
      ).data,
    onSuccess: (data) => {
      setConfirmFinalizeCourse(false);
      setFinalizeCode('');
      toast.success(
        data.syncedCount
          ? `Course attendance closed. Synced marks for ${data.syncedCount} students!`
          : 'Course attendance closed successfully.',
      );
      queryClient.invalidateQueries({ queryKey: historyQueryKey });
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'course-marks'] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'attendance'] });
    },
    onError: (error) =>
      toast.error(errorMessage(error, 'Could not finalize course attendance.')),
  });

  const fastMark = (excludeStatus) => {
    setDraft((current) => {
      const values = current.key === dataKey ? current.values : baseStatuses;
      const next = {};
      students.forEach((student) => {
        const currentStatus = values[student.id] || '';
        next[student.id] = currentStatus === excludeStatus ? currentStatus : DEFAULT_STATUS;
      });
      return { key: dataKey, values: next };
    });
  };

  const markAllAbsent = () => {
    setDraft({ key: dataKey, values: Object.fromEntries(students.map((s) => [s.id, 'absent'])) });
  };

  const setStatus = (studentId, status) => {
    setDraft((current) => {
      const values = current.key === dataKey ? current.values : baseStatuses;
      const nextStatus = values[studentId] === status ? '' : status;
      return { key: dataKey, values: { ...values, [studentId]: nextStatus } };
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
  const sheetFinalized = session?.status === 'finalized';
  const readOnly = !canEdit || isCourseClosed;
  const allMarked = students.length > 0 && unmarked.length === 0;
  const daySkipped = isSkippableDay(date, deliveryStream);
  const canFinalizeSheet = canEdit && Boolean(session) && !dirty && allMarked && !sheetFinalized && !isCourseClosed;

  const historyData = historyQuery.data || { dates: [], sessions: [], students: [], policyMark: 0 };

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        backTo="/teacher/attendance"
        eyebrow="Attendance"
        title={classTitle(assignment)}
        subtitle={`${classTitle(assignment)} · ${displayDate(date)} · ${periodLabel(period)} · ${deliveryStream === 'extension' ? 'Extension' : 'Regular'}`}
        actions={
          isCourseClosed ? (
            <Badge tone="success">
              <LockKeyhole className="h-3.5 w-3.5" />
              Attendance Closed & Synced
            </Badge>
          ) : sheetFinalized ? (
            <Badge tone="success">
              <LockKeyhole className="h-3.5 w-3.5" />
              Sheet Finalized
            </Badge>
          ) : session ? (
            <Badge tone="warning">Draft saved</Badge>
          ) : (
            <Badge tone="neutral">Not saved</Badge>
          )
        }
      />

      {isCourseClosed ? (
        <Alert tone="info" title="Course Attendance is Finalized & Closed">
          Attendance for this entire course has been finalized and marks have been synced to the course mark sheet.
          All attendance sessions are read-only.
        </Alert>
      ) : sheetFinalized ? (
        <Alert tone="success" title="This sheet is finalized">
          Finalized attendance is read-only and already counts in the attendance report. Choose another date or period to start a new sheet.
        </Alert>
      ) : readOnly ? (
        <Alert tone="info" title="This class is read-only">
          The registrar has closed this class for new teaching changes, so attendance can no longer be edited.
        </Alert>
      ) : daySkipped ? (
        <Alert tone="warning" title="Class day skipped">
          {deliveryStream === 'regular'
            ? 'Regular programmes do not meet on weekends. This date is automatically excluded.'
            : 'Extension programmes only meet on weekends. Weekdays are skipped.'}
        </Alert>
      ) : null}

      {/* Primary Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('daily')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'daily'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <CalendarDays className="h-4 w-4" />
            Daily Session Sheet
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'history'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Table className="h-4 w-4" />
            History Matrix & Sync Marks
            {historyData.sessions?.length > 0 && (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">
                {historyData.sessions.length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'history' && (
          <div className="flex items-center gap-2">
            <ExportMenu
              basePath={`/teacher/attendance/${assignmentId}/history/export`}
              params={{}}
              filenamePrefix={`attendance-history-${assignment.courseCode || 'course'}`}
              label={
                <>
                  <Download className="h-4 w-4" />
                  Export History
                </>
              }
            />
            {!isCourseClosed && (
              <Button
                variant="primary"
                onClick={() => setConfirmFinalizeCourse(true)}
                disabled={!historyData.sessions?.length}
              >
                <ClipboardCheck className="h-4 w-4" />
                Finalize Course Attendance
              </Button>
            )}
          </div>
        )}
      </div>

      {/* TAB 1: DAILY SESSION */}
      {activeTab === 'daily' && (
        <div className="space-y-6">
          {/* Navigation card */}
          <Card>
            <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_220px_auto] lg:items-end">
              <EthiopianDateField
                label="Meeting date"
                value={date}
                max={todayKey()}
                disabled={dirty || saveMutation.isPending || isCourseClosed}
                onChange={(value) => goTo(value, period)}
              />
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="attendance-period">
                  Session
                </label>
                <select
                  id="attendance-period"
                  value={period}
                  disabled={dirty || saveMutation.isPending || isCourseClosed}
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
                {!readOnly && students.length > 0 && !sheetFinalized && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => fastMark('absent')}
                      disabled={saveMutation.isPending}
                      title="Mark everyone present except selected absentees"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      All present
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => fastMark('excused')}
                      disabled={saveMutation.isPending}
                      title="Mark everyone present except selected excused"
                    >
                      <Filter className="h-4 w-4" />
                      All except excused
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => markAllAbsent()}
                      disabled={saveMutation.isPending}
                      title="Mark all students absent"
                    >
                      <XCircle className="h-4 w-4" />
                      All absent
                    </Button>
                  </>
                )}
              </div>
            </CardBody>
          </Card>

          {/* Roster list view */}
          {students.length > 0 ? (
            <Card>
              <CardHeader
                title="Class Roster"
                subtitle={`${marked} of ${students.length} students marked${unmarked.length ? ` · ${unmarked.length} still missing` : ''}`}
              />
              <CardBody>
                <ul className="divide-y divide-slate-100">
                  {students.map((student) => {
                    const value = statuses[student.id];
                    return (
                      <li key={student.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex items-center gap-3">
                          {student.photo?.thumbnailUrl ? (
                            <img
                              src={student.photo.thumbnailUrl}
                              alt=""
                              className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-slate-100"
                            />
                          ) : (
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 text-xs font-bold">
                              {student.name?.slice(0, 2) || 'S'}
                            </span>
                          )}
                          <div>
                            <p className="truncate text-sm font-semibold text-slate-800">{student.name}</p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {student.studentNumber || 'No ID'}
                              {student.program ? ` · ${student.program}` : ''}
                            </p>
                          </div>
                        </div>
                        {readOnly || sheetFinalized ? (
                          <Badge tone={value === 'present' ? 'success' : value === 'absent' ? 'danger' : value ? 'warning' : 'neutral'}>
                            {value ? statusLabel(value) : 'Not marked'}
                          </Badge>
                        ) : (
                          <div className="grid grid-cols-4 gap-1.5 sm:flex" role="group" aria-label={`Attendance for ${student.name}`}>
                            {STATUSES.map((item) => {
                              const active = value === item.key;
                              const Icon = item.icon;
                              return (
                                <button
                                  key={item.key}
                                  type="button"
                                  aria-pressed={active}
                                  onClick={() => setStatus(student.id, active ? '' : item.key)}
                                  className={`focus-ring rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition flex items-center gap-1 ${
                                    active
                                      ? item.active
                                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800'
                                  }`}
                                >
                                  <Icon className="h-3 w-3" />
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
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody>
                <EmptyState
                  icon={CheckCircle2}
                  title="No students registered"
                  message="There are no students in this class to mark attendance for."
                />
              </CardBody>
            </Card>
          )}

          {!readOnly && !sheetFinalized && students.length ? (
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
                  onClick={() => setConfirmFinalizeSheet(true)}
                  loading={finalizeSheetMutation.isPending}
                  disabled={!canFinalizeSheet}
                  className="sm:min-w-[132px]"
                >
                  <ClipboardCheck className="h-4 w-4" />
                  Finalize Sheet
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* TAB 2: ATTENDANCE HISTORY MATRIX */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Attendance History Matrix"
              subtitle={
                historyData.policyMark > 0
                  ? `Grading Policy Mark: ${historyData.policyMark} marks · Leave counts as present · Absence penalties: 1 abs: -1, 2-3 abs: -3, 4 abs: -5, 5+ abs: 0`
                  : 'No attendance policy mark configured for this course. Closing attendance will finalize records without assigning marks.'
              }
            />
            <CardBody className="overflow-x-auto p-0">
              {historyQuery.isLoading ? (
                <div className="p-5">
                  <SkeletonRows rows={6} />
                </div>
              ) : !historyData.students?.length ? (
                <div className="p-5">
                  <EmptyState
                    icon={History}
                    title="No attendance sessions recorded"
                    message="Finalize daily attendance sheets to build the attendance history matrix."
                  />
                </div>
              ) : (
                <table className="w-full min-w-max border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left">Student</th>
                      <th className="px-3 py-3 text-left">Student ID</th>
                      {historyData.dates.map((d) => (
                        <th key={d} className="px-2 py-3 text-center" title={d}>
                          <span className="font-mono text-[10px] text-slate-700">{d.slice(5)}</span>
                        </th>
                      ))}
                      <th className="px-3 py-3 text-center text-emerald-700 font-semibold">Present</th>
                      <th className="px-3 py-3 text-center text-sky-700 font-semibold">Leave</th>
                      <th className="px-3 py-3 text-center text-rose-700 font-semibold">Absent</th>
                      <th className="px-3 py-3 text-center font-semibold">Rate</th>
                      {historyData.policyMark > 0 && (
                        <th className="px-3 py-3 text-center text-brand-700 font-bold">
                          Mark (/{historyData.policyMark})
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyData.students.map((st) => (
                      <tr key={st.id} className="hover:bg-slate-50/60 transition">
                        <td className="sticky left-0 z-10 bg-white px-4 py-2.5 font-medium text-slate-800">
                          {st.name}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">
                          {st.studentId || '—'}
                        </td>
                        {historyData.dates.map((d) => {
                          const status = st.statuses?.[d];
                          return (
                            <td key={d} className="px-2 py-2.5 text-center">
                              {status === 'present' ? (
                                <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" title="Present" />
                              ) : status === 'excused' ? (
                                <span className="inline-block rounded bg-sky-50 px-1 py-0.5 text-[10px] font-semibold text-sky-700 border border-sky-200" title="Leave (Excused)">
                                  Leave
                                </span>
                              ) : status === 'absent' ? (
                                <XCircle className="mx-auto h-4 w-4 text-rose-500" title="Absent" />
                              ) : status === 'late' ? (
                                <Clock3 className="mx-auto h-4 w-4 text-amber-500" title="Late" />
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2.5 text-center font-semibold text-emerald-600">{st.present}</td>
                        <td className="px-3 py-2.5 text-center font-medium text-sky-600">{st.excused}</td>
                        <td className="px-3 py-2.5 text-center font-semibold text-rose-600">{st.absent}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`font-semibold ${st.rate >= 80 ? 'text-emerald-600' : st.rate >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>
                            {st.rate}%
                          </span>
                        </td>
                        {historyData.policyMark > 0 && (
                          <td className="px-3 py-2.5 text-center font-bold text-brand-700">
                            {st.mark !== null ? st.mark : '—'}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* Modal: Confirm finalize daily sheet */}
      <Modal
        open={confirmFinalizeSheet}
        onClose={() => setConfirmFinalizeSheet(false)}
        title="Finalize this attendance sheet?"
        subtitle={`${classTitle(assignment)} · ${displayDate(date)} · ${periodLabel(period)}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmFinalizeSheet(false)}>
              Cancel
            </Button>
            <Button onClick={() => finalizeSheetMutation.mutate()} loading={finalizeSheetMutation.isPending}>
              Finalize and lock
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-slate-600">
          All {students.length} students have a status. After finalizing, this sheet cannot be edited from this workspace.
        </p>
      </Modal>

      {/* Modal: Finalize course attendance & sync marks */}
      <Modal
        open={confirmFinalizeCourse}
        onClose={() => setConfirmFinalizeCourse(false)}
        title="Finalize Course Attendance & Close"
        subtitle={`${classTitle(assignment)} · Total sessions: ${historyData.dates.length}`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmFinalizeCourse(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => finalizeCourseMutation.mutate()}
              loading={finalizeCourseMutation.isPending}
              disabled={finalizeCode.length !== 6}
            >
              <ClipboardCheck className="h-4 w-4" />
              Confirm & Close Attendance
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-600">
            Finalizing course attendance will close attendance for this class.
            {historyData.policyMark > 0 ? (
              <span>
                {' '}Computed attendance marks (out of <strong>{historyData.policyMark}</strong>) will be synced to each student's course mark sheet according to the absence penalty scale:
                <br />
                <span className="mt-1 block text-xs text-slate-500">
                  • 0 absences (leaves count as present): <strong>{historyData.policyMark} marks</strong>
                  <br />
                  • 1 absence: <strong>{Math.max(0, historyData.policyMark - 1)} marks</strong> (-1)
                  <br />
                  • 2–3 absences: <strong>{Math.max(0, historyData.policyMark - 3)} marks</strong> (-3)
                  <br />
                  • 4 absences: <strong>{Math.max(0, historyData.policyMark - 5)} marks</strong> (-5)
                  <br />
                  • 5+ absences: <strong>0 marks</strong>
                </span>
              </span>
            ) : (
              <span>
                {' '}No attendance policy mark is set for this course, so attendance will be marked complete without updating marks.
              </span>
            )}
          </p>

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Mail className="h-4 w-4 text-brand-600" />
                Email confirmation code
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => requestFinalizeCodeMutation.mutate()}
                loading={requestFinalizeCodeMutation.isPending}
              >
                Send verification code
              </Button>
            </div>
            <div className="mt-3">
              <CodeInput
                value={finalizeCode}
                onChange={setFinalizeCode}
                disabled={finalizeCourseMutation.isPending}
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
