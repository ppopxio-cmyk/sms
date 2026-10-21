import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Plus, Users } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import {
  REGISTRAR,
  cleanPayload,
  humanStatus,
  levelLabel,
  toneForStatus,
} from '../../lib/registrar';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import { FormGrid, SelectField } from '../../components/registrar/Fields';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';

export default function RegistrarOfferings() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [program, setProgram] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('all');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [bulkOpen, setBulkOpen] = useState(Boolean(searchParams.get('plan')));
  const [bulkPlan, setBulkPlan] = useState(searchParams.get('plan') || '');
  const [editing, setEditing] = useState(null);

  const options = useQuery({
    queryKey: ['registrar', 'offering-options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/offerings/options`)).data,
    staleTime: 5 * 60_000,
  });

  const params = useMemo(() => ({
    page,
    limit,
    ...(program ? { program } : {}),
    ...(academicYear ? { academicYear } : {}),
    ...(level ? { level } : {}),
    ...(status !== 'all' ? { status } : {}),
    ...(term.trim() ? { term: term.trim() } : {}),
  }), [page, limit, program, academicYear, level, status, term]);

  const query = useQuery({
    queryKey: ['registrar', 'offerings', params],
    queryFn: async () => (await api.get(`${REGISTRAR}/offerings`, { params })).data,
    placeholderData: (previous) => previous,
  });

  const rows = query.data?.rows ?? [];
  const pagination = query.data?.pagination ?? { page: 1, pages: 1, total: 0, limit };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['registrar', 'offerings'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'dashboard'] });
  };

  const columns = [
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
      label: 'Programme / term',
      render: (row) => (
        <div>
          <p className="text-sm text-slate-700">{row.program?.code || '—'} · {levelLabel(row.level)}</p>
          <p className="text-xs text-slate-400">{row.academicYear?.label} · {row.term}</p>
        </div>
      ),
    },
    {
      key: 'teacher',
      label: 'Teacher',
      render: (row) => row.teacher ? (
        <div>
          <p className="text-sm text-slate-700">{row.teacher.name}</p>
          <p className="text-xs text-slate-400">{row.teacher.email}</p>
        </div>
      ) : <Badge tone="warning">Unassigned</Badge>,
    },
    {
      key: 'seats',
      label: 'Seats',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold tabular-nums text-slate-800">{row.registeredCount ?? 0} / {row.capacity}</p>
          <p className="text-xs text-slate-400">registered</p>
        </div>
      ),
    },
    { key: 'status', label: 'Status', render: (row) => <Badge tone={toneForStatus(row.status)}>{humanStatus(row.status)}</Badge> },
    {
      key: 'actions',
      label: '',
      className: 'text-right',
      mobileFull: true,
      render: (row) => <Button size="sm" variant="secondary" onClick={() => setEditing(row)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>,
    },
  ];

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Course offerings"
        subtitle="Open a published curriculum course for a term, assign an active teacher and set the class capacity."
        actions={<Button onClick={() => { setBulkOpen(true); setBulkPlan(''); }} className="gap-2"><Plus className="h-4 w-4" /> Create offerings</Button>}
      />

      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SelectField label="Programme" value={program} onChange={(event) => { setProgram(event.target.value); setPage(1); }}>
            <option value="">All programmes</option>
            {(options.data?.programs || []).map((row) => <option key={row.id} value={row.id}>{row.code}</option>)}
          </SelectField>
          <SelectField label="Academic year" value={academicYear} onChange={(event) => { setAcademicYear(event.target.value); setPage(1); }}>
            <option value="">All years</option>
            {(options.data?.academicYears || []).map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
          </SelectField>
          <Field label="Term" value={term} onChange={(event) => { setTerm(event.target.value); setPage(1); }} placeholder="e.g. Semester I" />
          <Field label="Level" type="number" min="1" value={level} onChange={(event) => { setLevel(event.target.value); setPage(1); }} placeholder="All levels" />
          <SelectField label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="all">All statuses</option>
            {['draft', 'open', 'in_progress', 'completed', 'cancelled'].map((value) => <option key={value} value={value}>{humanStatus(value)}</option>)}
          </SelectField>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Teaching offerings</h2>
            <p className="mt-0.5 text-xs text-slate-500">{pagination.total ?? 0} offering{pagination.total === 1 ? '' : 's'}</p>
          </div>
          <Users className="h-4 w-4 text-slate-300" />
        </div>
        <RegistrarTable
          columns={columns}
          rows={rows}
          loading={query.isLoading}
          error={query.error ? query.error?.response?.data?.message || 'Offerings could not be loaded.' : null}
          onRetry={query.refetch}
          rowKey={(row) => row.id}
          noResults={Boolean(program || academicYear || level || status !== 'all' || term.trim())}
          emptyTitle="No course offerings yet"
          emptyMessage="Create offerings from a published curriculum plan."
        />
        <div className="px-5 pb-4">
          <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPage={setPage} onLimit={(value) => { setLimit(value); setPage(1); }} />
        </div>
      </Card>

      <BulkOfferingModal
        open={bulkOpen}
        initialPlan={bulkPlan}
        options={options.data}
        onClose={() => setBulkOpen(false)}
        onSaved={invalidate}
      />
      <EditOfferingModal offering={editing} options={options.data} onClose={() => setEditing(null)} onSaved={invalidate} />
    </div>
  );
}

function BulkOfferingModal({ open, initialPlan, options, onClose, onSaved }) {
  const [plan, setPlan] = useState(initialPlan || '');
  const [selected, setSelected] = useState([]);
  const [form, setForm] = useState({ teacher: '', capacity: 60, schedule: '', status: 'open' });
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setPlan(initialPlan || '');
      setSelected([]);
      setForm({ teacher: '', capacity: 60, schedule: '', status: 'open' });
      setError('');
    }
  }, [open, initialPlan]);

  const entries = useQuery({
    queryKey: ['registrar', 'plan-offerings', plan],
    queryFn: async () => (await api.get(`${REGISTRAR}/curriculum/${plan}/offerings`)).data,
    enabled: Boolean(plan),
  });

  const rows = entries.data?.entries ?? [];
  const available = rows.filter((row) => !row.hasOffering);

  useEffect(() => {
    setSelected([]);
  }, [plan]);

  const save = useMutation({
    mutationFn: async () => {
      if (!plan) throw new Error('Choose a published curriculum plan.');
      if (!selected.length) throw new Error('Choose at least one curriculum course.');
      const results = await Promise.allSettled(selected.map((id) => api.post(`${REGISTRAR}/offerings`, cleanPayload({
        curriculumCourse: id,
        teacher: form.teacher || null,
        capacity: Number(form.capacity) || 60,
        schedule: form.schedule.trim(),
        status: form.status,
      }))));
      const created = results.filter((row) => row.status === 'fulfilled').length;
      const failed = results.length - created;
      if (!created) {
        const first = results.find((row) => row.status === 'rejected');
        throw new Error(errorMessage(first?.reason, 'No offering could be created.'));
      }
      return { created, failed };
    },
    onSuccess: ({ created, failed }) => {
      toast.success(`${created} offering${created === 1 ? '' : 's'} created${failed ? `; ${failed} could not be created` : ''}.`);
      onSaved?.();
      onClose?.();
    },
    onError: (err) => {
      const message = errorMessage(err, 'Offerings could not be created.');
      setError(message);
      toast.error(message);
    },
  });

  return (
    <Modal
      open={open}
      title="Create course offerings"
      subtitle="Only published curriculum courses without an existing offering are listed."
      size="lg"
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      footer={<><Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!selected.length}>{selected.length ? `Create ${selected.length} offering${selected.length === 1 ? '' : 's'}` : 'Create offerings'}</Button></>}
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        <SelectField label="Published curriculum plan" value={plan} onChange={(event) => setPlan(event.target.value)}>
          <option value="">Choose a plan</option>
          {(options?.plans || []).map((row) => (
            <option key={row.id} value={row.id}>{row.program?.code} · {row.academicYear?.label} · {row.title || `version`}</option>
          ))}
        </SelectField>

        {plan ? (
          <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-2xl border border-slate-100 p-2">
            {entries.isLoading ? <p className="px-3 py-4 text-sm text-slate-500">Loading curriculum courses…</p> : available.length ? available.map((row) => {
              const checked = selected.includes(row.id);
              return (
                <label key={row.id} className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${checked ? 'bg-brand-50 text-brand-900' : 'hover:bg-slate-50'}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setSelected((current) => checked ? current.filter((id) => id !== row.id) : [...current, row.id])}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{row.course?.code} · {row.course?.title}</span>
                    <span className="block truncate text-xs text-slate-500">{levelLabel(row.level)} · {row.term} · {row.creditHours} credits</span>
                  </span>
                  <Badge tone={row.category === 'elective' ? 'warning' : 'neutral'}>{humanStatus(row.category)}</Badge>
                </label>
              );
            }) : <p className="px-3 py-4 text-sm text-slate-500">Every curriculum course in this plan already has an offering, or the plan has no courses.</p>}
          </div>
        ) : (
          <p className="rounded-xl bg-sky-50 px-3.5 py-3 text-xs text-sky-800">Choose a published plan to see the courses that still need an offering.</p>
        )}

        <FormGrid>
          <SelectField label="Teacher (optional)" value={form.teacher} onChange={(event) => setForm((value) => ({ ...value, teacher: event.target.value }))}>
            <option value="">Assign later</option>
            {(options?.teachers || []).map((row) => <option key={row.id} value={row.id}>{row.name} · {row.email}</option>)}
          </SelectField>
          <Field label="Capacity" type="number" min="1" max="500" value={form.capacity} onChange={(event) => setForm((value) => ({ ...value, capacity: event.target.value }))} />
          <Field label="Schedule" value={form.schedule} onChange={(event) => setForm((value) => ({ ...value, schedule: event.target.value }))} placeholder="e.g. Mon/Wed 10:00" />
          <SelectField label="Offering status" value={form.status} onChange={(event) => setForm((value) => ({ ...value, status: event.target.value }))}>
            {['draft', 'open', 'in_progress', 'completed', 'cancelled'].map((value) => <option key={value} value={value}>{humanStatus(value)}</option>)}
          </SelectField>
        </FormGrid>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">{selected.length} selected</p>
          {available.length ? (
            <button type="button" onClick={() => setSelected(available.map((row) => row.id))} className="focus-ring rounded-lg text-xs font-semibold text-brand-700 hover:underline">
              Select all available
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

function EditOfferingModal({ offering, options, onClose, onSaved }) {
  const [form, setForm] = useState({ teacher: '', capacity: 60, schedule: '', status: 'draft' });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!offering) return;
    setForm({
      teacher: offering.teacher?.id || '',
      capacity: offering.capacity || 60,
      schedule: offering.schedule || '',
      status: offering.status || 'draft',
    });
    setError('');
  }, [offering]);

  const save = useMutation({
    mutationFn: async () => (await api.patch(`${REGISTRAR}/offerings/${offering.id}`, {
      teacher: form.teacher || null,
      capacity: Number(form.capacity) || 60,
      schedule: form.schedule,
      status: form.status,
    })).data,
    onSuccess: () => {
      toast.success('Offering updated.');
      onSaved?.();
      onClose?.();
    },
    onError: (err) => {
      const message = errorMessage(err, 'The offering could not be updated.');
      setError(message);
      toast.error(message);
    },
  });

  return (
    <Modal
      open={Boolean(offering)}
      title="Edit offering"
      subtitle={offering ? `${offering.course?.code} · ${offering.program?.code} · ${offering.term}` : ''}
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      footer={<><Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending}>Save offering</Button></>}
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        <FormGrid>
          <SelectField label="Teacher" value={form.teacher} onChange={(event) => setForm((value) => ({ ...value, teacher: event.target.value }))}>
            <option value="">Unassigned</option>
            {(options?.teachers || []).map((row) => <option key={row.id} value={row.id}>{row.name} · {row.email}</option>)}
          </SelectField>
          <Field label="Capacity" type="number" min="1" max="500" value={form.capacity} onChange={(event) => setForm((value) => ({ ...value, capacity: event.target.value }))} />
          <Field label="Schedule" value={form.schedule} onChange={(event) => setForm((value) => ({ ...value, schedule: event.target.value }))} />
          <SelectField label="Status" value={form.status} onChange={(event) => setForm((value) => ({ ...value, status: event.target.value }))}>
            {['draft', 'open', 'in_progress', 'completed', 'cancelled'].map((value) => <option key={value} value={value}>{humanStatus(value)}</option>)}
          </SelectField>
        </FormGrid>
        {Number(form.capacity) < (offering?.registeredCount || 0) ? (
          <p className="rounded-xl bg-rose-50 px-3.5 py-3 text-xs text-rose-800">Capacity cannot be lower than the {offering.registeredCount} students already registered. The server will reject it.</p>
        ) : null}
      </div>
    </Modal>
  );
}
