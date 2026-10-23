import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  Filter,
  Grid3X3,
  List,
  LockKeyhole,
  Save,
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
import { EmptyState, ErrorState } from '../../components/ui/StatePanel';
import { SkeletonRows } from '../../components/ui/Skeleton';
import ExportMenu from '../../components/ui/ExportMenu';

const PERIODS = ['day', 'period-1', 'period-2', 'period-3'];
const STATUSES = [
  { key: 'present', label: 'Present', active: 'bg-emerald-600 text-white border-emerald-600', icon: CheckCircle2 },
  { key: 'absent', label: 'Absent', active: 'bg-rose-600 text-white border-rose-600', icon: XCircle },
  { key: 'late', label: 'Late', active: 'bg-amber-500 text-white border-amber-500', icon: Clock3 },
  { key: 'excused', label: 'Excused', active: 'bg-sky-600 text-white border-sky-600', icon: Filter },
];
const DEFAULT_STATUS = 'present';

// Saturday=6, Sunday=0 in JavaScript getDay().
// Regular programmes skip Sat+Sun; extension skips Mon–Fri (only Sat/Sun).
function isSkippableDay(dateKey, deliveryStream) {
  if (!dateKey) return false;
  const d = new Date(`${dateKey}T12:00:00+03:00`);
  if (Number.isNaN(d.getTime())) return false;
  const dayOfWeek = d.getUTCDay(); // Friday=5, Saturday=6, Sunday=0
  if (deliveryStream === 'regular') return dayOfWeek === 6 || dayOfWeek === 0;
  if (deliveryStream === 'extension') return dayOfWeek !== 6 && dayOfWeek !== 0;
  return false;
}

function gridForStudent(statuses, studentId) {
  const map = { present: 'bg-emerald-100 text-emerald-700 border-emerald-200', absent: 'bg-rose-100 text-rose-700 border-rose-200', late: 'bg-amber-100 text-amber-700 border-amber-200', excused: 'bg-sky-100 text-sky-700 border-sky-200' };
  return map[statuses[studentId] ?? ''] || 'border border-slate-100 bg-slate-50 text-slate-300';
}

export default function TeacherAttendanceMark() {
  const { assignmentId } = useParams();
  const [params, setParams] = useSearchParams();
  const initialDate = params.get('date') || todayKey();
  const initialPeriod = PERIODS.includes(params.get('period')) ? params.get('period') : 'day';
  const [date, setDate] = useState(initialDate);
  const [period, setPeriod] = useState(initialPeriod);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPeriod, setHistoryPeriod] = useState('month'); // 'month' | 'year'
  const [historyMonth, setHistoryMonth] = useState('');
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

  // Load attendance history for the grid view
  const historyQuery = useQuery({
    queryKey: ['teacher', 'attendance-history', assignmentId],
    queryFn: async () => {
      const params = { assignmentId };
      if (historyPeriod === 'month' && historyMonth) params.month = historyMonth;
      else if (historyPeriod === 'year') params.year = new Date().getFullYear();
      return (await api.get('/teacher/attendance/history', { params })).data;
    },
    enabled: historyOpen,
    staleTime: 2 * 60_000,
  });

  const students = useMemo(() => query.data?.students ?? [], [query.data?.students]);
  const session = query.data?.session;
  const canEdit = Boolean(query.data?.canEdit);
  const deliveryStream = query.data?.deliveryStream || 'regular';
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

  // Fast marking: select absent → rest become present; select excused → rest become present
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

  // Mark all absent
  const markAllAbsent = () => {
    setDraft({ key: dataKey, values: Object.fromEntries(students.map((s) => [s.id, 'absent'])) });
  };

  const setStatus = (studentId, status) => {
    setDraft((current) => {
      const values = current.key === dataKey ? current.values : baseStatuses;
      // Toggle: clicking same status clears it
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
  const finalized = session?.status === 'finalized';
  const readOnly = !canEdit;
  const allMarked = students.length > 0 && unmarked.length === 0;
  const daySkipped = isSkippableDay(date, deliveryStream);
  const canFinalize = canEdit && Boolean(session) && !dirty && allMarked && !finalized;

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        backTo="/teacher/attendance"
        eyebrow="Attendance"
        title={classTitle(assignment)}
        subtitle={`${classTitle(assignment)} · ${displayDate(date)} · ${periodLabel(period)} · ${deliveryStream === 'extension' ? 'Extension' : 'Regular'}`}
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
      ) : daySkipped ? (
        <Alert tone="warning" title="Class day skipped">
          {deliveryStream === 'regular'
            ? 'Regular programmes do not meet on weekends. This date is automatically excluded.'
            : 'Extension programmes only meet on weekends. Weekdays are skipped.'}
        </Alert>
      ) : null}

      {/* Navigation card */}
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
            {!readOnly && students.length > 0 && (
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
                <button
                  type="button"
                  onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                  className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                  title={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
                >
                  {viewMode === 'grid' ? <List className="h-4 w-4" /> : <Grid3X3 className="h-4 w-4" />}
                  {viewMode === 'grid' ? 'List' : 'Grid'}
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  <Clock3 className="h-4 w-4" />
                  History
                </button>
                <ExportMenu
                  basePath={`/teacher/attendance/${assignmentId}/export`}
                  params={{ date, period }}
                  filenamePrefix="attendance"
                  disabled={readOnly || !students.length}
                  label={<><Download className="h-4 w-4" />Export</>}
                />
              </>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Grid view */}
      {viewMode === 'grid' && students.length > 0 ? (
        <Card>
          <CardHeader
            title="Attendance grid"
            subtitle={`${students.length} students · Click cells to toggle status · Colors: green=present, red=absent, amber=late, blue=excused`}
          />
          <CardBody className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="sticky left-0 z-10 bg-white py-2 pl-3 pr-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Student
                  </th>
                  {students.slice(0, 10).map((s) => (
                    <th key={s.id} className="px-1 py-2 text-center text-[10px] font-medium text-slate-400">
                      {s.studentNumber?.slice(-3) || s.id?.slice(-3) || '?'}
                    </th>
                  ))}
                  {students.length > 10 && (
                    <th className="px-1 py-2 text-center text-[10px] font-medium text-slate-400">
                      +{students.length - 10}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((student) => (
                  <tr key={student.id}>
                    <td className="sticky left-0 z-10 bg-white py-2 pl-3 pr-2">
                      <div className="flex items-center gap-2">
                        {student.photo?.thumbnailUrl ? (
                          <img
                            src={student.photo.thumbnailUrl}
                            alt=""
                            className="h-6 w-6 rounded-full object-cover"
                          />
                        ) : (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 text-[10px] font-bold">
                            {student.name?.slice(0, 1) || 'S'}
                          </span>
                        )}
                        <span className="truncate font-medium text-slate-700">{student.name}</span>
                      </div>
                    </td>
                    {students.slice(0, 10).map((s) => (
                      <td key={s.id} className="p-1 text-center">
                        <button
                          type="button"
                          onClick={() => setStatus(student.id, DEFAULT_STATUS)}
                          className={`flex h-7 w-7 items-center justify-center rounded border transition hover:scale-110 ${gridForStudent(statuses, student.id)}`}
                          title={statuses[student.id] || 'Not marked'}
                        >
                          {(statuses[student.id] === 'present' && <CheckCircle2 className="h-3.5 w-3.5" />) ||
                            (statuses[student.id] === 'absent' && <XCircle className="h-3.5 w-3.5" />) ||
                            (statuses[student.id] === 'late' && <Clock3 className="h-3.5 w-3.5" />) ||
                            (statuses[student.id] === 'excused' && <Filter className="h-3.5 w-3.5" />) ||
                            <span className="text-slate-300">—</span>}
                        </button>
                      </td>
                    ))}
                    {students.length > 10 && (
                      <td className="p-1 text-center align-middle text-slate-400">
                        <span className="text-[10px]">…</span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[11px] text-slate-400">
              Tip: click a student's cell to toggle their status. Use "All present" to mark everyone at once, then toggle individual absences.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {/* List view (original) */}
      {viewMode === 'list' && students.length > 0 ? (
        <Card>
          <CardHeader
            title="Roster"
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
                    {readOnly ? (
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
      ) : null}

      {/* Empty state for grid/list */}
      {students.length === 0 && !query.isLoading && (
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

      {/* History modal */}
      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Attendance history"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setHistoryOpen(false)}>
              Close
            </Button>
            <ExportMenu
              basePath={`/teacher/attendance/${assignmentId}/export`}
              params={{ history: true, period: historyPeriod, month: historyMonth }}
              filenamePrefix="attendance-history"
              label={<><Download className="h-4 w-4" />Export history</>}
            />
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">View</label>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                {[
                  { key: 'month', label: 'Monthly' },
                  { key: 'year', label: 'Yearly' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setHistoryPeriod(tab.key)}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium transition ${
                      historyPeriod === tab.key
                        ? 'bg-brand-600 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            {historyPeriod === 'month' ? (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Month</label>
                <input
                  type="month"
                  value={historyMonth}
                  onChange={(e) => setHistoryMonth(e.target.value)}
                  className="focus-ring h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                />
              </div>
            ) : null}
          </div>

          {historyQuery.isLoading ? (
            <SkeletonRows rows={4} />
          ) : historyQuery.isError ? (
            <p className="text-sm text-rose-600">Could not load history.</p>
          ) : !historyQuery.data?.sessions?.length ? (
            <EmptyState title="No history found" message="No attendance sessions found for this period." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-max border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2 text-left">Date (Ethiopian)</th>
                    <th className="px-3 py-2 text-left">Period</th>
                    <th className="px-3 py-2 text-center">Present</th>
                    <th className="px-3 py-2 text-center">Absent</th>
                    <th className="px-3 py-2 text-center">Late</th>
                    <th className="px-3 py-2 text-center">Rate</th>
                    <th className="px-3 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyQuery.data.sessions.map((s) => {
                    const rate = s.total > 0 ? Math.round((s.present / s.total) * 100) : 0;
                    return (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-700">
                          {displayDate(s.dateKey)}
                          <span className="ml-2 text-slate-400">{formatEthiopian(new Date(`${s.dateKey}T12:00:00+03:00`))}</span>
                        </td>
                        <td className="px-3 py-2 text-slate-600">{periodLabel(s.period)}</td>
                        <td className="px-3 py-2 text-center text-emerald-600 font-semibold">{s.present}</td>
                        <td className="px-3 py-2 text-center text-rose-600 font-semibold">{s.absent}</td>
                        <td className="px-3 py-2 text-center text-amber-600 font-semibold">{s.late}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`font-semibold ${rate >= 80 ? 'text-emerald-600' : rate >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>
                            {rate}%
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Badge tone={s.status === 'finalized' ? 'success' : 'warning'}>{statusLabel(s.status)}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

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
