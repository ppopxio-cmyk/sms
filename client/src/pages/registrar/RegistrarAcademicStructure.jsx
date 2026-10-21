import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Building2, GraduationCap, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { REGISTRAR, humanStatus, levelLabel, qualificationLabel } from '../../lib/registrar';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import { ErrorState } from '../../components/ui/StatePanel';
import { SkeletonCard } from '../../components/ui/Skeleton';
import SearchInput from '../../components/ui/SearchInput';

const TABS = [
  { key: 'departments', label: 'Departments', icon: Building2 },
  { key: 'programs', label: 'Programmes', icon: GraduationCap },
  { key: 'courses', label: 'Courses', icon: BookOpen },
  { key: 'plans', label: 'Published plans', icon: ShieldCheck },
];

export default function RegistrarAcademicStructure() {
  const [tab, setTab] = useState('departments');
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: ['registrar', 'structure'],
    queryFn: async () => (await api.get(`${REGISTRAR}/academic/structure`)).data,
  });

  const term = search.trim().toLowerCase();
  const matches = (values) => !term || values.some((value) => String(value || '').toLowerCase().includes(term));

  const departments = (query.data?.departments || []).filter((row) => matches([row.code, row.name]));
  const programs = (query.data?.programs || []).filter((row) => matches([row.code, row.name, row.department?.name, row.qualificationType]));
  const courses = (query.data?.courses || []).filter((row) => matches([row.code, row.title, row.department?.name]));
  const plans = (query.data?.plans || []).filter((row) => matches([row.program?.name, row.academicYear?.label, row.title]));

  const counts = useMemo(() => ({
    departments: query.data?.departments?.length ?? 0,
    programs: query.data?.programs?.length ?? 0,
    courses: query.data?.courses?.length ?? 0,
    plans: query.data?.plans?.length ?? 0,
  }), [query.data]);

  const courseColumns = [
    { key: 'code', label: 'Code', render: (row) => <span className="font-semibold text-slate-800">{row.code}</span> },
    { key: 'title', label: 'Course title' },
    { key: 'department', label: 'Department', render: (row) => row.department ? `${row.department.code} · ${row.department.name}` : '—' },
    { key: 'credits', label: 'Credits', render: (row) => row.creditHours },
    { key: 'level', label: 'Level', render: (row) => levelLabel(row.level) },
    { key: 'status', label: 'Status', render: (row) => <Badge tone={row.active ? 'success' : 'neutral'}>{row.active ? 'Active' : 'Inactive'}</Badge> },
  ];

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Academic structure"
        subtitle="Departments, programmes and courses are college master data. The Registrar uses them but cannot reshape them here."
      />

      <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-xs leading-relaxed text-sky-900">
        <strong className="font-semibold">Read-only by design.</strong> Master records are provisioned once by the owner with the idempotent academic setup command. Curriculum plans, offerings and registrations are managed in the Registrar workspace.
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => { setTab(item.key); setSearch(''); }}
            aria-pressed={tab === item.key}
            className={`focus-ring rounded-2xl border p-4 text-left transition ${
              tab === item.key
                ? 'border-brand-200 bg-brand-50/70 shadow-sm'
                : 'border-slate-100 bg-white/70 hover:bg-white'
            }`}
          >
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tab === item.key ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>
              <item.icon className="h-4.5 w-4.5" />
            </span>
            <span className="mt-3 block text-lg font-bold text-slate-900">{query.isLoading ? '—' : counts[item.key]}</span>
            <span className="text-xs text-slate-500">{item.label}</span>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader
          title={TABS.find((item) => item.key === tab)?.label}
          subtitle="Search the records supplied by the college owner."
          icon={TABS.find((item) => item.key === tab)?.icon}
        />
        <CardBody className="space-y-4">
          <SearchInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this section" />
          {query.isLoading ? (
            <SkeletonCard lines={8} />
          ) : query.error ? (
            <ErrorState message={query.error?.response?.data?.message || 'The academic structure could not be loaded.'} onRetry={query.refetch} />
          ) : tab === 'departments' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {departments.map((row) => (
                <div key={row.id} className="rounded-2xl border border-slate-100 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{row.name}</p>
                      <p className="text-xs text-slate-500">{row.code}</p>
                    </div>
                    <Badge tone={row.active ? 'success' : 'neutral'}>{row.active ? 'Active' : 'Inactive'}</Badge>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">{row.programCount} programme{row.programCount === 1 ? '' : 's'} · {row.courseCount} course{row.courseCount === 1 ? '' : 's'}</p>
                </div>
              ))}
              {!departments.length ? <p className="text-sm text-slate-500">No department matches that search.</p> : null}
            </div>
          ) : tab === 'programs' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {programs.map((row) => (
                <div key={row.id} className="rounded-2xl border border-slate-100 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{row.name}</p>
                      <p className="text-xs text-slate-500">{row.code} · {row.department?.name || 'No department'}</p>
                    </div>
                    <Badge tone="brand">{qualificationLabel(row.qualificationType)}</Badge>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    {row.qualificationType === 'degree'
                      ? `${row.durationYears || '—'} study year${row.durationYears === 1 ? '' : 's'}`
                      : `Levels ${(row.levels || []).join(', ') || 'not set'}`}
                    {' · '}{humanStatus(row.active ? 'active' : 'inactive')}
                  </p>
                </div>
              ))}
              {!programs.length ? <p className="text-sm text-slate-500">No programme matches that search.</p> : null}
            </div>
          ) : tab === 'courses' ? (
            <div className="-mx-6 -mb-5">
              <RegistrarTable
                columns={courseColumns}
                rows={courses}
                rowKey={(row) => row.id}
                emptyTitle="No courses"
                emptyMessage="Courses will appear after the academic setup is applied."
                noResults={Boolean(term)}
              />
            </div>
          ) : (
            <div className="space-y-3">
              {plans.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 p-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{row.title || `${row.program?.name} curriculum`}</p>
                    <p className="text-xs text-slate-500">{row.program?.name} · {row.academicYear?.label} · version {row.version}</p>
                  </div>
                  <Badge tone="success">Published</Badge>
                </div>
              ))}
              {!plans.length ? <p className="text-sm text-slate-500">No curriculum plan has been published yet. Build one in Curriculum.</p> : null}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
