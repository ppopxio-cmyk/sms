import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Download, ExternalLink, FileText, GraduationCap, Layers } from 'lucide-react';
import { api } from '../../lib/api';
import { formatEthiopian } from '../../lib/ethiopianDate';
import { useDebounced } from '../../lib/useDebounced';
import TeacherPageHeader from '../../components/teacher/TeacherPageHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card, { CardBody } from '../../components/ui/Card';
import SearchInput from '../../components/ui/SearchInput';
import { EmptyState, ErrorState } from '../../components/ui/StatePanel';
import { SkeletonRows } from '../../components/ui/Skeleton';
import FilterTabs from '../../components/ui/FilterTabs';

const formatBytes = (bytes) => {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

export default function TeacherMaterials() {
  const [params, setParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState('documents'); // 'documents' | 'curriculum'
  const [search, setSearch] = useState('');
  const [selectedProgram, setSelectedProgram] = useState(params.get('program') || '');
  const debounced = useDebounced(search);

  // Fetch teacher's assigned classes and programmes
  const classes = useQuery({
    queryKey: ['teacher', 'classes', 'options'],
    queryFn: async () => (await api.get('/teacher/courses', { params: { status: 'all', limit: 100 } })).data,
  });

  // Fetch course resources uploaded by registrar
  const courseResources = useQuery({
    queryKey: ['teacher', 'course-resources', { program: selectedProgram, search: debounced }],
    queryFn: async () =>
      (
        await api.get('/teacher/materials/course-resources', {
          params: { program: selectedProgram || undefined, search: debounced || undefined },
        })
      ).data,
  });

  // Fetch published curriculum for teacher's programmes
  const curriculumQuery = useQuery({
    queryKey: ['teacher', 'materials-curriculum'],
    queryFn: async () => (await api.get('/teacher/materials/curriculum')).data,
  });

  const teacherPrograms = useMemo(() => {
    return classes.data?.programs ?? [];
  }, [classes.data?.programs]);

  const sharedFiles = courseResources.data?.resources ?? [];
  const curriculumPlans = curriculumQuery.data?.plans ?? [];

  // Filter curriculum plans by selected programme
  const filteredPlans = useMemo(() => {
    let list = curriculumPlans;
    if (selectedProgram) {
      list = list.filter((p) => String(p.program?.id || p.program) === String(selectedProgram));
    }
    if (debounced.trim()) {
      const q = debounced.trim().toLowerCase();
      list = list.filter(
        (p) =>
          String(p.title || '').toLowerCase().includes(q) ||
          String(p.program?.code || '').toLowerCase().includes(q) ||
          (p.courses || []).some(
            (c) =>
              String(c.course?.code || '').toLowerCase().includes(q) ||
              String(c.course?.title || '').toLowerCase().includes(q),
          ),
      );
    }
    return list;
  }, [curriculumPlans, selectedProgram, debounced]);

  const programTabs = useMemo(() => {
    return [
      { key: '', label: 'All programmes' },
      ...teacherPrograms.map((p) => ({ key: p.id, label: `${p.code} · ${p.name}` })),
    ];
  }, [teacherPrograms]);

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        eyebrow="Teaching"
        title="Learning materials & curriculum"
        subtitle="Access official documents sent by the registrar and review approved curriculum plans for your programmes."
      />

      {/* Programme Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <FilterTabs
          label="Programme"
          value={selectedProgram}
          onChange={(next) => {
            setSelectedProgram(next);
            if (next) setParams({ program: next });
            else setParams({});
          }}
          tabs={programTabs}
        />
      </div>

      {/* Section Switcher Tabs: Documents vs Curriculum */}
      <div className="flex items-center gap-3 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveSection('documents')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
            activeSection === 'documents'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <FileText className="h-4 w-4" />
          Course documents
          <Badge tone={activeSection === 'documents' ? 'brand' : 'neutral'} className="ml-1">
            {sharedFiles.length}
          </Badge>
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('curriculum')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
            activeSection === 'curriculum'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          Programme curriculum
          <Badge tone={activeSection === 'curriculum' ? 'brand' : 'neutral'} className="ml-1">
            {filteredPlans.length}
          </Badge>
        </button>
      </div>

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="w-full sm:w-80">
              <SearchInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={activeSection === 'documents' ? 'Search course documents...' : 'Search curriculum plans or courses...'}
                loading={courseResources.isFetching || curriculumQuery.isFetching}
              />
            </div>
            <p className="text-xs text-slate-500">
              Official materials assigned by the registrar. Read-only.
            </p>
          </div>

          {activeSection === 'documents' ? (
            /* Documents Section */
            courseResources.isError ? (
              <ErrorState message="We could not load course documents." onRetry={courseResources.refetch} />
            ) : courseResources.isLoading ? (
              <SkeletonRows rows={4} />
            ) : !sharedFiles.length ? (
              <EmptyState
                icon={FileText}
                title="No course documents yet"
                message="The registrar has not uploaded a PDF or Word document for your assigned programmes."
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {sharedFiles.map((resource) => (
                  <article key={resource.id} className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:border-brand-200">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                          <FileText className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900">
                            {resource.courseCode || 'Course'}
                          </p>
                          <p className="truncate text-xs text-slate-500">{resource.courseName}</p>
                        </div>
                      </div>
                      <Badge tone="brand">
                        {resource.creditHours ?? 3} Cr.
                      </Badge>
                    </div>

                    <div className="mt-3 rounded-xl bg-slate-50 p-2.5">
                      <p className="truncate text-xs font-medium text-slate-700">{resource.fileName}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {formatBytes(resource.bytes)}
                        {resource.program?.code ? <> &middot; {resource.program.code} &middot; {resource.program.name}</> : null}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                      <p className="text-[11px] text-slate-400">
                        Uploaded {resource.createdAt ? formatEthiopian(new Date(resource.createdAt)) : ''}
                      </p>
                      {resource.url ? (
                        <a
                          href={resource.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download file
                        </a>
                      ) : (
                        <span className="text-[11px] text-slate-400">File unavailable</span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )
          ) : (
            /* Curriculum Section */
            curriculumQuery.isError ? (
              <ErrorState message="We could not load the curriculum plans." onRetry={curriculumQuery.refetch} />
            ) : curriculumQuery.isLoading ? (
              <SkeletonRows rows={4} />
            ) : !filteredPlans.length ? (
              <EmptyState
                icon={BookOpen}
                title="No published curriculum plans"
                message="No published curriculum plans have been assigned to your programmes yet."
              />
            ) : (
              <div className="space-y-6">
                {filteredPlans.map((plan) => (
                  <div key={plan.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-slate-900">{plan.title}</h3>
                          <Badge tone="success">Published · v{plan.version}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {plan.program?.name} ({plan.program?.code}) &middot; Academic Year: {plan.academicYear?.label}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-slate-500">
                        {plan.courses?.length ?? 0} course{plan.courses?.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div className="mt-4 divide-y divide-slate-100">
                      {(plan.courses || []).map((entry) => (
                        <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                          <div className="flex items-start gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700">
                              {entry.course?.code?.slice(0, 3) || 'CR'}
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                {entry.course?.code} &middot; {entry.course?.title}
                              </p>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                                <span>{entry.creditHours ?? entry.course?.creditHours ?? 3} Credit Hours</span>
                                {entry.level ? <span>&middot; Level {entry.level}</span> : null}
                                {entry.term ? <span>&middot; Term: {entry.term}</span> : null}
                                <span className="capitalize">&middot; {entry.category || 'Required'}</span>
                              </div>
                              {entry.prerequisites?.length ? (
                                <p className="mt-1 text-xs text-amber-700">
                                  Prerequisites: {entry.prerequisites.map((p) => p.code).join(', ')}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </CardBody>
      </Card>
    </div>
  );
}
