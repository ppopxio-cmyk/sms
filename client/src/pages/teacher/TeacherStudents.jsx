import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ArrowRight, Download, GraduationCap, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { formatEthiopian } from '../../lib/ethiopianDate';
import { classTitle } from '../../lib/teacher';
import { useDebounced } from '../../lib/useDebounced';
import ClassSelect from '../../components/teacher/ClassSelect';
import TeacherPageHeader from '../../components/teacher/TeacherPageHeader';
import Badge from '../../components/ui/Badge';
import Card, { CardBody } from '../../components/ui/Card';
import FilterTabs from '../../components/ui/FilterTabs';
import Pagination from '../../components/ui/Pagination';
import SearchInput from '../../components/ui/SearchInput';
import { EmptyState, ErrorState } from '../../components/ui/StatePanel';
import { SkeletonRows } from '../../components/ui/Skeleton';

const studentSubtitle = (student) => [student.program, student.batch, student.level ? `Level ${student.level}` : ''].filter(Boolean).join(' · ');

function downloadCsv(rows, filename) {
  const headers = ['Name', 'Student ID', 'Programme', 'Batch', 'Level', 'Sex', 'Status'];
  const escape = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => [r.name, r.studentNumber, r.program, r.batch, r.level ?? '', r.sex ?? '', r.studentStatus ?? ''].map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function TeacherStudents() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status] = useState('active');
  const [program, setProgram] = useState('');
  const [assignmentId, setAssignmentId] = useState(params.get('assignmentId') || '');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const debounced = useDebounced(search);

  const classes = useQuery({
    queryKey: ['teacher', 'classes', 'options'],
    queryFn: async () => (await api.get('/teacher/courses', { params: { status: 'all', limit: 100 } })).data,
  });

  const query = useQuery({
    queryKey: ['teacher', 'students', { search: debounced, status, program, assignmentId, page, limit }],
    queryFn: async () =>
      (
        await api.get('/teacher/students', {
          params: { search: debounced || undefined, status, program: program || undefined, assignmentId: assignmentId || undefined, page, limit },
        })
      ).data,
    placeholderData: keepPreviousData,
  });

  const students = query.data?.students ?? [];
  const pagination = query.data?.pagination ?? { page: 1, pages: 1, total: 0 };
  // When no CourseOfferings exist yet, derive programme tabs from the
  // teacher's programme assignments so the page never shows "no students"
  // just because the registrar hasn't created course offerings.
  const allProgramTabs = useMemo(() => {
    const progList = classes.data?.programs ?? [];
    const assignedIds = new Set(classes.data?.assignments?.map((a) => a.programId).filter(Boolean));
    return progList.map((p) => ({
      ...p,
      label: p.code,
      value: p.id,
      _fromAssignment: assignedIds.has(p.id),
    }));
  }, [classes.data?.programs, classes.data?.assignments]);

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        eyebrow="People"
        title="My students"
        subtitle="Students registered in the classes assigned to you. Another teacher's students are never shown here."
      />

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FilterTabs
              label="Programme"
              value={program}
              onChange={(next) => {
                setProgram(next);
                setPage(1);
              }}
              tabs={[
                { key: '', label: 'All programmes' },
                ...allProgramTabs.map((p) => ({ key: p.value, label: p.label })),
              ]}
            />
            <div className="flex items-center gap-2">
              <p className="text-xs text-slate-500">{pagination.total} student{pagination.total === 1 ? '' : 's'}</p>
              <button
                type="button"
                onClick={() =>
                  downloadCsv(
                    students.map((s) => ({
                      name: s.name,
                      studentNumber: s.studentId || s.studentNumber,
                      program: s.program,
                      batch: s.batch,
                      level: s.level,
                      sex: s.sex,
                      studentStatus: s.studentStatus,
                    })),
                    `students-${formatEthiopian(new Date())}.csv`,
                  )
                }
                className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50"
                title="Export student list as CSV"
              >
                <Download className="h-3.5 w-3.5" /> Export
              </button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
            <SearchInput
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search name, student ID, programme or batch"
              loading={query.isFetching}
            />
            <ClassSelect
              assignments={classes.data?.assignments ?? []}
              value={assignmentId}
              allLabel="All my classes"
              label="Filter by class"
              onChange={(value) => {
                setAssignmentId(value);
                setPage(1);
                if (value) setParams({ assignmentId: value });
                else setParams({});
              }}
            />
          </div>

          {query.isError ? (
            <ErrorState message="We could not load your students." onRetry={query.refetch} />
          ) : query.isLoading ? (
            <SkeletonRows rows={6} />
          ) : !students.length ? (
            <EmptyState
              icon={GraduationCap}
              title={search || assignmentId ? 'No students match these filters' : 'No students registered yet'}
              message={
                search || assignmentId
                  ? 'Try a different search or show every class.'
                  : 'When the registrar registers students in your classes, their records will appear here.'
              }
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <th className="pb-3 pr-4">Student</th>
                      <th className="pb-3 pr-4">Student ID</th>
                      <th className="pb-3 pr-4">Programme</th>
                      <th className="pb-3 pr-4">Batch / level</th>
                      <th className="pb-3 pr-4">Classes</th>
                      <th className="pb-3 text-right">Open</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {students.map((student) => (
                      <tr key={student.id} className="group">
                        <td className="py-3.5 pr-4">
                          <div className="flex items-center gap-3">
                            {student.photo?.thumbnailUrl ? (
                              <img src={student.photo.thumbnailUrl} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-slate-100" />
                            ) : (
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 text-xs font-bold">
                                {student.name?.slice(0, 2)?.toUpperCase() || 'S'}
                              </span>
                            )}
                            <div>
                              <Link to={`/teacher/students/${student.id}`} className="font-semibold text-slate-800 hover:text-brand-700">
                                {student.name}
                              </Link>
                              <p className="mt-0.5 text-xs text-slate-500">{student.sex === 'unspecified' ? '' : student.sex}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 pr-4 font-mono text-xs text-slate-600">{student.studentNumber || '—'}</td>
                        <td className="py-3.5 pr-4 text-slate-600">{student.program || '—'}</td>
                        <td className="py-3.5 pr-4 text-slate-600">
                          {[student.batch, student.level ? `Level ${student.level}` : ''].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="py-3.5 pr-4">
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                            {student.classes?.length ?? 0}
                          </span>
                        </td>
                        <td className="py-3.5 text-right">
                          <Link
                            to={`/teacher/students/${student.id}`}
                            className="focus-ring inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-brand-600 transition hover:bg-brand-50"
                          >
                            View
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="space-y-2 md:hidden">
                {students.map((student) => (
                  <li key={student.id}>
                    <Link
                      to={`/teacher/students/${student.id}`}
                      className="focus-ring block rounded-2xl border border-slate-100 bg-white/75 p-4 transition hover:bg-white"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{student.name}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{student.studentNumber || 'No student ID'}</p>
                        </div>
                        <Badge tone="neutral">{student.classes?.length ?? 0} classes</Badge>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">{studentSubtitle(student) || 'Programme not recorded'}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          {students.length ? (
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
        <p className="inline-flex items-center gap-2 text-xs text-slate-500">
          <Users className="h-3.5 w-3.5" />
          Showing only students in {classTitle(classes.data?.assignments?.find((row) => row.id === assignmentId))}.
          <button
            type="button"
            onClick={() => {
              setAssignmentId('');
              setPage(1);
              setParams({});
            }}
            className="font-semibold text-brand-600 hover:text-brand-800"
          >
            Clear
          </button>
        </p>
      ) : null}
    </div>
  );
}
