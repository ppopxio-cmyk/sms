import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, FileText } from 'lucide-react';
import { api } from '../../lib/api';
import { formatEthiopian } from '../../lib/ethiopianDate';
import { useDebounced } from '../../lib/useDebounced';
import ClassSelect from '../../components/teacher/ClassSelect';
import TeacherPageHeader from '../../components/teacher/TeacherPageHeader';
import Badge from '../../components/ui/Badge';
import Card, { CardBody } from '../../components/ui/Card';
import SearchInput from '../../components/ui/SearchInput';
import { EmptyState, ErrorState } from '../../components/ui/StatePanel';
import { SkeletonRows } from '../../components/ui/Skeleton';

const formatBytes = (bytes) => {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

export default function TeacherMaterials() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [assignmentId, setAssignmentId] = useState(params.get('assignmentId') || '');
  const debounced = useDebounced(search);

  const classes = useQuery({
    queryKey: ['teacher', 'classes', 'options'],
    queryFn: async () => (await api.get('/teacher/courses', { params: { status: 'all', limit: 100 } })).data,
  });

  const courseResources = useQuery({
    queryKey: ['teacher', 'course-resources', { assignmentId, search: debounced }],
    queryFn: async () =>
      (
        await api.get('/teacher/materials/course-resources', {
          params: { assignmentId: assignmentId || undefined, search: debounced || undefined },
        })
      ).data,
  });

  const assignments = classes.data?.assignments ?? [];
  const sharedFiles = courseResources.data?.resources ?? [];

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        eyebrow="Teaching"
        title="Materials"
        subtitle="Course documents shared by the registrar for your programmes and classes."
      />

      <Card>
        <CardBody className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search course documents"
              loading={courseResources.isFetching}
            />
            <ClassSelect
              assignments={assignments}
              value={assignmentId}
              allLabel="All my classes"
              label="Class"
              onChange={(value) => {
                setAssignmentId(value);
                if (value) setParams({ assignmentId: value });
                else setParams({});
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              Documents are managed by the registrar and are read-only here.
            </p>
            <Badge tone="neutral">
              {sharedFiles.length} file{sharedFiles.length === 1 ? '' : 's'}
            </Badge>
          </div>

          {courseResources.isError ? (
            <ErrorState message="We could not load course documents." onRetry={courseResources.refetch} />
          ) : courseResources.isLoading ? (
            <SkeletonRows rows={4} />
          ) : !sharedFiles.length ? (
            <EmptyState
              icon={FileText}
              title="No course documents yet"
              message="The registrar has not uploaded a PDF or Word document for these courses."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {sharedFiles.map((resource) => (
                <article key={resource.id} className="flex flex-col rounded-2xl border border-slate-100 bg-white/70 p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
                      <FileText className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {resource.courseCode || 'Course'}
                      </p>
                      <p className="truncate text-xs text-slate-500">{resource.courseName}</p>
                    </div>
                  </div>
                  <p className="mt-3 truncate text-sm text-slate-700">{resource.fileName}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatBytes(resource.bytes)}
                    {resource.program?.code ? <> &middot; {resource.program.code}</> : null}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <p className="text-[11px] text-slate-400">
                      {resource.createdAt ? formatEthiopian(new Date(resource.createdAt)) : ''}
                    </p>
                    {resource.url ? (
                      <a
                        href={resource.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="focus-ring inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold text-brand-700 hover:bg-brand-50"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open document
                      </a>
                    ) : (
                      <span className="text-[11px] text-slate-400">File unavailable</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
