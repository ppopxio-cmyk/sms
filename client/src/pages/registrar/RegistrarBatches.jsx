import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Eye, Layers3, Pencil, Plus } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import {
  REGISTRAR,
  cleanPayload,
  humanStatus,
  levelLabel,
  toneForStatus,
} from '../../lib/registrar';
import { useDebounced } from '../../lib/useDebounced';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import { FormGrid, SelectField } from '../../components/registrar/Fields';
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
    { key: 'department', label: 'Department', render: (row) => row.department ? `${row.department.code} · ${row.department.name}` : '—' },
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
          <Link to={`/registrar/batches/${row.id}`} className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-brand-700 hover:bg-brand-50">
            <Eye className="h-3.5 w-3.5" /> View
          </Link>
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
        subtitle="Create an intake for one or more programmes, then open it for the student register and Word or PDF export."
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
    </div>
  );
}

function BatchFormModal({ open, record, options, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    const currentYear = (options?.academicYears || []).find((year) => year.isCurrent);
    setForm({
      code: record?.code || '',
      name: record?.name || '',
      department: record?.department?.id || '',
      program: record?.program?.id || '',
      programs: record?.program?.id ? [record.program.id] : [],
      category: record?.category || 'regular',
      admissionAcademicYear: record?.admissionAcademicYear?.id || currentYear?.id || '',
      durationYears: record?.durationYears || '',
      currentLevel: record?.currentLevel || 1,
      status: record?.status || 'planned',
    });
  }, [open, record, options]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.code?.trim() || !form.name?.trim() || !form.department || !form.admissionAcademicYear) {
        throw new Error('Code, name, department and admission year are required.');
      }
      if (record ? !form.program : !form.programs?.length) {
        throw new Error('Choose at least one programme.');
      }
      const payload = cleanPayload({
        code: form.code.trim(),
        name: form.name.trim(),
        category: form.category,
        admissionAcademicYear: form.admissionAcademicYear,
        durationYears: form.durationYears ? Number(form.durationYears) : undefined,
        currentLevel: Number(form.currentLevel) || 1,
        status: form.status,
        ...(record
          ? { program: form.program }
          : { department: form.department, programs: form.programs }),
      });
      return (
        await api.request({
          url: `${REGISTRAR}/batches${record ? `/${record.id}` : ''}`,
          method: record ? 'patch' : 'post',
          data: payload,
        })
      ).data;
    },
    onSuccess: (data) => {
      const count = data.batches?.length;
      toast.success(record ? 'Batch updated.' : count > 1 ? `${count} batches created.` : 'Batch created.');
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
  const programmes = (options?.programs || []).filter((row) => !form.department || row.department === form.department);
  const chosen = (record
    ? programmes.filter((row) => row.id === form.program)
    : programmes.filter((row) => (form.programs || []).includes(row.id)));
  const categories = chosen.length
    ? chosen.reduce((allowed, row) => {
        const next = row.categories?.length ? row.categories : ['regular', 'extension'];
        return allowed.filter((category) => next.includes(category));
      }, ['regular', 'extension'])
    : ['regular', 'extension'];

  const chooseDepartment = (department) => {
    setForm((current) => ({
      ...current,
      department,
      program: '',
      programs: [],
      category: 'regular',
    }));
  };

  const toggleProgram = (programId) => {
    const program = programmes.find((row) => row.id === programId);
    setForm((current) => {
      const programs = current.programs.includes(programId)
        ? current.programs.filter((id) => id !== programId)
        : [...current.programs, programId];
      const allowed = programs.length
        ? programmes
            .filter((row) => programs.includes(row.id))
            .reduce((values, row) => values.filter((category) => (row.categories?.length ? row.categories : ['regular', 'extension']).includes(category)), ['regular', 'extension'])
        : ['regular', 'extension'];
      return {
        ...current,
        programs,
        category: allowed.includes(current.category) ? current.category : allowed[0] || 'regular',
        durationYears:
          current.durationYears || (programs.length === 1 && program?.durationYears ? Math.min(5, program.durationYears) : ''),
      };
    });
  };

  const chooseProgram = (programId) => {
    const program = programmes.find((row) => row.id === programId);
    const allowed = program?.categories?.length ? program.categories : ['regular', 'extension'];
    setForm((current) => ({
      ...current,
      program: programId,
      category: allowed.includes(current.category) ? current.category : allowed[0],
      durationYears: current.durationYears || (program?.durationYears ? Math.min(5, program.durationYears) : ''),
    }));
  };

  return (
    <Modal
      open={open}
      title={record ? 'Edit batch' : 'New batch'}
      subtitle={record ? 'Update this intake. Its programme and department anchor student numbers and records.' : 'Choose a department, then tick every programme that shares this intake.'}
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      footer={<><Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending}>{record ? 'Save changes' : 'Create batch'}</Button></>}
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        <FormGrid>
          <Field label="Batch code" value={form.code || ''} onChange={(event) => set('code', event.target.value)} placeholder="e.g. 2026-A" required />
          <Field label="Batch name" value={form.name || ''} onChange={(event) => set('name', event.target.value)} placeholder="e.g. 2026 intake A" required />
          <SelectField label="Department" value={form.department || ''} onChange={(event) => chooseDepartment(event.target.value)} required>
            <option value="">Choose a department</option>
            {(options?.departments || []).map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}
          </SelectField>
          {record ? (
            <SelectField label="Programme" value={form.program || ''} onChange={(event) => chooseProgram(event.target.value)} disabled={!form.department} required>
              <option value="">Choose a programme</option>
              {programmes.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}
            </SelectField>
          ) : (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 sm:col-span-2">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Programmes in this batch</p>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-100 bg-white p-2">
                {programmes.map((row) => (
                  <label key={row.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={(form.programs || []).includes(row.id)}
                      onChange={() => toggleProgram(row.id)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600"
                    />
                    <span className="min-w-0 flex-1 truncate">{row.code} · {row.name}</span>
                  </label>
                ))}
                {!programmes.length ? <p className="px-2 py-3 text-sm text-slate-500">Choose a department with active programmes.</p> : null}
              </div>
            </div>
          )}
          <SelectField label="Delivery stream" value={form.category || 'regular'} onChange={(event) => set('category', event.target.value)} required>
            {categories.map((value) => <option key={value} value={value}>{humanStatus(value)}</option>)}
          </SelectField>
          <SelectField label="Admission academic year" value={form.admissionAcademicYear || ''} onChange={(event) => set('admissionAcademicYear', event.target.value)} required>
            <option value="">Choose a year</option>
            {(options?.academicYears || []).map((year) => <option key={year.id} value={year.id}>{year.label}{year.isCurrent ? ' · current' : ''}</option>)}
          </SelectField>
          <Field label="Duration (years)" type="number" min="1" max="5" value={form.durationYears || ''} onChange={(event) => set('durationYears', event.target.value)} hint="Expected completion is calculated from the admission year. Maximum 5 years." />
          <Field label="Current level" type="number" min="1" max="20" value={form.currentLevel || 1} onChange={(event) => set('currentLevel', event.target.value)} />
          <SelectField label="Status" value={form.status || 'planned'} onChange={(event) => set('status', event.target.value)}>
            {['planned', 'active', 'completed', 'archived'].map((value) => <option key={value} value={value}>{humanStatus(value)}</option>)}
          </SelectField>
        </FormGrid>
        {!record ? <p className="text-xs leading-relaxed text-slate-500">One batch will be created for each ticked programme, sharing this code, name, stream and admission year.</p> : null}
      </div>
    </Modal>
  );
}
