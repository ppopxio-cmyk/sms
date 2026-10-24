import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, Download, FileText, GraduationCap, Layers } from 'lucide-react';
import { api } from '../../lib/api';
import { REGISTRAR, humanStatus, levelLabel, qualificationLabel } from '../../lib/registrar';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import SearchInput from '../../components/ui/SearchInput';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/StatePanel';

function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function RegistrarProgramCourses() {
  const { id, programId = id } = useParams();
  const [search, setSearch] = useState('');

  const programQuery = useQuery({
    queryKey: ['registrar', 'program-detail', programId],
    queryFn: async () => (await api.get(`${REGISTRAR}/academic-structure/programs/${programId}`)).data,
    enabled: Boolean(programId),
  });

  const materialsQuery = useQuery({
    queryKey: ['registrar', 'program-materials', programId],
    queryFn: async () => (await api.get(`${REGISTRAR}/course-registration/resources`, { params: { program: programId } })).data,
    enabled: Boolean(programId),
  });

  const program = programQuery.data?.program;
  const rawCourses = programQuery.data?.courses || [];
  const materials = materialsQuery.data?.resources || [];

  // Map courses and enrich with materials
  const coursesList = useMemo(() => {
    // If we have explicit courses from programDetail
    const list = [...rawCourses];
    
    // Also include any course from materials that might not be in Course table
    const seenCodes = new Set(list.map((c) => String(c.code).toUpperCase()));
    for (const mat of materials) {
      if (mat.courseCode && !seenCodes.has(String(mat.courseCode).toUpperCase())) {
        seenCodes.add(String(mat.courseCode).toUpperCase());
        list.push({
          id: mat.id,
          code: mat.courseCode,
          title: mat.courseName,
          creditHours: mat.creditHours ?? 3,
          isFromMaterial: true,
        });
      }
    }

    return list.map((c) => {
      const codeUpper = String(c.code).toUpperCase();
      const courseMats = materials.filter(
        (m) => String(m.courseCode).toUpperCase() === codeUpper || String(m.courseName).toLowerCase() === String(c.title).toLowerCase(),
      );
      return {
        ...c,
        materials: courseMats,
      };
    });
  }, [rawCourses, materials]);

  const filteredCourses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return coursesList;
    return coursesList.filter(
      (c) =>
        String(c.code || '').toLowerCase().includes(q) ||
        String(c.title || '').toLowerCase().includes(q) ||
        (c.materials || []).some((m) => m.fileName?.toLowerCase().includes(q)),
    );
  }, [coursesList, search]);

  const columns = [
    {
      key: 'code',
      label: 'Course code',
      render: (row) => (
        <span className="font-mono text-xs font-bold text-brand-700 bg-brand-50 px-2.5 py-1 rounded-md">
          {row.code}
        </span>
      ),
    },
    {
      key: 'title',
      label: 'Course title',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-900">{row.title}</p>
          {row.description ? <p className="text-xs text-slate-500 line-clamp-1">{row.description}</p> : null}
        </div>
      ),
    },
    {
      key: 'creditHours',
      label: 'Credit hours',
      render: (row) => (
        <span className="inline-flex items-center text-xs font-semibold text-slate-700">
          {row.creditHours ?? 3} Cr.
        </span>
      ),
    },
    {
      key: 'level',
      label: 'Level / Year',
      render: (row) => (
        <span className="text-xs text-slate-600">
          {row.level ? levelLabel(row.level, program?.qualificationType) : 'All levels'}
        </span>
      ),
    },
    {
      key: 'materials',
      label: 'Course materials',
      render: (row) => {
        const mats = row.materials || [];
        if (!mats.length) {
          return <span className="text-xs text-slate-400">No documents</span>;
        }
        return (
          <div className="space-y-1">
            {mats.map((mat) => (
              <div key={mat.id} className="flex items-center gap-2">
                <a
                  href={mat.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:border-brand-300 hover:text-brand-700"
                >
                  <FileText className="h-3 w-3 text-slate-400" />
                  <span className="max-w-[140px] truncate">{mat.fileName}</span>
                  <Download className="h-3 w-3 text-slate-400" />
                </a>
              </div>
            ))}
          </div>
        );
      },
    },
  ];

  if (programQuery.isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonCard lines={6} />
      </div>
    );
  }

  if (programQuery.isError || !program) {
    return (
      <EmptyState
        title="Programme not found"
        message="The requested programme could not be located."
        action={
          <Link to="/registrar/course-registration">
            <Button variant="secondary" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to course registration
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to="/registrar/course-registration"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to course registration
        </Link>
      </div>

      <RegistrarPageHeader
        title={`${program.name} (${program.code})`}
        subtitle={`All courses, materials, and curriculum details for ${program.department?.name || 'Department'}.`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={program.active ? 'success' : 'neutral'}>
              {program.active ? 'Active programme' : 'Inactive'}
            </Badge>
            <Badge tone="brand">
              {qualificationLabel(program.qualificationType)}
            </Badge>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Department</p>
          <p className="mt-1 text-sm font-semibold text-slate-800">{program.department?.name || '—'}</p>
          <p className="text-xs text-slate-500">Code: {program.department?.code || '—'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total courses</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{coursesList.length}</p>
          <p className="text-xs text-slate-500">In this programme</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Course materials</p>
          <p className="mt-1 text-2xl font-bold text-brand-700">{materials.length}</p>
          <p className="text-xs text-slate-500">Uploaded documents</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Active students</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{programQuery.data?.studentCount ?? 0}</p>
          <p className="text-xs text-slate-500">Enrolled students</p>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Programme courses & materials</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Listing all registered courses and uploaded learning materials for {program.name}.
            </p>
          </div>
          <div className="w-72">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search courses or materials..."
            />
          </div>
        </div>

        <RegistrarTable
          columns={columns}
          rows={filteredCourses}
          loading={programQuery.isLoading || materialsQuery.isLoading}
          rowKey={(row) => row.id || row.code}
          emptyTitle="No courses registered"
          emptyMessage="No courses or learning materials have been registered for this programme yet."
          noResultsTitle="No courses match search"
          noResultsMessage="Try clearing the search term to view all programme courses."
        />
      </Card>
    </div>
  );
}

