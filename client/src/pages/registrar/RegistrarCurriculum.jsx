import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Archive,
  BookOpen,
  CheckCircle2,
  Copy,
  Pencil,
  Plus,
  ScrollText,
  Search,
  Trash2,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import {
  REGISTRAR,
  cleanPayload,
  displayDateTime,
  humanStatus,
  levelLabel,
  toneForStatus,
} from '../../lib/registrar';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import ConfirmDialog from '../../components/registrar/ConfirmDialog';
import { FormGrid, SelectField, TextAreaField } from '../../components/registrar/Fields';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import Modal from '../../components/ui/Modal';
import { ErrorState } from '../../components/ui/StatePanel';
import { SkeletonCard } from '../../components/ui/Skeleton';

export default function RegistrarCurriculum() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('all');
  const [department, setDepartment] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [selectedId, setSelectedId] = useState(searchParams.get('plan') || '');
  const [creating, setCreating] = useState(false);
  const [editingPlan, setEditingPlan] = useState(false);
  const [courseModal, setCourseModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const options = useQuery({
    queryKey: ['registrar', 'curriculum', 'options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/curriculum/options`)).data,
    staleTime: 30_000,
  });

  const structureQuery = useQuery({
    queryKey: ['registrar', 'academic-structure'],
    queryFn: async () => (await api.get(`${REGISTRAR}/academic-structure`)).data,
    staleTime: 60_000,
  });

  const calendarQuery = useQuery({
    queryKey: ['registrar', 'academic-calendar'],
    queryFn: async () => (await api.get(`${REGISTRAR}/academic-calendar`)).data,
    staleTime: 60_000,
  });

  const resolvedOptions = useMemo(() => {
    const opts = options.data || {};
    const struct = structureQuery.data || {};
    const cal = calendarQuery.data || {};

    const depts = (opts.departments?.length ? opts.departments : struct.departments || []).map((d) => ({
      id: d.id || String(d._id),
      code: d.code,
      name: d.name,
      active: d.active !== false,
    }));

    const progs = (opts.programs?.length ? opts.programs : struct.programs || []).map((p) => ({
      id: p.id || String(p._id),
      code: p.code,
      name: p.name,
      qualificationType: p.qualificationType,
      durationYears: p.durationYears,
      levels: p.levels,
      department: p.department ? {
        id: p.department.id || String(p.department._id || p.department),
        code: p.department.code,
        name: p.department.name,
      } : null,
      active: p.active !== false,
    }));

    const years = (opts.academicYears?.length ? opts.academicYears : cal.years || []).map((y) => ({
      id: y.id || String(y._id),
      label: y.label,
      isCurrent: Boolean(y.isCurrent),
      status: y.status || (y.isCurrent ? 'active' : 'planned'),
    }));

    const courses = (opts.courses?.length ? opts.courses : struct.courses || []).map((c) => ({
      id: c.id || String(c._id),
      code: c.code,
      title: c.title,
      creditHours: c.creditHours || 3,
      program: c.program,
      department: c.department,
      prerequisites: c.prerequisites,
    }));

    return {
      departments: depts,
      programs: progs,
      academicYears: years,
      courses,
      terms: opts.terms || cal.terms || [],
    };
  }, [options.data, structureQuery.data, calendarQuery.data]);

  const params = useMemo(() => ({
    limit: 50,
    ...(status !== 'all' ? { status } : {}),
    ...(department ? { department } : {}),
    ...(academicYear ? { academicYear } : {}),
  }), [status, department, academicYear]);

  const plans = useQuery({
    queryKey: ['registrar', 'curriculum', params],
    queryFn: async () => (await api.get(`${REGISTRAR}/curriculum`, { params })).data,
    placeholderData: (previous) => previous,
  });

  const rows = plans.data?.rows ?? [];
  const selected = rows.find((row) => row.id === selectedId) || rows[0] || null;
  const effectiveId = selected?.id || '';

  useEffect(() => {
    if (searchParams.get('plan')) setSelectedId(searchParams.get('plan'));
  }, [searchParams]);

  const detail = useQuery({
    queryKey: ['registrar', 'curriculum', effectiveId],
    queryFn: async () => (await api.get(`${REGISTRAR}/curriculum/${effectiveId}`)).data,
    enabled: Boolean(effectiveId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['registrar', 'curriculum'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'academic-structure'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'academic-calendar'] });
  };

  const action = useMutation({
    mutationFn: async ({ kind, record }) => {
      if (kind === 'publish') return (await api.post(`${REGISTRAR}/curriculum/${record.id}/publish`)).data;
      if (kind === 'archive') return (await api.post(`${REGISTRAR}/curriculum/${record.id}/archive`)).data;
      if (kind === 'clone') return (await api.post(`${REGISTRAR}/curriculum/${record.id}/clone`)).data;
      if (kind === 'delete-course') return (await api.delete(`${REGISTRAR}/curriculum/${effectiveId}/courses/${record.id}`)).data;
      throw new Error('Unknown action.');
    },
    onSuccess: (data, variables) => {
      const messages = {
        publish: 'Curriculum published. The previous published version was archived.',
        archive: 'Curriculum archived. It remains available as history.',
        clone: 'Curriculum cloned into a new draft.',
        'delete-course': 'Course removed from the draft.',
      };
      toast.success(messages[variables.kind]);
      const newPlanId = data?.plan?.id || data?.plan?._id;
      if (variables.kind === 'clone' && newPlanId) setSelectedId(String(newPlanId));
      setConfirm(null);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, 'The curriculum action could not be completed.')),
  });

  const plan = detail.data?.plan;
  const courses = detail.data?.courses ?? [];
  const courseColumns = [
    {
      key: 'course',
      label: 'Course',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-900">{row.course?.code}</p>
          <p className="text-xs text-slate-500">{row.course?.title}</p>
        </div>
      ),
    },
    {
      key: 'placement',
      label: 'Level / term',
      render: (row) => (
        <div>
          <p className="text-sm text-slate-700">{levelLabel(row.level, plan?.qualificationType)}</p>
          <p className="text-xs text-slate-400">{row.term || 'No term'}</p>
        </div>
      ),
    },
    { key: 'credits', label: 'Credits', render: (row) => row.creditHours },
    { key: 'category', label: 'Category', render: (row) => <Badge tone={row.category === 'elective' ? 'warning' : 'neutral'}>{humanStatus(row.category)}</Badge> },
    {
      key: 'prerequisites',
      label: 'Prerequisites',
      render: (row) => row.prerequisites?.length ? row.prerequisites.map((item) => item.code).join(', ') : '—',
    },
    ...(plan?.status === 'draft' ? [{
      key: 'actions',
      label: '',
      className: 'text-right',
      mobileFull: true,
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setCourseModal({ record: row })} aria-label={`Edit ${row.course?.code}`}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'delete-course', record: row, title: 'Remove course?', message: `${row.course?.code} will be removed from this draft plan.`, confirmLabel: 'Remove course', tone: 'danger' })} aria-label={`Remove ${row.course?.code}`}>
            <Trash2 className="h-3.5 w-3.5 text-rose-500" />
          </Button>
        </div>
      ),
    }] : []),
  ];

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Curriculum"
        subtitle="Build the programme plan for each academic year. Publishing creates a version; registration, progression and graduation resolve the published plan on the server."
        actions={<Button onClick={() => setCreating(true)} className="gap-2"><Plus className="h-4 w-4" /> New plan</Button>}
      />

      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-3">
          <Card className="p-4">
            <div className="grid gap-3">
              <SelectField label="Status" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="all">All plans</option>
                {['draft', 'published', 'archived'].map((value) => <option key={value} value={value}>{humanStatus(value)}</option>)}
              </SelectField>
              <SelectField label="Department" value={department} onChange={(event) => setDepartment(event.target.value)}>
                <option value="">All departments</option>
                {(resolvedOptions?.departments || []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.code} · {row.name}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Academic year" value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}>
                <option value="">All years</option>
                {(resolvedOptions?.academicYears || []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}{row.status === 'active' || row.isCurrent ? ' · Active' : ''}
                  </option>
                ))}
              </SelectField>
            </div>
          </Card>

          <Card>
            <div className="border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {plans.isFetching ? 'Loading plans…' : `${rows.length} plan${rows.length === 1 ? '' : 's'}`}
            </div>
            <div className="max-h-[640px] space-y-1 overflow-y-auto p-2">
              {plans.isLoading ? <div className="p-3"><SkeletonCard lines={4} /></div> : plans.error ? (
                <ErrorState message={errorMessage(plans.error, 'Plans could not be loaded.')} onRetry={plans.refetch} />
              ) : rows.length ? rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className={`focus-ring w-full rounded-2xl border p-3 text-left transition ${
                    row.id === effectiveId
                      ? 'border-brand-200 bg-brand-50/70'
                      : 'border-transparent hover:border-slate-100 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{row.title || row.program?.name}</p>
                    <Badge tone={toneForStatus(row.status)}>{humanStatus(row.status)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{row.program?.code} · {row.academicYear?.label} · v{row.version}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{row.totalCredits ?? 0} credits · {row.courseCount ?? '—'} courses</p>
                </button>
              )) : <p className="px-3 py-6 text-sm text-slate-500">No curriculum plan matches those filters.</p>}
            </div>
          </Card>
        </div>

        <div className="min-w-0">
          {!effectiveId ? (
            <Card><ErrorState message="Choose a plan on the left, or create the first draft for a programme and academic year." /></Card>
          ) : detail.isLoading ? (
            <SkeletonCard lines={10} />
          ) : detail.error ? (
            <Card><ErrorState message={detail.error?.response?.data?.message || 'The plan could not be loaded.'} onRetry={detail.refetch} /></Card>
          ) : plan ? (
            <div className="space-y-5">
              <Card>
                <CardHeader
                  title={plan.title || `${plan.program?.name} curriculum`}
                  subtitle={`${plan.program?.name} · ${plan.academicYear?.label} · version ${plan.version}`}
                  icon={ScrollText}
                  action={<Badge tone={toneForStatus(plan.status)}>{humanStatus(plan.status)}</Badge>}
                />
                <CardBody className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 p-3 text-center">
                      <p className="text-lg font-bold text-slate-900">{plan.totalCredits ?? 0}</p>
                      <p className="text-[11px] text-slate-500">Total credits</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3 text-center">
                      <p className="text-lg font-bold text-slate-900">{courses.length}</p>
                      <p className="text-[11px] text-slate-500">Courses</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3 text-center">
                      <p className="text-sm font-bold text-slate-900">{plan.publishedAt ? displayDateTime(plan.publishedAt) : 'Not published'}</p>
                      <p className="text-[11px] text-slate-500">Published</p>
                    </div>
                  </div>
                  {plan.notes ? <p className="text-sm leading-relaxed text-slate-600">{plan.notes}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    {plan.status === 'draft' ? (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => setEditingPlan(true)} className="gap-1.5"><Pencil className="h-3.5 w-3.5" /> Edit details</Button>
                        <Button size="sm" variant="secondary" onClick={() => setCourseModal({ record: null })} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Add course</Button>
                        <Button size="sm" onClick={() => setConfirm({ kind: 'publish', record: plan, title: 'Publish curriculum?', message: 'The plan will become the official plan for this programme and academic year. A previous published plan will be archived.', confirmLabel: 'Publish plan' })} className="gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Publish</Button>
                      </>
                    ) : null}
                    <Button size="sm" variant="secondary" onClick={() => setConfirm({ kind: 'clone', record: plan, title: 'Clone this plan?', message: 'A new draft copy will be created for the same programme and academic year. Existing versions are preserved.', confirmLabel: 'Clone to draft' })} className="gap-1.5"><Copy className="h-3.5 w-3.5" /> Clone</Button>
                    {plan.status !== 'archived' ? (
                      <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'archive', record: plan, title: 'Archive curriculum?', message: 'Archived plans remain available as history and can no longer be published.', confirmLabel: 'Archive plan', tone: 'danger' })} className="gap-1.5"><Archive className="h-3.5 w-3.5" /> Archive</Button>
                    ) : null}
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Plan courses"
                  subtitle={plan.status === 'draft' ? 'Courses can be edited until the plan is published.' : 'This version is read-only. Clone it to draft a new version.'}
                  icon={BookOpen}
                  action={plan.status === 'draft' ? <Button size="sm" variant="secondary" onClick={() => setCourseModal({ record: null })}><Plus className="h-3.5 w-3.5" /> Add</Button> : null}
                />
                <RegistrarTable
                  columns={courseColumns}
                  rows={courses}
                  loading={detail.isFetching}
                  rowKey={(row) => row.id}
                  emptyTitle="No courses in this plan"
                  emptyMessage="Add the courses, credits, level, term and prerequisites before publishing."
                />
              </Card>

              <VersionHistory plan={plan} rows={rows} onSelect={setSelectedId} />
            </div>
          ) : null}
        </div>
      </div>

      <CreatePlanModal open={creating} options={resolvedOptions} onClose={() => setCreating(false)} onSaved={(created) => { invalidate(); const id = created?.id || created?._id; if (id) setSelectedId(String(id)); }} />
      <EditPlanModal open={editingPlan} plan={plan} onClose={() => setEditingPlan(false)} onSaved={invalidate} />
      <CourseModal
        open={Boolean(courseModal)}
        plan={plan}
        record={courseModal?.record}
        options={resolvedOptions}
        onClose={() => setCourseModal(null)}
        onSaved={invalidate}
        refetchOptions={() => {
          options.refetch();
          structureQuery.refetch();
        }}
      />
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title || ''}
        message={confirm?.message || ''}
        confirmLabel={confirm?.confirmLabel || 'Confirm'}
        tone={confirm?.tone || 'primary'}
        loading={action.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => action.mutate(confirm)}
      />
    </div>
  );
}

function VersionHistory({ plan, rows, onSelect }) {
  const versions = rows.filter((row) => row.program?.id === plan.program?.id && row.academicYear?.id === plan.academicYear?.id);
  if (versions.length < 2) return null;
  return (
    <Card>
      <CardHeader title="Version history" subtitle="Published plans are archived when a newer version is published." icon={Archive} />
      <CardBody className="space-y-2">
        {versions.map((row) => (
          <button key={row.id} type="button" onClick={() => onSelect(row.id)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2.5 text-left hover:bg-slate-50">
            <span className="text-sm text-slate-700">Version {row.version} · {row.totalCredits ?? 0} credits</span>
            <span className="flex items-center gap-2 text-xs text-slate-500">
              {row.id === plan.id ? <Badge tone="brand">Viewing</Badge> : null}
              <Badge tone={toneForStatus(row.status)}>{humanStatus(row.status)}</Badge>
            </span>
          </button>
        ))}
      </CardBody>
    </Card>
  );
}

function CreatePlanModal({ open, options, onClose, onSaved }) {
  const [department, setDepartment] = useState('');
  const [form, setForm] = useState({ program: '', academicYear: '', title: '', notes: '', cloneFrom: '' });
  const [error, setError] = useState('');

  const departments = options?.departments || [];
  const allPrograms = options?.programs || [];

  const filteredPrograms = useMemo(() => {
    if (!department) return allPrograms;
    return allPrograms.filter((p) => String(p.department?.id || p.department) === String(department));
  }, [allPrograms, department]);

  useEffect(() => {
    if (open) {
      setDepartment('');
      const activeYear = options?.academicYears?.find((year) => year.status === 'active' || year.isCurrent) || options?.academicYears?.[0];
      setForm({ program: '', academicYear: activeYear?.id || '', title: '', notes: '', cloneFrom: '' });
      setError('');
    }
  }, [open, options?.academicYears]);

  const fillFromProgramme = (field, value) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      const program = (options?.programs || []).find((row) => row.id === (field === 'program' ? value : current.program));
      const year = (options?.academicYears || []).find((row) => row.id === (field === 'academicYear' ? value : current.academicYear));
      if (program) {
        next.title = year ? `${program.name} — ${year.label}` : program.name;
        next.notes = `Official curriculum for ${program.name}${program.department ? ` in the ${program.department.name} department` : ''}.${program.durationYears ? ` The programme spans ${program.durationYears} year${program.durationYears === 1 ? '' : 's'}.` : ''}`;
      }
      return next;
    });
  };

  const handleSelectProgram = (programId) => {
    fillFromProgramme('program', programId);
    if (programId) {
      const selectedProg = allPrograms.find((p) => p.id === programId);
      const progDeptId = selectedProg?.department?.id || selectedProg?.department;
      if (progDeptId && (!department || String(progDeptId) !== String(department))) {
        setDepartment(String(progDeptId));
      }
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.program || !form.academicYear) throw new Error('Programme and academic year are required.');
      return (await api.post(`${REGISTRAR}/curriculum`, cleanPayload({
        ...form,
        cloneFrom: form.cloneFrom || undefined,
      }))).data;
    },
    onSuccess: (data) => {
      toast.success('Curriculum draft created.');
      onSaved?.(data.plan);
      onClose?.();
    },
    onError: (err) => {
      const message = errorMessage(err, 'The draft could not be created.');
      setError(message);
      toast.error(message);
    },
  });

  return (
    <Modal
      open={open}
      title="New curriculum plan"
      subtitle="A draft is created with its own version number. Add courses before publishing."
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      footer={<><Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending}>Create draft</Button></>}
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        <FormGrid>
          <SelectField
            label="Department"
            value={department}
            onChange={(event) => {
              const deptId = event.target.value;
              setDepartment(deptId);
              if (deptId && form.program) {
                const curProg = allPrograms.find((p) => p.id === form.program);
                const curProgDept = curProg?.department?.id || curProg?.department;
                if (String(curProgDept) !== String(deptId)) {
                  setForm((current) => ({ ...current, program: '' }));
                }
              }
            }}
          >
            <option value="">All departments</option>
            {departments.map((row) => (
              <option key={row.id} value={row.id}>
                {row.code} · {row.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Programme"
            value={form.program}
            onChange={(event) => handleSelectProgram(event.target.value)}
            required
          >
            <option value="">Choose a programme</option>
            {filteredPrograms.map((row) => (
              <option key={row.id} value={row.id}>
                {row.code} · {row.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Academic year" value={form.academicYear} onChange={(event) => fillFromProgramme('academicYear', event.target.value)} required>
            <option value="">Choose an academic year</option>
            {(options?.academicYears || []).map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}{row.status === 'active' || row.isCurrent ? ' · Active' : row.status ? ` · ${row.status}` : ''}
              </option>
            ))}
          </SelectField>
          <Field className="sm:col-span-2" label="Title" value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} placeholder="Optional; the programme and year are used by default" />
          <TextAreaField className="sm:col-span-2" label="Notes" rows={3} value={form.notes} onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))} />
        </FormGrid>
        <p className="rounded-xl bg-sky-50 px-3.5 py-3 text-xs leading-relaxed text-sky-800">
          A draft can be created once per programme and academic year. Use Clone on an existing plan to start from its courses.
        </p>
      </div>
    </Modal>
  );
}

function EditPlanModal({ open, plan, onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', notes: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && plan) {
      setForm({ title: plan.title || '', notes: plan.notes || '' });
      setError('');
    }
  }, [open, plan]);

  const save = useMutation({
    mutationFn: async () => (await api.patch(`${REGISTRAR}/curriculum/${plan.id}`, form)).data,
    onSuccess: () => {
      toast.success('Curriculum details saved.');
      onSaved?.();
      onClose?.();
    },
    onError: (err) => {
      const message = errorMessage(err, 'The details could not be saved.');
      setError(message);
      toast.error(message);
    },
  });

  return (
    <Modal
      open={open}
      title="Edit curriculum details"
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      footer={<><Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending}>Save</Button></>}
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        <Field label="Title" value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} />
        <TextAreaField label="Notes" rows={4} value={form.notes} onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))} />
      </div>
    </Modal>
  );
}

function CourseModal({ open, plan, record, options, onClose, onSaved, refetchOptions }) {
  const [form, setForm] = useState({ courses: [], level: 1, term: '', creditHours: 3, category: 'required', prerequisites: [] });
  const [error, setError] = useState('');
  const [scopeFilter, setScopeFilter] = useState('programme'); // 'programme' | 'all'
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [newCourse, setNewCourse] = useState({ code: '', title: '', creditHours: 3 });
  const [creatingCourse, setCreatingCourse] = useState(false);

  const defaultLevel = useMemo(() => {
    return plan?.program?.durationYears ? 1 : (plan?.program?.levels?.[0] || 1);
  }, [plan?.program]);

  const planProgId = String(plan?.program?.id || plan?.program?._id || (typeof plan?.program === 'string' ? plan.program : '') || '');
  const planProgCode = String(plan?.program?.code || '').trim().toUpperCase();
  const planDeptId = String(plan?.department?.id || plan?.department?._id || plan?.department || plan?.program?.department?.id || plan?.program?.department?._id || plan?.program?.department || '');

  const programmeCourses = useMemo(() => {
    return (options?.courses || []).filter((row) => {
      // 1. Program ID directly linked via CourseResource or course.program
      const rowProgId = String(row.program?.id || row.program?._id || (typeof row.program === 'string' ? row.program : '') || '');
      if (planProgId && rowProgId && rowProgId === planProgId) return true;

      // 2. Program code match (e.g. course starts with CS- or HL- or row.program.code === planProgCode)
      const rowProgCode = String(row.program?.code || '').trim().toUpperCase();
      if (planProgCode) {
        if (rowProgCode && rowProgCode === planProgCode) return true;
        const codeUpper = String(row.code || '').trim().toUpperCase();
        if (codeUpper.startsWith(`${planProgCode}-`) || codeUpper.startsWith(planProgCode)) return true;
      }

      // 3. Department match
      const rowDeptId = String(row.department?.id || row.department?._id || row.department || '');
      if (planDeptId && rowDeptId && rowDeptId === planDeptId) return true;

      return false;
    });
  }, [options?.courses, planProgId, planProgCode, planDeptId]);

  const displayedCourses = useMemo(() => {
    if (record) return (options?.courses || []).filter((row) => row.id === record.course?.id);
    const allCourses = options?.courses || [];
    // If scope is 'programme' but no programme-specific courses found, fallback to all courses
    const baseList = scopeFilter === 'programme' && programmeCourses.length > 0 ? programmeCourses : allCourses;
    if (!searchTerm.trim()) return baseList;
    const term = searchTerm.trim().toLowerCase();
    return baseList.filter((c) =>
      String(c.code || '').toLowerCase().includes(term) ||
      String(c.title || '').toLowerCase().includes(term)
    );
  }, [record, options?.courses, scopeFilter, programmeCourses, searchTerm]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setSearchTerm('');
    setShowAddCourse(false);
    setNewCourse({ code: '', title: '', creditHours: 3 });
    setScopeFilter('programme');
    refetchOptions?.();
    setForm(record ? {
      courses: [record.course?.id].filter(Boolean),
      level: record.level || defaultLevel,
      term: record.term || '',
      creditHours: record.creditHours || 1,
      category: record.category || 'required',
      prerequisites: (record.prerequisites || []).map((item) => item.id),
    } : {
      courses: [],
      level: defaultLevel,
      term: '',
      creditHours: 3,
      category: 'required',
      prerequisites: [],
    });
  }, [open, record, plan, defaultLevel, refetchOptions]);

  const handleCreateCourse = async (e) => {
    e?.preventDefault();
    if (!newCourse.code.trim() || !newCourse.title.trim()) {
      setError('Course code and course name are required to create a new course.');
      return;
    }
    setCreatingCourse(true);
    setError('');
    try {
      const res = await api.post(`${REGISTRAR}/courses`, {
        code: newCourse.code.trim().toUpperCase(),
        title: newCourse.title.trim(),
        creditHours: Number(newCourse.creditHours) || 3,
        program: planProgId || undefined,
        department: planDeptId || undefined,
      });
      toast.success(`Course ${res.data.course.code} created and added to selection.`);
      await refetchOptions?.();
      setForm((cur) => ({
        ...cur,
        courses: [...new Set([...cur.courses, res.data.course.id])],
      }));
      setNewCourse({ code: '', title: '', creditHours: 3 });
      setShowAddCourse(false);
    } catch (err) {
      setError(errorMessage(err, 'Could not create course.'));
    } finally {
      setCreatingCourse(false);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.courses.length) throw new Error('Choose at least one course.');
      if (record && !form.creditHours) throw new Error('Credits are required.');
      for (const courseId of form.courses) {
        const course = (options?.courses || []).find((row) => row.id === courseId);
        await api.request({
          url: `${REGISTRAR}/curriculum/${plan.id}/courses${record ? `/${record.id}` : ''}`,
          method: record ? 'patch' : 'post',
          data: {
            course: courseId,
            level: Number(form.level || defaultLevel),
            term: form.term || undefined,
            creditHours: record ? Number(form.creditHours) : course?.creditHours || 3,
            category: form.category || 'required',
            prerequisites: form.prerequisites,
          },
        });
      }
      return form.courses.length;
    },
    onSuccess: (count) => {
      toast.success(record ? 'Course updated in the draft.' : `${count} course${count === 1 ? '' : 's'} added to the draft.`);
      onSaved?.();
      onClose?.();
    },
    onError: (err) => {
      const message = errorMessage(err, 'The course could not be saved.');
      setError(message);
      toast.error(message);
    },
  });

  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const toggleCourse = (courseId) => setForm((current) => {
    const isSelected = current.courses.includes(courseId);
    const newCourses = isSelected
      ? current.courses.filter((id) => id !== courseId)
      : [...current.courses, courseId];

    // Automatically fill prerequisites based on selected courses
    const autoPrereqs = new Set();
    for (const cId of newCourses) {
      const cObj = (options?.courses || []).find((c) => c.id === cId);
      if (cObj?.prerequisites?.length) {
        for (const p of cObj.prerequisites) {
          const pId = p.id || String(p);
          if (pId && !newCourses.includes(pId)) {
            autoPrereqs.add(pId);
          }
        }
      }
    }

    return {
      ...current,
      courses: newCourses,
      prerequisites: Array.from(autoPrereqs),
    };
  });

  return (
    <Modal
      open={open}
      title={record ? 'Edit plan course' : 'Add courses to plan'}
      subtitle={`Select courses for ${plan?.program?.name || 'this programme'}. Prerequisites fill automatically.`}
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      footer={<><Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending}>{record ? 'Save course' : form.courses.length ? `Add ${form.courses.length} course${form.courses.length === 1 ? '' : 's'}` : 'Add courses'}</Button></>}
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        {record ? (
          <SelectField label="Course" value={form.courses[0] || ''} disabled>
            <option value={record.course?.id || ''}>{record.course?.code} · {record.course?.title}</option>
          </SelectField>
        ) : (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-800">Courses in programme</span>
              <div className="flex items-center gap-2">
                <Button size="xs" variant="secondary" onClick={() => setShowAddCourse((v) => !v)}>
                  {showAddCourse ? 'Cancel' : '+ New course'}
                </Button>
                {(options?.courses || []).length > programmeCourses.length && programmeCourses.length > 0 ? (
                  <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setScopeFilter('programme')}
                      className={`rounded-md px-2.5 py-1 transition ${scopeFilter === 'programme' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      {plan?.program?.code || 'Programme'} ({programmeCourses.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setScopeFilter('all')}
                      className={`rounded-md px-2.5 py-1 transition ${scopeFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      All catalogue ({(options?.courses || []).length})
                    </button>
                  </div>
                ) : programmeCourses.length === 0 && (options?.courses || []).length > 0 ? (
                  <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                    Showing all catalogue courses ({(options?.courses || []).length})
                  </span>
                ) : null}
              </div>
            </div>

            {showAddCourse ? (
              <div className="mb-3 rounded-xl border border-brand-200 bg-brand-50/50 p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-brand-900">Define course for {plan?.program?.name || 'programme'}</span>
                  <button type="button" onClick={() => setShowAddCourse(false)} className="text-xs text-slate-500 hover:text-slate-800">Close</button>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <input
                    type="text"
                    placeholder="Course code (e.g. CS-101)"
                    value={newCourse.code}
                    onChange={(e) => setNewCourse((c) => ({ ...c, code: e.target.value.toUpperCase() }))}
                    className="focus-ring rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs uppercase"
                  />
                  <input
                    type="text"
                    placeholder="Course name (e.g. Intro to CS)"
                    value={newCourse.title}
                    onChange={(e) => setNewCourse((c) => ({ ...c, title: e.target.value }))}
                    className="focus-ring rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                  />
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0.5"
                      max="30"
                      step="0.5"
                      placeholder="Credits"
                      value={newCourse.creditHours}
                      onChange={(e) => setNewCourse((c) => ({ ...c, creditHours: e.target.value }))}
                      className="focus-ring w-20 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                    />
                    <Button size="xs" onClick={handleCreateCourse} loading={creatingCourse} className="flex-1 whitespace-nowrap">
                      Save & Select
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="search"
                placeholder="Search by course code or title…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="focus-ring w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs placeholder:text-slate-400"
              />
            </div>

            <div className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-slate-200/80 bg-slate-50/30 p-2">
              {displayedCourses.map((row) => {
                const isSelected = form.courses.includes(row.id);
                return (
                  <label
                    key={row.id}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${
                      isSelected ? 'bg-brand-50/80 font-medium text-brand-900' : 'text-slate-700 hover:bg-slate-100/70'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleCourse(row.id)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <div className="min-w-0 flex-1 truncate">
                      <span className="font-semibold text-slate-900">{row.code}</span>
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span className="text-slate-700">{row.title}</span>
                    </div>
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                      {row.creditHours} cr
                    </span>
                  </label>
                );
              })}
              {!displayedCourses.length ? (
                <div className="py-6 text-center text-sm text-slate-500">
                  <p>No courses found{searchTerm ? ` matching "${searchTerm}"` : ''}.</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Click &quot;+ New course&quot; above to quickly add a course for this programme.
                  </p>
                </div>
              ) : null}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
              <span className="font-medium text-brand-700">{form.courses.length} selected</span>
              {displayedCourses.length > 0 ? <span>Showing {displayedCourses.length} courses</span> : null}
            </div>
          </div>
        )}
        <FormGrid>
          {record ? <Field label="Credit hours" type="number" min="0.5" step="0.5" value={form.creditHours} onChange={(event) => set('creditHours', event.target.value)} required /> : null}
          <SelectField label="Category" value={form.category} onChange={(event) => set('category', event.target.value)}>
            <option value="required">Required</option>
            <option value="elective">Elective</option>
          </SelectField>
        </FormGrid>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Prerequisites</span>
          <select
            multiple
            value={form.prerequisites}
            onChange={(event) => set('prerequisites', Array.from(event.target.selectedOptions, (option) => option.value))}
            className="focus-ring min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {(options?.courses || []).filter((row) => !form.courses.includes(row.id)).map((row) => (
              <option key={row.id} value={row.id}>{row.code} · {row.title}</option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-slate-500">Automatically filled based on selected courses. Hold Ctrl/Cmd to customize.</p>
        </div>
      </div>
    </Modal>
  );
}
