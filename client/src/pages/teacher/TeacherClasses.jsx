import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  ClipboardList,
  Clock3,
  GraduationCap,
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
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const debounced = useDebounced(search);

  const query = useQuery({
    queryKey: ['teacher', 'classes', { search: debounced, status, program, page, limit }],
    queryFn: async () =>
      (
        await api.get('/teacher/courses', {
          params: { search: debounced || undefined, status, program: program || undefined, page, limit },
        })
      ).data,
    placeholderData: keepPreviousData,
  });

  const rows = query.data?.assignments ?? [];
  const programs = query.data?.programs ?? [];
  const pagination = query.data?.pagination ?? { page: 1, pages: 1, total: 0 };

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        eyebrow="Teaching"
        title="My classes"
        subtitle="Only classes assigned to you by the registrar appear here. Open one for its roster, attendance, marks and materials."
      />

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
                { key: 'completed', label: 'Completed' },
              ]}
            />
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-xl">
              <select
                value={program}
                onChange={(event) => {
                  setProgram(event.target.value);
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
              <SearchInput
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search course, programme or year"
                loading={query.isFetching}
                className="w-full"
              />
            </div>
          </div>

          {query.isError ? (
            <ErrorState message="We could not load your classes." onRetry={query.refetch} />
          ) : query.isLoading ? (
            <SkeletonRows rows={5} />
          ) : !rows.length ? (
            <EmptyState
              icon={GraduationCap}
              title={search || status !== 'all' ? 'No classes match these filters' : 'No classes assigned yet'}
              message={
                search || status !== 'all'
                  ? 'Try a different search or show every class.'
                  : 'The registrar assigns courses to teachers. Your classes will appear here once assigned.'
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {rows.map((course) => {
                const assessments =
                  course.assessmentCount ?? Object.values(course.assessments || {}).reduce((sum, value) => sum + value, 0);
                return (
                  <Link
                    key={course.id}
                    to={`/teacher/classes/${course.id}`}
                    className="focus-ring group flex flex-col rounded-2xl border border-slate-100 bg-white/70 p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-900/5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                        <BookOpen className="h-5 w-5" />
                      </span>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {course.assessmentMode === 'competency' ? <Badge tone="warning">Competency</Badge> : null}
                        <Badge tone={course.canManage ? 'brand' : 'neutral'}>
                          {course.canManage ? 'My class' : 'Read-only'}
                        </Badge>
                        <Badge tone={statusTone(course.status)}>{statusLabel(course.status)}</Badge>
                      </div>
                    </div>
                    <h2 className="mt-3 line-clamp-2 text-base font-semibold leading-snug text-slate-900">{classTitle(course)}</h2>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{classMeta(course)}</p>

                    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
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
                        <p className={`text-sm font-bold ${course.attendanceDrafts ? 'text-amber-600' : 'text-slate-800'}`}>
                          {course.attendanceDrafts ?? 0}
                        </p>
                        <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-500">
                          <Clock3 className="h-3 w-3" /> drafts
                        </p>
                      </div>
                    </div>

                    <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600">
                      Open class
                      <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                    </span>
                  </Link>
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

