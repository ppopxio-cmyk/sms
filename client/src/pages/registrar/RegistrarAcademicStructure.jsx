import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, Building2, GraduationCap, Pencil, Plus, ShieldCheck, Trash2, UserRoundCheck } from 'lucide-react';
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
    description: form.description.trim(),
    active: Boolean(form.active),
  };
}

export default function RegistrarAcademicStructure() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('departments');
  const [search, setSearch] = useState('');
  const [departmentModal, setDepartmentModal] = useState(null);
  const [programModal, setProgramModal] = useState(null);
  const [deleting, setDeleting] = useState(null);

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

  const term = search.trim().toLowerCase();
  const matches = (values) => !term || values.some((value) => String(value || '').toLowerCase().includes(term));

  const departments = (query.data?.departments || []).filter((row) => matches([row.code, row.name]));
  const programs = (query.data?.programs || []).filter((row) =>
    matches([row.code, row.name, row.department?.name, row.qualificationType, ...(row.categories || [])]),
  );
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
          subtitle={tab === 'departments' ? 'Edit a department, or remove one that has no programmes, courses, batches or students.' : tab === 'programs' ? 'Programmes belong to a department and can be inactivated without deleting their history.' : 'Master records supplied by the college owner.'}
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
                    <div className="flex items-center gap-1.5">
                      <Badge tone={row.active ? 'success' : 'neutral'}>{row.active ? 'Active' : 'Inactive'}</Badge>
                      <button type="button" aria-label={`Add programme to ${row.name}`} title="Add programme" className="focus-ring rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-700" onClick={() => setProgramModal({ row: null, departmentId: row.id })}>
                        <Plus className="h-3.5 w-3.5" />
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
                  <p className="mt-3 text-xs text-slate-500">
                    {row.qualificationType === 'degree'
                      ? `${row.durationYears || '—'} study year${row.durationYears === 1 ? '' : 's'}`
                      : row.qualificationType === 'diploma'
                        ? `Levels ${(row.levels || []).join(', ') || 'not set'}`
                        : `${row.shortTerm?.duration || '—'} ${row.shortTerm?.unit || ''}`}
                    {' · '}{row.capacity ? `capacity ${row.capacity}` : 'capacity not set'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(row.categories || ['regular', 'extension']).map((category) => (
                      <Badge key={category} tone={category === 'extension' ? 'warning' : 'neutral'}>{humanStatus(category)}</Badge>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-xs text-slate-500">
                      <UserRoundCheck className="h-3.5 w-3.5" />
                      {(row.teachers || []).length ? (row.teachers || []).map((teacher) => teacher.name).join(', ') : 'No teachers assigned'}
                    </p>
                    <button
                      type="button"
                      onClick={() => toggleProgram.mutate(row)}
                      disabled={toggleProgram.isPending}
                      className="focus-ring rounded-lg text-xs font-semibold text-brand-700 hover:underline disabled:opacity-50"
                    >
                      {row.active ? 'Inactivate' : 'Activate'}
                    </button>
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
    </div>
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

function ProgramModal({ open, row, departmentId, departments, teachers, onClose, onSaved }) {
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
  const toggleTeacher = (teacherId) => setForm((current) => ({
    ...current,
    teachers: current.teachers.includes(teacherId)
      ? current.teachers.filter((value) => value !== teacherId)
      : [...current.teachers, teacherId],
  }));

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
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Teachers assigned to this programme</p>
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-slate-100 bg-white p-2">
            {teachers.map((teacher) => (
              <label key={teacher.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                <input type="checkbox" checked={form.teachers.includes(teacher.id)} onChange={() => toggleTeacher(teacher.id)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
                <span className="truncate">{teacher.name} <span className="text-xs text-slate-400">{teacher.email}</span></span>
              </label>
            ))}
            {!teachers.length ? <p className="px-2 py-3 text-sm text-slate-500">No active teacher accounts exist yet.</p> : null}
          </div>
        </div>

        <TextAreaField label="Description" rows={3} value={form.description} onChange={(event) => set('description', event.target.value)} />
      </div>
    </Modal>
  );
}
