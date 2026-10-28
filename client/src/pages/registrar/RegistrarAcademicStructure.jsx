import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, BookOpen, Building2, GraduationCap, Pencil, Plus, RotateCcw, Search, ShieldCheck, Trash2, UserRoundCheck } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { REGISTRAR, humanStatus, levelLabel, qualificationLabel } from '../../lib/registrar';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import ConfirmDialog from '../../components/registrar/ConfirmDialog';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import Modal from '../../components/ui/Modal';
import { ErrorState } from '../../components/ui/StatePanel';
import { SkeletonCard } from '../../components/ui/Skeleton';
import SearchInput from '../../components/ui/SearchInput';
import { FormGrid, SelectField, TextAreaField } from '../../components/registrar/Fields';

const TABS = [
  { key: 'departments', label: 'Departments', icon: Building2 },
  { key: 'programs', label: 'Programmes', icon: GraduationCap },
  { key: 'courses', label: 'Courses', icon: BookOpen },
  { key: 'plans', label: 'Published plans', icon: ShieldCheck },
];

const QUALIFICATIONS = [
  { value: 'degree', label: 'Degree' },
  { value: 'diploma', label: 'Diploma' },
  { value: 'short-term', label: 'Short-term' },
];

const blankDepartment = () => ({ code: '', name: '', description: '' });

const blankProgram = () => ({
  code: '',
  name: '',
  department: '',
  qualificationType: 'degree',
  categories: ['regular', 'extension'],
  durationYears: 4,
  levels: [1, 2, 3, 4],
  shortTerm: { duration: 12, unit: 'weeks' },
  capacity: '',
  teachers: [],
  academicYears: [],
  description: '',
  active: true,
});

function programToForm(row, departmentId = '') {
  if (!row) return { ...blankProgram(), department: departmentId };
  return {
    ...blankProgram(),
    code: row.code || '',
    name: row.name || '',
    department: row.department?.id || row.department || '',
    qualificationType: row.qualificationType || 'degree',
    categories: row.categories?.length ? row.categories : ['regular', 'extension'],
    durationYears: row.durationYears || '',
    levels: row.levels?.length ? row.levels : [1, 2, 3, 4],
    shortTerm: row.shortTerm?.duration ? row.shortTerm : { duration: 12, unit: 'weeks' },
    capacity: row.capacity ?? '',
    teachers: (row.teachers || []).map((teacher) => teacher.id || String(teacher)),
    academicYears: (row.academicYears || []).map((y) => y.id || String(y)),
    description: row.description || '',
    active: row.active !== false,
  };
}

function programPayload(form) {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    department: form.department,
    qualificationType: form.qualificationType,
    categories: form.categories,
    durationYears: form.qualificationType === 'degree' ? Number(form.durationYears) || undefined : null,
    levels: form.qualificationType === 'diploma' ? form.levels : undefined,
    shortTerm: form.qualificationType === 'short-term'
      ? { duration: Number(form.shortTerm.duration) || undefined, unit: form.shortTerm.unit }
      : null,
    capacity: form.capacity === '' ? null : Number(form.capacity),
    teachers: form.teachers,
    academicYears: form.academicYears || [],
    description: form.description.trim(),
    active: Boolean(form.active),
  };
}

export default function RegistrarAcademicStructure({ defaultTab = 'departments' }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(defaultTab);
  const [search, setSearch] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedProg, setSelectedProg] = useState('');
  const [appliedFilters, setAppliedFilters] = useState(null);
  const [departmentModal, setDepartmentModal] = useState(null);
  const [programModal, setProgramModal] = useState(null);
  const [assignModal, setAssignModal] = useState(null);
  const [courseModal, setCourseModal] = useState(false);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    if (defaultTab) {
      setTab(defaultTab);
    }
  }, [defaultTab]);

  const query = useQuery({
    queryKey: ['registrar', 'structure'],
    queryFn: async () => (await api.get(`${REGISTRAR}/academic-structure`)).data,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['registrar', 'structure'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'students', 'options'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'batches'] });
  };

  const remove = useMutation({
    mutationFn: async () => (
      await api.request({
        url: `${REGISTRAR}/academic-structure/${deleting.type === 'department' ? 'departments' : 'programs'}/${deleting.row.id}`,
        method: 'delete',
      })
    ).data,
    onSuccess: () => {
      toast.success(deleting.type === 'department' ? 'Department deleted.' : 'Programme deleted.');
      setDeleting(null);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, 'The record could not be deleted.')),
  });

  const toggleProgram = useMutation({
    mutationFn: async (row) => (await api.patch(`${REGISTRAR}/academic-structure/programs/${row.id}`, { active: !row.active })).data,
    onSuccess: (data) => {
      toast.success(data.program?.active ? 'Programme activated.' : 'Programme inactivated.');
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, 'The programme could not be updated.')),
  });

  const assignTeachers = useMutation({
    mutationFn: async ({ row, teacherIds }) =>
      (await api.patch(`${REGISTRAR}/academic-structure/programs/${row.id}`, { teachers: teacherIds })).data,
    onSuccess: (data, variables) => {
      toast.success(`${variables.row.name} teachers updated.`);
      setAssignModal(null);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, 'The teacher assignment could not be saved.')),
  });

  const term = search.trim().toLowerCase();
  const matches = (values) => !term || values.some((value) => String(value || '').toLowerCase().includes(term));

  const allBatches = query.data?.batches || [];
  const rawDepartments = query.data?.departments || [];
  const rawPrograms = query.data?.programs || [];
  const rawCourses = query.data?.courses || [];
  const rawPlans = query.data?.plans || [];

  const uniqueBatches = useMemo(() => {
    const map = new Map();
    for (const b of allBatches) {
      const key = `${b.code}::${b.category || 'regular'}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          code: b.code,
          category: b.category || 'regular',
          programs: b.program ? [b.program] : [],
        });
      } else {
        const item = map.get(key);
        if (b.program && !item.programs.includes(b.program)) {
          item.programs.push(b.program);
        }
      }
    }
    return Array.from(map.values());
  }, [allBatches]);

  const selectedBatchGroup = useMemo(() => {
    if (!selectedBatch) return null;
    return uniqueBatches.find((b) => b.key === selectedBatch || b.code === selectedBatch);
  }, [uniqueBatches, selectedBatch]);

  const batchProgIds = selectedBatchGroup ? selectedBatchGroup.programs : [];

  const availableDepartments = useMemo(() => {
    if (!selectedBatchGroup || batchProgIds.length === 0) return rawDepartments;
    const progsInBatch = rawPrograms.filter((p) => batchProgIds.includes(p.id));
    const deptIds = new Set(progsInBatch.map((p) => String(p.department?.id || p.department)));
    return rawDepartments.filter((d) => deptIds.has(String(d.id)));
  }, [rawDepartments, rawPrograms, batchProgIds, selectedBatchGroup]);

  const programsInSelectedDept = useMemo(() => {
    if (!selectedDept) return [];
    return rawPrograms.filter((p) => {
      const matchDept = String(p.department?.id || p.department) === String(selectedDept);
      const matchBatch = batchProgIds.length === 0 || batchProgIds.includes(p.id);
      return matchDept && matchBatch;
    });
  }, [rawPrograms, selectedDept, batchProgIds]);

  const activeBatchGroup = useMemo(() => {
    if (!appliedFilters?.batch) return null;
    return uniqueBatches.find((b) => b.key === appliedFilters.batch || b.code === appliedFilters.batch);
  }, [uniqueBatches, appliedFilters]);

  const activeBatchProgIds = activeBatchGroup ? activeBatchGroup.programs : [];

  const departments = useMemo(() => {
    if (!appliedFilters) return [];
    return rawDepartments.filter((row) => {
      if (appliedFilters.department && String(row.id) !== String(appliedFilters.department)) return false;
      if (activeBatchProgIds.length > 0) {
        const progsInBatch = rawPrograms.filter((p) => activeBatchProgIds.includes(p.id));
        const hasDept = progsInBatch.some((p) => String(p.department?.id || p.department) === String(row.id));
        if (!hasDept) return false;
      }
      return matches([row.code, row.name]);
    });
  }, [rawDepartments, rawPrograms, activeBatchProgIds, appliedFilters, term]);

  const programs = useMemo(() => {
    if (!appliedFilters) return [];
    return rawPrograms.filter((row) => {
      if (appliedFilters.department && String(row.department?.id || row.department) !== String(appliedFilters.department)) return false;
      if (appliedFilters.program && String(row.id) !== String(appliedFilters.program)) return false;
      if (activeBatchProgIds.length > 0 && !activeBatchProgIds.includes(row.id)) return false;
      return matches([row.code, row.name, row.department?.name, row.qualificationType, ...(row.categories || [])]);
    });
  }, [rawPrograms, activeBatchProgIds, appliedFilters, term]);

  const courses = useMemo(() => {
    if (!appliedFilters) return [];
    return rawCourses.filter((row) => {
      if (appliedFilters.department && String(row.department?.id || row.department) !== String(appliedFilters.department)) return false;
      if (appliedFilters.program && String(row.program?.id || row.program) !== String(appliedFilters.program)) return false;
      if (activeBatchProgIds.length > 0 && row.program && !activeBatchProgIds.includes(row.program?.id || row.program)) return false;
      return matches([row.code, row.title, row.department?.name]);
    });
  }, [rawCourses, activeBatchProgIds, appliedFilters, term]);

  const plans = useMemo(() => {
    if (!appliedFilters) return [];
    return rawPlans.filter((row) => {
      if (appliedFilters.program && String(row.program?.id || row.program) !== String(appliedFilters.program)) return false;
      return matches([row.program?.name, row.academicYear?.label, row.title]);
    });
  }, [rawPlans, appliedFilters, term]);

  const counts = useMemo(() => ({
    departments: departments.length,
    programs: programs.length,
    courses: courses.length,
    plans: plans.length,
  }), [departments.length, programs.length, courses.length, plans.length]);

  const appliedBatchDoc = useMemo(
    () => uniqueBatches.find((b) => b.key === appliedFilters?.batch),
    [uniqueBatches, appliedFilters],
  );
  const appliedDeptDoc = useMemo(
    () => rawDepartments.find((d) => String(d.id) === String(appliedFilters?.department)),
    [rawDepartments, appliedFilters],
  );
  const appliedProgDoc = useMemo(
    () => rawPrograms.find((p) => String(p.id) === String(appliedFilters?.program)),
    [rawPrograms, appliedFilters],
  );

  const courseColumns = [
    { key: 'code', label: 'Code', render: (row) => <span className="font-semibold text-slate-800">{row.code}</span> },
    { key: 'title', label: 'Course title' },
    { key: 'department', label: 'Department', render: (row) => row.department ? `${row.department.code} · ${row.department.name}` : '—' },
    { key: 'credits', label: 'Credits', render: (row) => row.creditHours },
    { key: 'status', label: 'Status', render: (row) => <Badge tone={row.active ? 'success' : 'neutral'}>{row.active ? 'Active' : 'Inactive'}</Badge> },
  ];

  const canAdd = tab === 'departments' || tab === 'programs';

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Academic structure"
        subtitle="Departments, programmes and their regular/extension streams are college master data. Changes are audited and immediately available to batches and admissions."
        actions={
          canAdd ? (
            <Button
              onClick={() => (tab === 'departments' ? setDepartmentModal({ row: null }) : setProgramModal({ row: null }))}
              className="gap-2"
            >
              <Plus className="h-4 w-4" /> {tab === 'departments' ? 'New department' : 'New programme'}
            </Button>
          ) : null
        }
      />

      {/* Cascaded Filter Dropdowns (Strictly Batch, Department, Programme, matching Results page) */}
      <Card>
        <CardBody className="p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 items-end">
            <SelectField
              label="1. Batch"
              value={selectedBatch}
              onChange={(e) => {
                setSelectedBatch(e.target.value);
                setSelectedDept('');
                setSelectedProg('');
                setAppliedFilters(null);
              }}
              required
            >
              <option value="">Choose batch...</option>
              {uniqueBatches.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.code} ({b.category || 'regular'})
                </option>
              ))}
            </SelectField>

            <SelectField
              label="2. Department"
              value={selectedDept}
              onChange={(e) => {
                setSelectedDept(e.target.value);
                setSelectedProg('');
                setAppliedFilters(null);
              }}
              disabled={!selectedBatch}
              required
            >
              <option value="">Choose department...</option>
              {availableDepartments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} · {d.name}
                </option>
              ))}
            </SelectField>

            <SelectField
              label="3. Programme"
              value={selectedProg}
              onChange={(e) => {
                setSelectedProg(e.target.value);
                setAppliedFilters(null);
              }}
              disabled={!selectedDept}
              required
            >
              <option value="">Choose programme...</option>
              {programsInSelectedDept.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </SelectField>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Select Batch, Department, and Programme above, then click Show to display academic records.
            </p>
            <div className="flex items-center gap-2">
              {(selectedBatch || selectedDept || selectedProg || appliedFilters) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedBatch('');
                    setSelectedDept('');
                    setSelectedProg('');
                    setAppliedFilters(null);
                  }}
                  className="gap-1.5 text-xs text-slate-600"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </Button>
              )}
              <Button
                onClick={() => {
                  if (!selectedBatch || !selectedDept || !selectedProg) {
                    toast.error('Please choose Batch, Department, and Programme.');
                    return;
                  }
                  setAppliedFilters({
                    batch: selectedBatch,
                    department: selectedDept,
                    program: selectedProg,
                  });
                }}
                disabled={!selectedBatch || !selectedDept || !selectedProg}
                className="gap-2 bg-brand-600 hover:bg-brand-700 text-white"
              >
                <Search className="h-4 w-4" /> Show
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {!appliedFilters ? (
        <Card>
          <CardBody className="py-12 text-center">
            <GraduationCap className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-3 text-sm font-semibold text-slate-800">Select Batch, Department &amp; Programme</h3>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              Choose an active batch, department, and programme above, then click <strong>Show</strong> to display academic structure records.
            </p>
          </CardBody>
        </Card>
      ) : (
        <>
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
              subtitle={tab === 'departments' ? 'Edit a department, or add a programme directly from its card.' : tab === 'programs' ? 'Programmes belong to a department, track durations & levels, and assign teachers with workload checks.' : tab === 'courses' ? 'Catalogue of courses offered across programmes.' : 'Master records supplied by the college owner.'}
              icon={TABS.find((item) => item.key === tab)?.icon}
              action={tab === 'courses' ? <Button size="sm" onClick={() => setCourseModal(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Add course</Button> : null}
            />
            <CardBody className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50 border border-slate-200/60 rounded-xl px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-slate-700">
                  <span className="font-semibold text-slate-500">Filtered by:</span>
                  <Badge tone="indigo">{appliedBatchDoc ? `${appliedBatchDoc.code} (${appliedBatchDoc.category})` : 'Batch'}</Badge>
                  <span className="text-slate-300">/</span>
                  <Badge tone="brand">{appliedDeptDoc ? `${appliedDeptDoc.code} · ${appliedDeptDoc.name}` : 'Department'}</Badge>
                  <span className="text-slate-300">/</span>
                  <Badge tone="success">{appliedProgDoc ? `${appliedProgDoc.code} · ${appliedProgDoc.name}` : 'Programme'}</Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedBatch('');
                    setSelectedDept('');
                    setSelectedProg('');
                    setAppliedFilters(null);
                  }}
                  className="h-7 text-xs gap-1 text-slate-600"
                >
                  <RotateCcw className="h-3 w-3" /> Change Filter
                </Button>
              </div>

          <SearchInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by code, title or department..." />
          {query.isLoading ? (
            <SkeletonCard lines={8} />
          ) : query.error ? (
            <ErrorState message={query.error?.response?.data?.message || 'The academic structure could not be loaded.'} onRetry={query.refetch} />
          ) : tab === 'departments' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {departments.map((row) => (
                <div key={row.id} className="rounded-2xl border border-slate-100 p-4 bg-white shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{row.name}</p>
                      <p className="text-xs text-slate-500">{row.code}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge tone={row.active ? 'success' : 'neutral'}>{row.active ? 'Active' : 'Inactive'}</Badge>
                      <button
                        type="button"
                        aria-label={`Add programme to ${row.name}`}
                        title="Add programme to this department"
                        className="focus-ring inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                        onClick={() => setProgramModal({ row: null, departmentId: row.id })}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add programme
                      </button>
                      <button type="button" aria-label={`Edit ${row.name}`} className="focus-ring rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => setDepartmentModal({ row })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" aria-label={`Delete ${row.name}`} className="focus-ring rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setDeleting({ type: 'department', row })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {row.description ? <p className="mt-2 text-xs leading-relaxed text-slate-500">{row.description}</p> : null}
                  <p className="mt-3 text-xs text-slate-500">{row.programCount} programme{row.programCount === 1 ? '' : 's'} · {row.courseCount} course{row.courseCount === 1 ? '' : 's'}</p>
                  <Link
                    to={`${REGISTRAR}/academic-structure/departments/${row.id}`}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-800"
                  >
                    View programmes <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              ))}
              {!departments.length ? <p className="text-sm text-slate-500">No department matches that search.</p> : null}
            </div>
          ) : tab === 'programs' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {programs.map((row) => (
                <div key={row.id} className="rounded-2xl border border-slate-100 p-4 bg-white shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-brand-700">{row.code}</span>
                        <Badge tone={row.active ? 'success' : 'neutral'}>{row.active ? 'Active' : 'Inactive'}</Badge>
                      </div>
                      <p className="text-sm font-semibold text-slate-900 mt-0.5">{row.name}</p>
                      <p className="text-xs text-slate-500">{row.department?.name || 'No department'}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge tone="brand">{qualificationLabel(row.qualificationType)}</Badge>
                      <button type="button" aria-label={`Edit ${row.name}`} className="focus-ring rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => setProgramModal({ row })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" aria-label={`Delete ${row.name}`} className="focus-ring rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setDeleting({ type: 'program', row })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl bg-slate-50 p-2.5 text-xs text-slate-700 space-y-1">
                    <p className="font-semibold text-slate-800">
                      Duration: <span className="text-brand-700">{row.durationSummary || `${row.durationYears || '—'} study years`}</span>
                    </p>
                    <p className="text-slate-500">
                      Capacity: {row.capacity ? `${row.capacity} students` : 'No limit set'}
                      {(row.batches || []).length ? ` · Batches: ${[...new Set((row.batches || []).map((b) => b.code))].join(', ')}` : ''}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(row.categories || ['regular', 'extension']).map((category) => (
                      <Badge key={category} tone={category === 'extension' ? 'warning' : 'neutral'}>{humanStatus(category)}</Badge>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <p className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0 truncate max-w-[240px]">
                      <UserRoundCheck className="h-3.5 w-3.5 shrink-0" />
                      {(row.teachers || []).length
                        ? (row.teachers || []).map((t) => `${t.name} (${t.workload?.regular ?? 0}/2R·${t.workload?.extension ?? 0}/1E)`).join(', ')
                        : 'No teachers assigned'}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Link
                        to={`${REGISTRAR}/academic-structure/programs/${row.id}`}
                        className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                      >
                        View details
                      </Link>
                      <button
                        type="button"
                        onClick={() => setAssignModal({ row })}
                        className="focus-ring rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-700"
                        aria-label={`Assign teachers to ${row.name}`}
                        title="Assign teachers"
                      >
                        <UserRoundCheck className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleProgram.mutate(row)}
                        disabled={toggleProgram.isPending}
                        className="focus-ring rounded-lg text-xs font-semibold text-brand-700 hover:underline disabled:opacity-50"
                      >
                        {row.active ? 'Inactivate' : 'Activate'}
                      </button>
                    </div>
                  </div>
                  {!row.active ? <p className="mt-2 text-xs font-medium text-amber-700">Inactive programmes cannot receive new batches or admissions.</p> : null}
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
    </>
  )}

      <DepartmentModal
        open={Boolean(departmentModal)}
        row={departmentModal?.row}
        onClose={() => setDepartmentModal(null)}
        onSaved={invalidate}
      />
      <ProgramModal
        open={Boolean(programModal)}
        row={programModal?.row}
        departmentId={programModal?.departmentId}
        departments={query.data?.departments || []}
        teachers={query.data?.teachers || []}
        academicYears={query.data?.academicYears || []}
        onClose={() => setProgramModal(null)}
        onSaved={invalidate}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title={deleting?.type === 'department' ? 'Delete department?' : 'Delete programme?'}
        message={deleting?.type === 'department'
          ? `${deleting.row.name} will be permanently removed. Departments with programmes, courses, batches or students cannot be deleted.`
          : `${deleting?.row?.name} will be permanently removed. Programmes with batches, students, plans or offerings must be inactivated instead.`}
        confirmLabel="Delete permanently"
        tone="danger"
        loading={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate()}
      />
      <AssignTeachersModal
        open={Boolean(assignModal)}
        row={assignModal?.row}
        teachers={query.data?.teachers || []}
        onClose={() => setAssignModal(null)}
        onSaved={assignTeachers.mutate}
      />
      <StructureCourseModal
        open={Boolean(courseModal)}
        departments={query.data?.departments || []}
        programs={query.data?.programs || []}
        onClose={() => setCourseModal(false)}
        onSaved={invalidate}
      />
    </div>
  );
}

function StructureCourseModal({ open, departments, programs, onClose, onSaved }) {
  const [form, setForm] = useState({ code: '', title: '', department: '', program: '', creditHours: 3 });
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm({ code: '', title: '', department: departments[0]?.id || '', program: '', creditHours: 3 });
      setError('');
    }
  }, [open, departments]);

  const filteredPrograms = useMemo(() => {
    if (!form.department) return programs;
    return programs.filter((p) => String(p.department?.id || p.department) === String(form.department));
  }, [programs, form.department]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.code.trim() || !form.title.trim()) throw new Error('Code and title are required.');
      return (await api.post(`${REGISTRAR}/academic-structure/courses`, {
        code: form.code.trim().toUpperCase(),
        title: form.title.trim(),
        creditHours: Number(form.creditHours) || 3,
        department: form.department || undefined,
        program: form.program || undefined,
      })).data;
    },
    onSuccess: () => {
      toast.success('Course created.');
      onSaved?.();
      onClose?.();
    },
    onError: (err) => {
      const msg = errorMessage(err, 'The course could not be created.');
      setError(msg);
      toast.error(msg);
    },
  });

  return (
    <Modal
      open={open}
      title="Add new course"
      subtitle="Create a course in the institutional catalogue."
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      footer={<><Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending}>Create course</Button></>}
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        <FormGrid>
          <Field label="Course code" value={form.code} onChange={(e) => setForm((c) => ({ ...c, code: e.target.value.toUpperCase() }))} placeholder="e.g. CS-101" required />
          <Field label="Course title" value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} placeholder="e.g. Introduction to Programming" required />
          <SelectField label="Department" value={form.department} onChange={(e) => setForm((c) => ({ ...c, department: e.target.value, program: '' }))} required>
            <option value="">Choose department</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.code} · {d.name}</option>)}
          </SelectField>
          <SelectField label="Programme (optional)" value={form.program} onChange={(e) => setForm((c) => ({ ...c, program: e.target.value }))}>
            <option value="">Institutional / General</option>
            {filteredPrograms.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </SelectField>
          <Field label="Credit hours" type="number" min="0.5" max="30" step="0.5" value={form.creditHours} onChange={(e) => setForm((c) => ({ ...c, creditHours: e.target.value }))} required />
        </FormGrid>
      </div>
    </Modal>
  );
}

function AssignTeachersModal({ open, row, teachers, onClose, onSaved }) {
  const [selected, setSelected] = useState(
    (row?.teachers || []).map((teacher) => teacher.id || String(teacher)),
  );

  useEffect(() => {
    if (open && row) {
      setSelected((row.teachers || []).map((teacher) => teacher.id || String(teacher)));
    }
  }, [open, row]);

  const rowCategories = row?.categories || ['regular'];

  const toggle = (teacher) => {
    const isCurrentlySelected = selected.includes(teacher.id);
    if (!isCurrentlySelected) {
      const reg = teacher.workload?.regular ?? 0;
      const ext = teacher.workload?.extension ?? 0;
      if (rowCategories.includes('regular') && reg >= 2) {
        toast.error(`Teacher ${teacher.name} has already reached the maximum of 2 regular classes/programmes.`);
        return;
      }
      if (rowCategories.includes('extension') && ext >= 1) {
        toast.error(`Teacher ${teacher.name} has already reached the maximum of 1 extension class/programme.`);
        return;
      }
    }
    setSelected((current) =>
      current.includes(teacher.id)
        ? current.filter((id) => id !== teacher.id)
        : [...current, teacher.id],
    );
  };

  return (
    <Modal
      open={open}
      title={row ? `Assign teachers to ${row.name}` : 'Assign teachers'}
      subtitle={`Workload limit: max 2 regular classes, 1 extension class. Programme streams: ${rowCategories.join(', ')}`}
      size="md"
      onClose={onClose}
      dismissible
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSaved?.({ row, teacherIds: selected })} className="gap-2">
            <UserRoundCheck className="h-4 w-4" /> Save teachers
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          A teacher can only be assigned to a maximum of <strong>2 regular</strong> programmes/classes and <strong>1 extension</strong> programme/class.
        </p>
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-slate-100 p-2">
          {teachers.map((teacher) => {
            const isAssigned = selected.includes(teacher.id);
            const reg = teacher.workload?.regular ?? 0;
            const ext = teacher.workload?.extension ?? 0;
            const isRegFull = rowCategories.includes('regular') && reg >= 2;
            const isExtFull = rowCategories.includes('extension') && ext >= 1;
            const isFull = (isRegFull || isExtFull) && !isAssigned;

            return (
              <label
                key={teacher.id}
                className={`flex cursor-pointer items-center justify-between gap-2.5 rounded-lg px-2 py-2 text-sm ${
                  isFull ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    checked={isAssigned}
                    disabled={isFull}
                    onChange={() => toggle(teacher)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {teacher.name} <span className="text-xs text-slate-400">{teacher.email}</span>
                  </span>
                </div>
                <span className="shrink-0 font-mono text-xs text-slate-500">
                  {reg}/2 Reg · {ext}/1 Ext
                  {isFull && <span className="ml-1 text-rose-600 font-bold">(Full)</span>}
                </span>
              </label>
            );
          })}
          {!teachers.length ? <p className="px-2 py-3 text-sm text-slate-500">No active teacher accounts exist yet.</p> : null}
        </div>
        <p className="text-xs text-slate-500">{selected.length} teacher{selected.length === 1 ? '' : 's'} selected.</p>
      </div>
    </Modal>
  );
}

function DepartmentModal({ open, row, onClose, onSaved }) {
  const [form, setForm] = useState(blankDepartment);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(row ? { code: row.code || '', name: row.name || '', description: row.description || '' } : blankDepartment());
  }, [open, row]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.code.trim() || !form.name.trim()) throw new Error('Code and name are required.');
      return (await api.request({
        url: `${REGISTRAR}/academic-structure/departments${row ? `/${row.id}` : ''}`,
        method: row ? 'patch' : 'post',
        data: {
          code: form.code.trim(),
          name: form.name.trim(),
          description: form.description.trim(),
        },
      })).data;
    },
    onSuccess: () => {
      toast.success(row ? 'Department updated.' : 'Department created. Add its first programme from the department card.');
      onSaved?.();
      onClose?.();
    },
    onError: (err) => {
      const message = errorMessage(err, 'The department could not be saved.');
      setError(message);
      toast.error(message);
    },
  });

  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  return (
    <Modal
      open={open}
      title={row ? 'Edit department' : 'New department'}
      subtitle="The code is used on official student numbers and reports. Programmes are added from the department card after it is created."
      size="lg"
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      footer={<><Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending}>{row ? 'Save changes' : 'Create department'}</Button></>}
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        <FormGrid>
          <Field label="Department code" value={form.code} onChange={(event) => set('code', event.target.value)} placeholder="e.g. CS" required />
          <Field label="Department name" value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="e.g. Computer Science" required />
          <TextAreaField className="sm:col-span-2" label="Description" rows={3} value={form.description} onChange={(event) => set('description', event.target.value)} />
        </FormGrid>
      </div>
    </Modal>
  );
}

function ProgramModal({ open, row, departmentId, departments, teachers, academicYears = [], onClose, onSaved }) {
  const [form, setForm] = useState(blankProgram);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(programToForm(row, departmentId));
  }, [open, row, departmentId]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.code.trim() || !form.name.trim() || !form.department) {
        throw new Error('Code, name and department are required.');
      }
      if (!form.categories.length) throw new Error('Choose at least one regular/extension stream.');

      // Check teacher workloads
      for (const tid of form.teachers) {
        const t = teachers.find((x) => x.id === tid);
        if (t && !(row?.teachers || []).some((x) => (x.id || x) === tid)) {
          const reg = t.workload?.regular ?? 0;
          const ext = t.workload?.extension ?? 0;
          if (form.categories.includes('regular') && reg >= 2) {
            throw new Error(`Teacher ${t.name} has already reached the maximum of 2 regular classes/programmes.`);
          }
          if (form.categories.includes('extension') && ext >= 1) {
            throw new Error(`Teacher ${t.name} has already reached the maximum of 1 extension class/programme.`);
          }
        }
      }

      return (await api.request({
        url: `${REGISTRAR}/academic-structure/programs${row ? `/${row.id}` : ''}`,
        method: row ? 'patch' : 'post',
        data: programPayload(form),
      })).data;
    },
    onSuccess: () => {
      toast.success(row ? 'Programme updated.' : 'Programme created.');
      onSaved?.();
      onClose?.();
    },
    onError: (err) => {
      const message = errorMessage(err, 'The programme could not be saved.');
      setError(message);
      toast.error(message);
    },
  });

  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const toggleCategory = (category) => setForm((current) => ({
    ...current,
    categories: current.categories.includes(category)
      ? current.categories.filter((value) => value !== category)
      : [...current.categories, category],
  }));
  const toggleLevel = (level) => setForm((current) => ({
    ...current,
    levels: current.levels.includes(level)
      ? current.levels.filter((value) => value !== level)
      : [...current.levels, level].sort((a, b) => a - b),
  }));
  const toggleTeacher = (teacher) => {
    const isCurrentlySelected = form.teachers.includes(teacher.id);
    if (!isCurrentlySelected) {
      const reg = teacher.workload?.regular ?? 0;
      const ext = teacher.workload?.extension ?? 0;
      if (form.categories.includes('regular') && reg >= 2) {
        toast.error(`Teacher ${teacher.name} cannot be assigned: maximum limit of 2 regular programmes reached.`);
        return;
      }
      if (form.categories.includes('extension') && ext >= 1) {
        toast.error(`Teacher ${teacher.name} cannot be assigned: maximum limit of 1 extension programme reached.`);
        return;
      }
    }
    setForm((current) => ({
      ...current,
      teachers: isCurrentlySelected
        ? current.teachers.filter((value) => value !== teacher.id)
        : [...current.teachers, teacher.id],
    }));
  };
  const toggleAcademicYear = (yearId) => setForm((current) => ({
    ...current,
    academicYears: current.academicYears.includes(yearId)
      ? current.academicYears.filter((value) => value !== yearId)
      : [...current.academicYears, yearId],
  }));

  const activeAndPlannedYears = useMemo(() => {
    return (academicYears || []).filter((y) => y.status === 'active' || y.status === 'planned');
  }, [academicYears]);

  return (
    <Modal
      open={open}
      title={row ? 'Edit programme' : 'New programme'}
      subtitle="The department is the parent of this programme. Capacity is checked when a student is admitted."
      size="lg"
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      footer={<><Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending}>{row ? 'Save changes' : 'Create programme'}</Button></>}
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        <FormGrid>
          <Field label="Programme code" value={form.code} onChange={(event) => set('code', event.target.value)} placeholder="e.g. CS" required />
          <Field label="Programme name" value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="e.g. Computer Science" required />
          <SelectField label="Department" value={form.department} onChange={(event) => set('department', event.target.value)} required>
            <option value="">Choose a department</option>
            {departments.map((department) => <option key={department.id} value={department.id}>{department.code} · {department.name}</option>)}
          </SelectField>
          <SelectField label="Qualification" value={form.qualificationType} onChange={(event) => set('qualificationType', event.target.value)} required>
            {QUALIFICATIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </SelectField>
          <Field label="Student capacity" type="number" min="1" max="10000" value={form.capacity} onChange={(event) => set('capacity', event.target.value)} hint="Leave blank for no cap." />
          <SelectField label="Status" value={form.active ? 'yes' : 'no'} onChange={(event) => set('active', event.target.value === 'yes')}>
            <option value="yes">Active</option>
            <option value="no">Inactive</option>
          </SelectField>
          {form.qualificationType === 'degree' ? (
            <Field label="Duration (years)" type="number" min="1" max="10" value={form.durationYears} onChange={(event) => set('durationYears', event.target.value)} required />
          ) : null}
          {form.qualificationType === 'short-term' ? (
            <>
              <Field label="Duration" type="number" min="1" max="520" value={form.shortTerm.duration} onChange={(event) => setForm((current) => ({ ...current, shortTerm: { ...current.shortTerm, duration: event.target.value } }))} required />
              <SelectField label="Duration unit" value={form.shortTerm.unit} onChange={(event) => setForm((current) => ({ ...current, shortTerm: { ...current.shortTerm, unit: event.target.value } }))}>
                <option value="weeks">Weeks</option>
                <option value="months">Months</option>
              </SelectField>
            </>
          ) : null}
        </FormGrid>

        <div className="rounded-2xl bg-slate-50/80 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Regular / extension streams</p>
          <div className="flex flex-wrap gap-2">
            {['regular', 'extension'].map((category) => (
              <label key={category} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${form.categories.includes(category) ? 'border-brand-200 bg-brand-50 text-brand-900' : 'border-slate-200 bg-white text-slate-700'}`}>
                <input type="checkbox" checked={form.categories.includes(category)} onChange={() => toggleCategory(category)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
                {category === 'regular' ? 'Regular' : 'Extension'}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Batches and admissions can only use a stream enabled here.</p>
        </div>

        {form.qualificationType === 'diploma' ? (
          <div className="rounded-2xl bg-slate-50/80 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Diploma levels</p>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4].map((level) => (
                <label key={level} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${form.levels.includes(level) ? 'border-brand-200 bg-brand-50 text-brand-900' : 'border-slate-200 bg-white text-slate-700'}`}>
                  <input type="checkbox" checked={form.levels.includes(level)} onChange={() => toggleLevel(level)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
                  Level {level}
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl bg-slate-50/80 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Academic years for this programme</p>
          <div className="flex flex-wrap gap-2">
            {activeAndPlannedYears.map((year) => (
              <label key={year.id} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${form.academicYears.includes(year.id) ? 'border-brand-200 bg-brand-50 text-brand-900' : 'border-slate-200 bg-white text-slate-700'}`}>
                <input type="checkbox" checked={form.academicYears.includes(year.id)} onChange={() => toggleAcademicYear(year.id)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
                <span className="font-medium">{year.name || year.year}</span>
                <span className="text-xs text-slate-400 capitalize">({year.status})</span>
              </label>
            ))}
          </div>
          {!activeAndPlannedYears.length ? (
            <p className="text-xs text-slate-500">No active or planned academic years found in the academic calendar.</p>
          ) : (
            <p className="mt-2 text-xs text-slate-500">Only active and planned academic years are available for selection.</p>
          )}
        </div>

        <div className="rounded-2xl bg-slate-50/80 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Teachers assigned to this programme (Max 2 Regular · 1 Extension)
          </p>
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-slate-100 bg-white p-2">
            {teachers.map((teacher) => {
              const isSelected = form.teachers.includes(teacher.id);
              const reg = teacher.workload?.regular ?? 0;
              const ext = teacher.workload?.extension ?? 0;
              const isRegFull = form.categories.includes('regular') && reg >= 2;
              const isExtFull = form.categories.includes('extension') && ext >= 1;
              const isLimit = (isRegFull || isExtFull) && !isSelected;

              return (
                <label
                  key={teacher.id}
                  className={`flex cursor-pointer items-center justify-between gap-2.5 rounded-lg px-2 py-1.5 text-sm ${
                    isLimit ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isLimit}
                      onChange={() => toggleTeacher(teacher)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600"
                    />
                    <span className="truncate">
                      {teacher.name} <span className="text-xs text-slate-400">{teacher.email}</span>
                    </span>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-slate-500">
                    {reg}/2 Reg · {ext}/1 Ext
                    {isLimit && <span className="ml-1 text-rose-600 font-bold">(Full)</span>}
                  </span>
                </label>
              );
            })}
            {!teachers.length ? <p className="px-2 py-3 text-sm text-slate-500">No active teacher accounts exist yet.</p> : null}
          </div>
        </div>

        <TextAreaField label="Description" rows={3} value={form.description} onChange={(event) => set('description', event.target.value)} />
      </div>
    </Modal>
  );
}
