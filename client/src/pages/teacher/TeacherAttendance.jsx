import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
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
import { ArrowRight, CalendarCheck, ClipboardCheck, Clock3, Play, TrendingUp } from 'lucide-react';
import { api } from '../../lib/api';
import { displayDate, periodLabel, statusLabel, statusTone, todayKey } from '../../lib/teacher';
import ClassSelect from '../../components/teacher/ClassSelect';
import EthiopianDateField from '../../components/teacher/EthiopianDateField';
import TeacherPageHeader from '../../components/teacher/TeacherPageHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import FilterTabs from '../../components/ui/FilterTabs';
import Pagination from '../../components/ui/Pagination';
import { EmptyState, ErrorState } from '../../components/ui/StatePanel';
import { SkeletonRows } from '../../components/ui/Skeleton';

export default function TeacherAttendance() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState('all');
  const [assignmentId, setAssignmentId] = useState(params.get('assignmentId') || '');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [date, setDate] = useState(todayKey());
  const [startClass, setStartClass] = useState('');

  const classes = useQuery({
    queryKey: ['teacher', 'classes', 'options'],
    queryFn: async () => (await api.get('/teacher/courses', { params: { status: 'all', limit: 100 } })).data,
  });

  const query = useQuery({
    queryKey: ['teacher', 'attendance', { status, assignmentId, page, limit }],
    queryFn: async () =>
      (
        await api.get('/teacher/attendance', {
          params: { status, assignmentId: assignmentId || undefined, page, limit },
        })
      ).data,
    placeholderData: keepPreviousData,
  });

  const assignments = classes.data?.assignments ?? [];
  // When no CourseOfferings exist, fall back to programme-level assignments so the
  // attendance page still has something to show instead of "no active classes".
  const programmeFallback = useMemo(
    () =>
      (classes.data?.programs ?? []).map((p) => ({
        id: `prog:${p.id}`,
        program: p.code,
        programName: p.name,
        programId: p.id,
        courseCode: '',
        courseTitle: p.name,
        canManage: false,
        status: 'open',
        assessmentMode: 'numeric',
        category: 'regular',
      })),
    [classes.data?.programs],
  );
  const activeClasses =
    assignments.filter((row) => ['open', 'in_progress'].includes(row.status)) ||
    programmeFallback;
  const selectedStart = startClass || activeClasses[0]?.id || '';
  const sessions = query.data?.sessions ?? [];
  const pagination = query.data?.pagination ?? { page: 1, pages: 1, total: 0 };

  const chartData = useMemo(() => {
    return sessions.slice(0, 8).reverse().map((session) => {
      const label = displayDate(session.dateKey);
      const present = session.present ?? 0;
      const absent = session.absent ?? 0;
      const marked = session.marked ?? (present + absent);
      const rate = marked > 0 ? Math.round((present / marked) * 100) : 0;
      return {
        name: `${label} (${session.courseCode || 'Class'})`,
        present,
        absent,
        marked,
        rate,
      };
    });
  }, [sessions]);

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        eyebrow="Teaching"
        title="Attendance"
        subtitle="Mark a class, save a draft, then finalize it. Finalized sheets are locked and feed the attendance report."
      />

      <Card>
        <CardHeader
          title="Start a sheet"
          subtitle="Attendance sheets can only be started for the current day. Choose an active class below."
          icon={Play}
        />
        <CardBody>
          {activeClasses.length ? (
            <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_auto] lg:items-end">
              <ClassSelect
                assignments={activeClasses}
                value={selectedStart}
                onChange={setStartClass}
                label="Class"
              />
              <div className="flex flex-col">
                <span className="mb-1 text-xs font-medium text-slate-700">Meeting date</span>
                <div className="flex h-11 items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-700">
                  <span>{displayDate(todayKey())}</span>
                  <Badge tone="brand">Today only</Badge>
                </div>
              </div>
              <Button
                onClick={() => navigate(`/teacher/attendance/${selectedStart}?date=${todayKey()}&period=day`)}
                disabled={!selectedStart}
                className="w-full lg:w-auto"
              >
                <ClipboardCheck className="h-4 w-4" />
                Open attendance
              </Button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">You have no active classes right now, so a new attendance sheet cannot be started.</p>
          )}
        </CardBody>
      </Card>

      {chartData.length > 0 ? (
        <Card>
          <CardHeader
            title="Attendance performance"
            subtitle="Student present and absent volume alongside attendance rate percentage across recent sessions."
            icon={TrendingUp}
          />
          <CardBody>
            <div className="h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 20, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                  <ChartTooltip
                    contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '8px', fontSize: '12px' }} />
                  <Bar yAxisId="left" dataKey="present" name="Present students" fill="#10b981" radius={[4, 4, 0, 0]} animationDuration={1200} />
                  <Bar yAxisId="left" dataKey="absent" name="Absent students" fill="#f43f5e" radius={[4, 4, 0, 0]} animationDuration={1200} />
                  <Line yAxisId="right" type="monotone" dataKey="rate" name="Present rate (%)" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }} animationDuration={1500} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <FilterTabs
              label="Sheet status"
              value={status}
              onChange={(next) => {
                setStatus(next);
                setPage(1);
              }}
              tabs={[
                { key: 'all', label: 'All sheets' },
                { key: 'draft', label: 'Drafts' },
                { key: 'finalized', label: 'Finalized' },
              ]}
            />
            <div className="flex flex-wrap items-end gap-3">
              <ClassSelect
                assignments={assignments.length ? assignments : programmeFallback}
                value={assignmentId}
                allLabel="All my classes"
                label="Filter by class"
                className="min-w-[240px]"
                onChange={(value) => {
                  setAssignmentId(value);
                  setPage(1);
                  if (value) setParams({ assignmentId: value });
                  else setParams({});
                }}
              />
              <p className="pb-2 text-xs font-medium text-amber-700">
                {query.data?.draftCount ?? 0} draft{(query.data?.draftCount ?? 0) === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          {query.isError ? (
            <ErrorState message="We could not load attendance sheets." onRetry={query.refetch} />
          ) : query.isLoading ? (
            <SkeletonRows rows={6} />
          ) : !sessions.length ? (
            <EmptyState
              icon={CalendarCheck}
              title={status !== 'all' || assignmentId ? 'No sheets match these filters' : 'No attendance sheets yet'}
              message={
                status !== 'all' || assignmentId
                  ? 'Try a different class or show every sheet.'
                  : 'Start a sheet above. A draft can be edited until you finalize it.'
              }
            />
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white/70 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{session.courseCode || session.courseTitle}</p>
                      <Badge tone={statusTone(session.status)}>{statusLabel(session.status)}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {displayDate(session.dateKey)} · {periodLabel(session.period)}
                      {session.term ? ` · ${session.term}` : ''}
                    </p>
                    <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>{session.marked} marked</span>
                      <span className="text-emerald-600">{session.present} present</span>
                      <span className="text-rose-600">{session.absent} absent</span>
                      <span className="text-amber-600">{session.late} late</span>
                    </p>
                  </div>
                  <Link
                    to={`/teacher/attendance/${session.assignmentId}?date=${session.dateKey}&period=${session.period}`}
                    className="focus-ring inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    {session.status === 'draft' ? (
                      <>
                        <Clock3 className="h-3.5 w-3.5 text-amber-500" />
                        Continue
                      </>
                    ) : (
                      <>
                        View
                        <ArrowRight className="h-3.5 w-3.5" />
                      </>
                    )}
                  </Link>
                </div>
              ))}
            </div>
          )}

          {sessions.length ? (
            <Pagination
              page={pagination.page}
              pages={pagination.pages}
              total={pagination.total}
              limit={limit}
              onPage={setPage}
              onLimit={(value) => {
                setLimit(value);
                setPage(1);
              }}
            />
          ) : null}
        </CardBody>
      </Card>

      {assignmentId ? (
        <p className="text-xs text-slate-500">
          Filtered to {(assignments.find((row) => row.id === assignmentId) || programmeFallback.find((row) => row.id === assignmentId))?.courseTitle || assignmentId}.{' '}
          <button
            type="button"
            onClick={() => {
              setAssignmentId('');
              setPage(1);
              setParams({});
            }}
            className="font-semibold text-brand-600 hover:text-brand-800"
          >
            Clear filter
          </button>
        </p>
      ) : null}
    </div>
  );
}
