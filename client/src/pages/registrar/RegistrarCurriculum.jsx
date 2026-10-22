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
  const [program, setProgram] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [selectedId, setSelectedId] = useState(searchParams.get('plan') || '');
  const [creating, setCreating] = useState(false);
  const [editingPlan, setEditingPlan] = useState(false);
  const [courseModal, setCourseModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const options = useQuery({
    queryKey: ['registrar', 'curriculum', 'options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/curriculum/options`)).data,
    staleTime: 5 * 60_000,
  });

  const params = useMemo(() => ({
    limit: 50,
    ...(status !== 'all' ? { status } : {}),
    ...(program ? { program } : {}),
    ...(academicYear ? { academicYear } : {}),
  }), [status, program, academicYear]);

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
              <SelectField label="Programme" value={program} onChange={(event) => setProgram(event.target.value)}>
                <option value="">All programmes</option>
                {(options.data?.programs || []).map((row) => <option key={row.id} value={row.id}>{row.code}</option>)}
              </SelectField>
              <SelectField label="Academic year" value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}>
                <option value="">All years</option>
                {(options.data?.academicYears || []).map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
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

      <CreatePlanModal open={creating} options={options.data} onClose={() => setCreating(false)} onSaved={(created) => { invalidate(); const id = created?.id || created?._id; if (id) setSelectedId(String(id)); }} />
      <EditPlanModal open={editingPlan} plan={plan} onClose={() => setEditingPlan(false)} onSaved={invalidate} />
      <CourseModal
        open={Boolean(courseModal)}
        plan={plan}
        record={courseModal?.record}
        options={options.data}
        onClose={() => setCourseModal(null)}
        onSaved={invalidate}
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
  const [form, setForm] = useState({ program: '', academicYear: '', title: '', notes: '', cloneFrom: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm({ program: '', academicYear: options?.academicYears?.find((year) => year.isCurrent)?.id || '', title: '', notes: '', cloneFrom: '' });
      setError('');
    }
  }, [open, options?.academicYears]);

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
          <SelectField label="Programme" value={form.program} onChange={(event) => setForm((value) => ({ ...value, program: event.target.value }))} required>
            <option value="">Choose a programme</option>
            {(options?.programs || []).map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}
          </SelectField>
          <SelectField label="Academic year" value={form.academicYear} onChange={(event) => setForm((value) => ({ ...value, academicYear: event.target.value }))} required>
            <option value="">Choose a year</option>
            {(options?.academicYears || []).map((row) => <option key={row.id} value={row.id}>{row.label}{row.isCurrent ? ' · current' : ''}</option>)}
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

function CourseModal({ open, plan, record, options, onClose, onSaved }) {
  const [form, setForm] = useState({ course: '', level: 1, term: '', creditHours: 3, category: 'required', prerequisites: [] });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(record ? {
      course: record.course?.id || '',
      level: record.level || 1,
      term: record.term || '',
      creditHours: record.creditHours || 1,
      category: record.category || 'required',
      prerequisites: (record.prerequisites || []).map((item) => item.id),
    } : {
      course: '',
      level: 1,
      term: '',
      creditHours: 3,
      category: 'required',
      prerequisites: [],
    });
  }, [open, record]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.course || !form.level || !form.creditHours) throw new Error('Course, level and credits are required.');
      const payload = {
        ...form,
        level: Number(form.level),
        creditHours: Number(form.creditHours),
        prerequisites: form.prerequisites,
      };
      return (
        await api.request({
          url: `${REGISTRAR}/curriculum/${plan.id}/courses${record ? `/${record.id}` : ''}`,
          method: record ? 'patch' : 'post',
          data: payload,
        })
      ).data;
    },
    onSuccess: () => {
      toast.success(record ? 'Course updated in the draft.' : 'Course added to the draft.');
      onSaved?.();
      onClose?.();
    },
    onError: (err) => {
      const message = errorMessage(err, 'The course could not be saved.');
      setError(message);
      toast.error(message);
    },
  });

  return (
    <Modal
      open={open}
      title={record ? 'Edit plan course' : 'Add course to plan'}
      subtitle="Each course appears once per level and term in a plan."
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      footer={<><Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending}>{record ? 'Save course' : 'Add course'}</Button></>}
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        <FormGrid>
          <SelectField
            label="Course"
            value={form.course}
            onChange={(event) => {
              const course = (options?.courses || []).find((row) => row.id === event.target.value);
              setForm((value) => ({ ...value, course: event.target.value, creditHours: course?.creditHours || value.creditHours }));
            }}
            disabled={Boolean(record)}
            required
          >
            <option value="">Choose a course</option>
            {(options?.courses || []).map((row) => <option key={row.id} value={row.id}>{row.code} · {row.title} ({row.creditHours} cr)</option>)}
          </SelectField>
          <Field label="Level / year" type="number" min="1" max="20" value={form.level} onChange={(event) => setForm((value) => ({ ...value, level: event.target.value }))} required />
          <Field label="Term" value={form.term} onChange={(event) => setForm((value) => ({ ...value, term: event.target.value }))} placeholder="e.g. Semester I" />
          <Field label="Credit hours" type="number" min="0.5" step="0.5" value={form.creditHours} onChange={(event) => setForm((value) => ({ ...value, creditHours: event.target.value }))} required />
          <SelectField label="Category" value={form.category} onChange={(event) => setForm((value) => ({ ...value, category: event.target.value }))}>
            <option value="required">Required</option>
            <option value="elective">Elective</option>
          </SelectField>
        </FormGrid>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Prerequisites</span>
          <select
            multiple
            value={form.prerequisites}
            onChange={(event) => setForm((value) => ({ ...value, prerequisites: Array.from(event.target.selectedOptions, (option) => option.value) }))}
            className="focus-ring min-h-28 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {(options?.courses || []).filter((row) => row.id !== form.course).map((row) => (
              <option key={row.id} value={row.id}>{row.code} · {row.title}</option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-slate-500">Hold Ctrl or Cmd to select more than one prerequisite.</p>
        </div>
      </div>
    </Modal>
  );
}
