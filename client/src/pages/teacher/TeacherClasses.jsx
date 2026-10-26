import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock3,
  GraduationCap,
  Layers,
  LockKeyhole,
  Users,
} from 'lucide-react';
import { api } from '../../lib/api';
import { classMeta, classTitle, statusLabel, statusTone } from '../../lib/teacher';
import { useDebounced } from '../../lib/useDebounced';
import TeacherPageHeader from '../../components/teacher/TeacherPageHeader';
import Badge from '../../components/ui/Badge';
import Card, { CardBody } from '../../components/ui/Card';
import FilterTabs from '../../components/ui/FilterTabs';
import Pagination from '../../components/ui/Pagination';
import SearchInput from '../../components/ui/SearchInput';
import { EmptyState, ErrorState } from '../../components/ui/StatePanel';
import { SkeletonRows } from '../../components/ui/Skeleton';

export default function TeacherClasses() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [program, setProgram] = useState('');
  const [category, setCategory] = useState('');
  const [batch, setBatch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const debounced = useDebounced(search);

  const query = useQuery({
    queryKey: ['teacher', 'classes', { search: debounced, status, program, batch, category, page, limit }],
    queryFn: async () =>
      (
        await api.get('/teacher/courses', {
          params: {
            search: debounced || undefined,
            status,
            program: program || undefined,
            batch: batch || undefined,
            category: category || undefined,
            page,
            limit,
          },
        })
      ).data,
    placeholderData: keepPreviousData,
  });

  const rows = query.data?.assignments ?? [];
  const programs = query.data?.programs ?? [];
  const allBatches = query.data?.batches ?? [];
  const pagination = query.data?.pagination ?? { page: 1, pages: 1, total: 0 };

  const availableBatches = useMemo(() => {
    let list = allBatches;
    if (program) {
      list = list.filter((b) => b.program === program);
    }
    if (category) {
      list = list.filter((b) => b.category === category);
    }
    const seen = new Set();
    return list.filter((b) => {
      const key = `${b.code}::${b.category}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [allBatches, program, category]);

  const groupedPrograms = useMemo(() => {
    const groups = new Map();
    for (const course of rows) {
      const progId = course.program?.id || course.program?._id || course.programCode || 'default';
      const batchId = course.batch?.id || course.batch?._id || course.batch?.code || 'default';
      const level = course.level || 1;
      const key = `${progId}-${batchId}-${level}`;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          programId: progId,
          programCode: course.program?.code || course.programCode || '',
          programName: course.program?.name || course.programName || course.program || 'Programme',
          qualificationType: course.program?.qualificationType || course.qualificationType || 'degree',
          level,
          batchCode: course.batchCode || course.batch?.code || '',
          stream: course.category || course.batch?.category || 'regular',
          courses: [],
        });
      }
      groups.get(key).courses.push(course);
    }

    return [...groups.values()].map((group) => {
      group.courses.sort((a, b) => (a.courseCode || a.course?.code || '').localeCompare(b.courseCode || b.course?.code || ''));

      let previousCompleted = true;
      const coursesWithLock = group.courses.map((course, idx) => {
        const isCompleted = course.status === 'completed';
        const isUnlocked = idx === 0 || previousCompleted;
        const lockedBy = !isUnlocked ? group.courses[idx - 1] : null;

        if (!isCompleted) {
          previousCompleted = false;
        }

        return {
          ...course,
          isUnlocked,
          lockedBy,
        };
      });

      return {
        ...group,
        courses: coursesWithLock,
      };
    });
  }, [rows]);

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        eyebrow="Teaching"
        title="My classes"
        subtitle="Only classes assigned to you by the registrar appear here. Open one for its roster, attendance, marks and materials."
      />

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <FilterTabs
                label="Class status"
                value={status}
                onChange={(next) => {
                  setStatus(next);
                  setPage(1);
                }}
                tabs={[
                  { key: 'all', label: 'All classes' },
                  { key: 'active', label: 'Active' },
                  { key: 'pending', label: 'Pending' },
                  { key: 'completed', label: 'Completed' },
                ]}
              />

              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-500">Stream:</span>
                <FilterTabs
                  label="Delivery stream"
                  value={category}
                  onChange={(next) => {
                    setCategory(next);
                    setBatch('');
                    setPage(1);
                  }}
                  tabs={[
                    { key: '', label: 'All streams' },
                    { key: 'regular', label: 'Regular' },
                    { key: 'extension', label: 'Extension' },
                  ]}
                />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_220px_200px]">
              <SearchInput
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search course, code or programme"
                loading={query.isFetching}
                className="w-full"
              />
              <select
                value={program}
                onChange={(event) => {
                  setProgram(event.target.value);
                  setBatch('');
                  setPage(1);
                }}
                className="focus-ring h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
                aria-label="Filter by programme"
              >
                <option value="">All programmes</option>
                {programs.map((row) => (
                  <option key={row.id} value={row.id}>{row.code} · {row.name}</option>
                ))}
              </select>
              <select
                value={batch}
                onChange={(event) => {
                  setBatch(event.target.value);
                  setPage(1);
                }}
                className="focus-ring h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
                aria-label="Filter by batch"
              >
                <option value="">All batches</option>
                {availableBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} ({b.category || 'regular'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {query.isError ? (
            <ErrorState message="We could not load your classes." onRetry={query.refetch} />
          ) : query.isLoading ? (
            <SkeletonRows rows={5} />
          ) : !rows.length && (status === 'completed' || status === 'active') ? (
            <EmptyState
              icon={GraduationCap}
              title={status === 'completed' ? 'No completed classes' : 'No active classes'}
              message={status === 'completed' ? 'You have no completed classes yet.' : 'You have no active classes open for teaching right now.'}
            />
          ) : !rows.length && !programs.length ? (
            <EmptyState
              icon={GraduationCap}
              title="No classes assigned yet"
              message="The registrar assigns courses to teachers. Your classes will appear here once assigned."
            />
          ) : !rows.length ? (
            // Fallback: the teacher has programme-level assignments but no course offerings yet.
            // Show the programmes as info cards so the page is never misleadingly empty.
            <div>
              <p className="mb-4 text-sm text-slate-500">
                You are assigned to <strong>{programs.length} programme{programs.length > 1 ? 's' : ''}</strong>. Course offerings will appear here once the registrar creates them.
              </p>
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {programs.map((prog) => (
                  <div key={prog.id} className="flex flex-col rounded-2xl border border-slate-100 bg-white/70 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                        <BookOpen className="h-5 w-5" />
                      </span>
                      <Badge tone="neutral">Pending</Badge>
                    </div>
                    <h2 className="mt-3 text-base font-semibold leading-snug text-slate-900">
                      {prog.code} · {prog.name}
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      {prog.qualificationType ? `${prog.qualificationType.charAt(0).toUpperCase() + prog.qualificationType.slice(1)} programme` : 'Programme'}
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                      Awaiting course offerings
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedPrograms.map((group) => {
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
                            <h2 className="text-base font-bold text-slate-900">
                              {group.programCode} · {group.programName}
                            </h2>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {durationLabel} · Batch: {group.batchCode || 'Regular'} · {group.courses.length} course{group.courses.length === 1 ? '' : 's'}
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
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {group.courses.map((course) => {
                          const assessments =
                            course.assessmentCount ??
                            Object.values(course.assessments || {}).reduce((sum, value) => sum + value, 0);

                          return (
                            <div
                              key={course.id}
                              className={`flex flex-col justify-between rounded-2xl border p-4.5 transition ${
                                !course.isUnlocked
                                  ? 'border-slate-200/60 bg-slate-50/80 opacity-80'
                                  : 'border-slate-200 bg-white shadow-sm hover:border-brand-300'
                              }`}
                            >
                              <div>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <span className="font-mono text-xs font-bold text-brand-700">
                                      {course.courseCode || course.course?.code || 'Course'}
                                    </span>
                                    <h3 className="line-clamp-2 text-sm font-semibold text-slate-900 mt-0.5">
                                      {course.courseTitle || course.course?.title || classTitle(course)}
                                    </h3>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1">
                                    {!course.isUnlocked ? (
                                      <Badge tone="neutral">
                                        <LockKeyhole className="h-3 w-3 mr-1 inline" />
                                        Locked
                                      </Badge>
                                    ) : (
                                      <Badge tone={statusTone(course.status)}>{statusLabel(course.status)}</Badge>
                                    )}
                                  </div>
                                </div>

                                {!course.isUnlocked ? (
                                  <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800 border border-amber-200/60">
                                    <LockKeyhole className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                                    <span>
                                      Complete <strong>{course.lockedBy?.courseCode || 'the previous course'}</strong> first to start this class and attendance.
                                    </span>
                                  </div>
                                ) : (
                                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
                                    <div>
                                      <p className="text-sm font-bold text-slate-800">{course.studentCount ?? 0}</p>
                                      <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-500">
                                        <Users className="h-3 w-3" /> students
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-sm font-bold text-slate-800">{assessments}</p>
                                      <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-500">
                                        <ClipboardList className="h-3 w-3" /> assessments
                                      </p>
                                    </div>
                                    <div>
                                      <p
                                        className={`text-sm font-bold ${
                                          course.attendanceDrafts ? 'text-amber-600' : 'text-slate-800'
                                        }`}
                                      >
                                        {course.attendanceDrafts ?? 0}
                                      </p>
                                      <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-500">
                                        <Clock3 className="h-3 w-3" /> drafts
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                                {course.isUnlocked ? (
                                  <>
                                    <Link
                                      to={`/teacher/classes/${course.id}`}
                                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-900"
                                    >
                                      Open class
                                      <ArrowRight className="h-3.5 w-3.5" />
                                    </Link>
                                    {course.canManage ? (
                                      <div className="flex items-center gap-1.5">
                                        <Link
                                          to={`/teacher/attendance/${course.id}`}
                                          className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition"
                                        >
                                          Attendance
                                        </Link>
                                        <Link
                                          to={`/teacher/materials?assignmentId=${course.id}`}
                                          className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 transition"
                                        >
                                          Materials
                                        </Link>
                                      </div>
                                    ) : null}
                                  </>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                                    <LockKeyhole className="h-3.5 w-3.5" />
                                    Course locked
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

          {rows.length ? (
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
    </div>
  );
}
