import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Layers3, Pencil, Plus } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import {
  REGISTRAR,
  cleanPayload,
  dateInput,
  humanStatus,
  levelLabel,
  toneForStatus,
} from '../../lib/registrar';
import { useDebounced } from '../../lib/useDebounced';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import { FormGrid, SelectField, TextAreaField } from '../../components/registrar/Fields';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import SearchInput from '../../components/ui/SearchInput';

export default function RegistrarBatches() {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [department, setDepartment] = useState('');
  const [program, setProgram] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [formModal, setFormModal] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [progressing, setProgressing] = useState(null);

  const options = useQuery({
    queryKey: ['registrar', 'students', 'options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/students/options`)).data,
    staleTime: 5 * 60_000,
  });

  const programs = (options.data?.programs || []).filter((row) => !department || row.department === department);

  const params = useMemo(() => ({
    page,
    limit,
    ...(debounced.trim() ? { search: debounced.trim() } : {}),
    ...(department ? { department } : {}),
    ...(program ? { program } : {}),
    ...(category ? { category } : {}),
    ...(status !== 'all' ? { status } : {}),
  }), [page, limit, debounced, department, program, category, status]);

  const query = useQuery({
    queryKey: ['registrar', 'batches', params],
    queryFn: async () => (await api.get(`${REGISTRAR}/batches`, { params })).data,
    placeholderData: (previous) => previous,
  });

  const rows = query.data?.rows ?? [];
  const pagination = query.data?.pagination ?? { page: 1, pages: 1, total: 0, limit };

  const columns = [
    {
      key: 'batch',
      label: 'Batch',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-900">{row.code}</p>
          <p className="text-xs text-slate-500">{row.name}</p>
        </div>
      ),
    },
    { key: 'program', label: 'Programme', render: (row) => row.program ? `${row.program.code} · ${row.program.name}` : '—' },
    { key: 'category', label: 'Stream', render: (row) => <Badge tone={row.category === 'extension' ? 'warning' : 'neutral'}>{humanStatus(row.category || 'regular')}</Badge> },
    {
      key: 'students',
      label: 'Students',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-800">{row.studentCount}</p>
          <p className="text-xs text-slate-400">{levelLabel(row.currentLevel, row.program?.qualificationType)}</p>
        </div>
      ),
    },
    { key: 'year', label: 'Admission year', render: (row) => row.admissionAcademicYear?.label || '—' },
    { key: 'status', label: 'Status', render: (row) => <Badge tone={toneForStatus(row.status)}>{humanStatus(row.status)}</Badge> },
    {
      key: 'actions',
      label: '',
      className: 'text-right',
      mobileFull: true,
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => setAssigning(row)}>Assign</Button>
          <Button size="sm" variant="secondary" onClick={() => setProgressing(row)}>Progress</Button>
          <Button size="sm" variant="ghost" onClick={() => setFormModal({ record: row })} aria-label={`Edit ${row.code}`}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Batches"
        subtitle="A batch groups students who entered a programme together. Assignment and progression are recorded in the student's history."
        actions={<Button onClick={() => setFormModal({ record: null })} className="gap-2"><Plus className="h-4 w-4" /> New batch</Button>}
      />

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <SearchInput value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search batch code or name" loading={query.isFetching} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField label="Department" value={department} onChange={(event) => { setDepartment(event.target.value); setProgram(''); setPage(1); }}>
              <option value="">All departments</option>
              {(options.data?.departments || []).map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}
            </SelectField>
            <SelectField label="Programme" value={program} onChange={(event) => { setProgram(event.target.value); setPage(1); }}>
              <option value="">All programmes</option>
              {programs.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}
            </SelectField>
            <SelectField label="Stream" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}>
              <option value="">Both streams</option>
              <option value="regular">Regular</option>
              <option value="extension">Extension</option>
            </SelectField>
            <SelectField label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="all">All statuses</option>
              {['planned', 'active', 'completed', 'archived'].map((value) => <option key={value} value={value}>{humanStatus(value)}</option>)}
            </SelectField>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Batch register</h2>
            <p className="mt-0.5 text-xs text-slate-500">{pagination.total ?? 0} batch{pagination.total === 1 ? '' : 'es'}</p>
          </div>
          <Layers3 className="h-4 w-4 text-slate-300" />
        </div>
        <RegistrarTable
          columns={columns}
          rows={rows}
          loading={query.isLoading}
          error={query.error ? query.error?.response?.data?.message || 'Batches could not be loaded.' : null}
          onRetry={query.refetch}
          rowKey={(row) => row.id}
          noResults={Boolean(debounced.trim() || department || program || category || status !== 'all')}
          emptyTitle="No batches yet"
          emptyMessage="Create a batch to group a programme intake."
        />
        <div className="px-5 pb-4">
          <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPage={setPage} onLimit={(value) => { setLimit(value); setPage(1); }} />
        </div>
      </Card>

      <BatchFormModal
        open={Boolean(formModal)}
        record={formModal?.record}
        options={options.data}
        onClose={() => setFormModal(null)}
        onSaved={() => query.refetch()}
      />
      <AssignModal batch={assigning} onClose={() => setAssigning(null)} onSaved={() => query.refetch()} />
      <ProgressModal batch={progressing} onClose={() => setProgressing(null)} onSaved={() => query.refetch()} />
    </div>
  );
}

function BatchFormModal({ open, record, options, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm({
      code: record?.code || '',
      name: record?.name || '',
      program: record?.program?.id || '',
      category: record?.category || 'regular',
      admissionAcademicYear: record?.admissionAcademicYear?.id || '',
      expectedCompletionYear: record?.expectedCompletionYear || '',
      currentLevel: record?.currentLevel || 1,
      status: record?.status || 'planned',
    });
  }, [open, record]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.code.trim() || !form.name.trim() || !form.program || !form.admissionAcademicYear) {
        throw new Error('Code, name, programme and admission year are required.');
      }
      const payload = cleanPayload({
        ...form,
        currentLevel: Number(form.currentLevel) || 1,
        expectedCompletionYear: form.expectedCompletionYear ? Number(form.expectedCompletionYear) : undefined,
      });
      return (
        await api.request({
          url: `${REGISTRAR}/batches${record ? `/${record.id}` : ''}`,
          method: record ? 'patch' : 'post',
          data: payload,
        })
      ).data;
    },
    onSuccess: () => {
      toast.success(record ? 'Batch updated.' : 'Batch created.');
      onSaved?.();
      onClose?.();
    },
    onError: (err) => {
      const message = errorMessage(err, 'The batch could not be saved.');
      setError(message);
      toast.error(message);
    },
  });

  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const selectedProgram = (options?.programs || []).find((row) => row.id === form.program);
  const availableCategories = selectedProgram?.categories?.length ? selectedProgram.categories : ['regular', 'extension'];
  const chooseProgram = (programId) => {
    const next = (options?.programs || []).find((row) => row.id === programId);
    const categories = next?.categories?.length ? next.categories : ['regular', 'extension'];
    setForm((current) => ({
      ...current,
      program: programId,
      category: categories.includes(current.category) ? current.category : categories[0],
    }));
  };

  return (
    <Modal
      open={open}
      title={record ? 'Edit batch' : 'New batch'}
      subtitle="The department is taken from the programme by the server. A batch belongs to one delivery stream."
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      footer={<><Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending}>{record ? 'Save changes' : 'Create batch'}</Button></>}
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        <FormGrid>
          <Field label="Batch code" value={form.code || ''} onChange={(event) => set('code', event.target.value)} placeholder="e.g. CS-2026-A" required />
          <Field label="Batch name" value={form.name || ''} onChange={(event) => set('name', event.target.value)} placeholder="e.g. Computer Science intake A" required />
          <SelectField
            label="Programme"
            value={form.program || ''}
            onChange={(event) => chooseProgram(event.target.value)}
            hint={selectedProgram ? `${selectedProgram.code} · ${selectedProgram.name}` : undefined}
            required
          >
            <option value="">Choose a programme</option>
            {(options?.programs || []).map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}
          </SelectField>
          <SelectField label="Delivery stream" value={form.category || 'regular'} onChange={(event) => set('category', event.target.value)} required>
            {availableCategories.map((value) => <option key={value} value={value}>{humanStatus(value)}</option>)}
          </SelectField>
          <SelectField label="Admission academic year" value={form.admissionAcademicYear || ''} onChange={(event) => set('admissionAcademicYear', event.target.value)} required>
            <option value="">Choose a year</option>
            {(options?.academicYears || []).map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}
          </SelectField>
          <Field label="Expected completion year" type="number" min="2000" max="2300" value={form.expectedCompletionYear || ''} onChange={(event) => set('expectedCompletionYear', event.target.value)} />
          <Field label="Current level" type="number" min="1" max="20" value={form.currentLevel || 1} onChange={(event) => set('currentLevel', event.target.value)} />
          <SelectField label="Status" value={form.status || 'planned'} onChange={(event) => set('status', event.target.value)}>
            {['planned', 'active', 'completed', 'archived'].map((value) => <option key={value} value={value}>{humanStatus(value)}</option>)}
          </SelectField>
        </FormGrid>
      </div>
    </Modal>
  );
}

function AssignModal({ batch, onClose, onSaved }) {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [selected, setSelected] = useState([]);
  const [level, setLevel] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (batch) {
      setSearch('');
      setSelected([]);
      setLevel('');
      setError('');
    }
  }, [batch]);

  const candidates = useQuery({
    queryKey: ['registrar', 'batch-candidates', batch?.id, batch?.program?.id, debounced],
    queryFn: async () => (await api.get(`${REGISTRAR}/students`, {
      params: {
        program: batch.program.id,
        category: batch.category || 'regular',
        limit: 50,
        sort: 'fullName',
        order: 'asc',
        ...(debounced.trim() ? { search: debounced.trim() } : {}),
      },
    })).data,
    enabled: Boolean(batch?.program?.id),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!selected.length) throw new Error('Choose at least one student.');
      return (await api.post(`${REGISTRAR}/batches/${batch.id}/assign`, {
        studentIds: selected,
        ...(level ? { level: Number(level) } : {}),
      })).data;
    },
    onSuccess: (data) => {
      toast.success(`${data.affected ?? selected.length} student${data.affected === 1 ? '' : 's'} assigned to ${batch.code}.`);
      onSaved?.();
      onClose?.();
    },
    onError: (err) => {
      const message = errorMessage(err, 'The students could not be assigned.');
      setError(message);
      toast.error(message);
    },
  });

  return (
    <Modal
      open={Boolean(batch)}
      title={`Assign students${batch ? ` · ${batch.code}` : ''}`}
      subtitle="Only students in this programme can be assigned. Existing batch membership is changed, not duplicated."
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      footer={<><Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!selected.length}>Assign {selected.length || ''}</Button></>}
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        <SearchInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a student in this programme" loading={candidates.isFetching} />
        <Field label="Set level (optional)" type="number" min="1" max="20" value={level} onChange={(event) => setLevel(event.target.value)} hint="Leave blank to keep each student's current level." />
        <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-2xl border border-slate-100 p-2">
          {(candidates.data?.rows || []).map((row) => {
            const checked = selected.includes(row.id);
            return (
              <label key={row.id} className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${checked ? 'bg-brand-50 text-brand-900' : 'hover:bg-slate-50'}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => setSelected((current) => checked ? current.filter((id) => id !== row.id) : [...current, row.id])}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{row.fullName}</span>
                  <span className="block truncate text-xs text-slate-500">{row.studentId} · {levelLabel(row.level, row.program?.qualificationType)} · {row.batch?.code || 'No batch'}</span>
                </span>
              </label>
            );
          })}
          {!candidates.isFetching && !(candidates.data?.rows || []).length ? <p className="px-3 py-5 text-sm text-slate-500">No student in this programme matches.</p> : null}
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">{selected.length} selected</p>
          <button type="button" className="focus-ring rounded-lg text-xs font-semibold text-brand-700 hover:underline" onClick={() => setSelected((candidates.data?.rows || []).map((row) => row.id))}>
            Select listed students
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ProgressModal({ batch, onClose, onSaved }) {
  const [form, setForm] = useState({ toLevel: '', complete: false, effectiveDate: dateInput(new Date()), reason: '' });
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');

  const students = useQuery({
    queryKey: ['registrar', 'batch-students', batch?.id],
    queryFn: async () => (await api.get(`${REGISTRAR}/students`, { params: { batch: batch.id, limit: 100, sort: 'fullName', order: 'asc' } })).data,
    enabled: Boolean(batch?.id),
  });

  useEffect(() => {
    if (!batch) return;
    setForm({ toLevel: '', complete: false, effectiveDate: dateInput(new Date()), reason: '' });
    setSelected([]);
    setError('');
  }, [batch]);

  useEffect(() => {
    if (students.data?.rows) setSelected(students.data.rows.map((row) => row.id));
  }, [students.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!selected.length) throw new Error('Choose at least one student.');
      if (!form.complete && !form.toLevel) throw new Error('Choose the level to move to, or mark the programme complete.');
      if (!form.reason.trim()) throw new Error('Write the reason for this progression.');
      return (await api.post(`${REGISTRAR}/batches/${batch.id}/progress`, {
        studentIds: selected,
        ...(form.complete ? { complete: true } : { toLevel: Number(form.toLevel) }),
        effectiveDate: form.effectiveDate,
        reason: form.reason.trim(),
      })).data;
    },
    onSuccess: (data) => {
      toast.success(`${data.affected ?? selected.length} student${data.affected === 1 ? '' : 's'} progressed.`);
      onSaved?.();
      onClose?.();
    },
    onError: (err) => {
      const message = errorMessage(err, 'Progression could not be recorded.');
      setError(message);
      toast.error(message);
    },
  });

  return (
    <Modal
      open={Boolean(batch)}
      title={`Progress batch${batch ? ` · ${batch.code}` : ''}`}
      subtitle="Progression updates the student level and active enrollment and writes an immutable history record."
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      footer={<><Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!selected.length}>{form.complete ? 'Mark completed' : 'Record progression'}</Button></>}
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        <div className="rounded-2xl border border-slate-100 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{selected.length} student{selected.length === 1 ? '' : 's'} selected</p>
          <div className="max-h-32 space-y-1 overflow-y-auto">
            {(students.data?.rows || []).map((row) => (
              <label key={row.id} className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={selected.includes(row.id)}
                  onChange={() => setSelected((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600"
                />
                <span className="truncate">{row.fullName} · {row.studentId} · {levelLabel(row.level, row.program?.qualificationType)}</span>
              </label>
            ))}
          </div>
        </div>
        <FormGrid>
          <Field label="Move to level" type="number" min="1" max="20" value={form.toLevel} onChange={(event) => setForm((value) => ({ ...value, toLevel: event.target.value }))} disabled={form.complete} required={!form.complete} />
          <Field label="Effective date" type="date" value={form.effectiveDate} onChange={(event) => setForm((value) => ({ ...value, effectiveDate: event.target.value }))} required />
          <label className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-3 text-sm text-amber-900 sm:col-span-2">
            <input type="checkbox" checked={form.complete} onChange={(event) => setForm((value) => ({ ...value, complete: event.target.checked }))} className="h-4 w-4 rounded border-amber-300 text-amber-600" />
            Mark the selected students as having completed the programme
          </label>
          <TextAreaField className="sm:col-span-2" label="Reason" rows={3} value={form.reason} onChange={(event) => setForm((value) => ({ ...value, reason: event.target.value }))} placeholder="e.g. End of 2026 academic year" required />
        </FormGrid>
        {form.complete ? (
          <p className="rounded-xl bg-rose-50 px-3.5 py-3 text-xs leading-relaxed text-rose-800">
            Completion sets each student's status to graduated and closes their active enrollment. Use it only after results and eligibility have been checked.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
