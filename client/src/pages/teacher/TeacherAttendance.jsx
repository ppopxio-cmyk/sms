import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ArrowRight, CalendarCheck, ClipboardCheck, Clock3, Play } from 'lucide-react';
import { api } from '../../lib/api';
import { classTitle, displayDate, periodLabel, statusLabel, statusTone, todayKey } from '../../lib/teacher';
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
  const activeClasses = assignments.filter((row) => ['open', 'in_progress'].includes(row.status));
  const selectedStart = startClass || activeClasses[0]?.id || '';
  const sessions = query.data?.sessions ?? [];
  const pagination = query.data?.pagination ?? { page: 1, pages: 1, total: 0 };

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        eyebrow="Teaching"
        title="Attendance"
        subtitle="Mark a class, save a draft, then finalize it. Finalized sheets are locked and feed the attendance report."
      />

      <Card>
        <CardHeader title="Start a sheet" subtitle="Choose one of your active classes and the meeting date." icon={Play} />
        <CardBody>
          {activeClasses.length ? (
            <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_auto] lg:items-end">
              <ClassSelect
                assignments={activeClasses}
                value={selectedStart}
                onChange={setStartClass}
                label="Class"
              />
              <EthiopianDateField label="Meeting date" value={date} max={todayKey()} onChange={setDate} />
              <Button
                onClick={() => navigate(`/teacher/attendance/${selectedStart}?date=${date}&period=day`)}
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
                assignments={assignments}
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
          Filtered to {classTitle(assignments.find((row) => row.id === assignmentId))}.{' '}
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
