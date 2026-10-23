import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Eye, Layers3, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import {
  REGISTRAR,
  cleanPayload,
  humanStatus,
  toneForStatus,
} from '../../lib/registrar';
import { useDebounced } from '../../lib/useDebounced';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import { FormGrid, SelectField } from '../../components/registrar/Fields';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import CodeInput from '../../components/ui/CodeInput';
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
  const [formModal, setFormModal] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteCode, setDeleteCode] = useState('');

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
    queryKey: ['registrar', 'batch-groups', params],
    queryFn: async () => (await api.get(`${REGISTRAR}/batches/groups`, { params })).data,
    placeholderData: (previous) => previous,
  });

  const rows = query.data?.groups ?? [];
  const pagination = query.data?.pagination ?? { page: 1, pages: 1, total: 0, limit };

  const requestDeleteCode = useMutation({
    mutationFn: async () => (await api.post(`${REGISTRAR}/batches/groups/delete-code`)).data,
    onSuccess: (data) => {
      setDeleteCode('');
      toast.success(data?.message || 'A confirmation code was emailed to your account.');
    },
    onError: (error) => toast.error(errorMessage(error, 'The confirmation code could not be sent.')),
  });

  const removeGroup = useMutation({
    mutationFn: async () =>
      (
        await api.post(`${REGISTRAR}/batches/groups/delete`, {
          batchIds: deleteTarget.batchIds,
          confirmText: deleteTarget.code,
          code: deleteCode,
        })
      ).data,
    onSuccess: (data) => {
      toast.success(data?.message || 'Batch deleted.');
      setDeleteTarget(null);
      setDeleteCode('');
      query.refetch();
    },
    onError: (error) => toast.error(errorMessage(error, 'The batch could not be deleted.')),
  });

  const openDelete = (group) => {
    setDeleteTarget(group);
    setDeleteCode('');
    requestDeleteCode.mutate();
  };

  const columns = [
    {
      key: 'batch',
      label: 'Batch',
      render: (row) => (
        <div className="flex items-start gap-2">
          {row.programs.length > 1 ? (
            <button
              type="button"
              onClick={() => setExpanded((current) => ({ ...current, [row.id]: !current[row.id] }))}
              className="focus-ring mt-0.5 rounded p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
              aria-label={expanded[row.id] ? 'Collapse programmes' : 'Expand programmes'}
            >
              {expanded[row.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="w-6" />
          )}
          <div>
            <p className="text-sm font-semibold text-slate-900">{row.code}</p>
            <p className="text-xs text-slate-500">{row.name}</p>
            {expanded[row.id] ? (
              <ul className="mt-2 space-y-1">
                {row.programs.map((programRow) => (
                  <li key={programRow.id} className="text-xs text-slate-600">
                    <span className="font-mono">{programRow.code}</span> · {programRow.name}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      label: 'Stream',
      render: (row) => (
        <Badge tone={row.category === 'extension' ? 'warning' : 'neutral'}>
          {humanStatus(row.category || 'regular')}
        </Badge>
      ),
    },
    {
      key: 'programmes',
      label: 'Programmes',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-800">{row.programs.length}</p>
          <p className="max-w-[220px] truncate text-xs text-slate-400">
            {row.programs.map((programRow) => programRow.code).join(', ')}
          </p>
        </div>
      ),
    },
    {
      key: 'students',
      label: 'Students',
      render: (row) => <span className="text-sm font-semibold text-slate-800">{row.studentCount}</span>,
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
          <Link
            to={`/registrar/batches/${row.batchIds[0]}`}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
          >
            <Eye className="h-3.5 w-3.5" /> View
          </Link>
          <Button size="sm" variant="ghost" onClick={() => openDelete(row)} aria-label={`Delete ${row.code}`}>
            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Batches"
        subtitle="One intake group across programmes. Regular and extension groups stay separate while sharing the same batch code."
        actions={<Button onClick={() => setFormModal(true)} className="gap-2"><Plus className="h-4 w-4" /> New batch</Button>}
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
            <h2 className="text-sm font-semibold text-slate-900">Batch groups</h2>
            <p className="mt-0.5 text-xs text-slate-500">{pagination.total ?? 0} group{pagination.total === 1 ? '' : 's'}</p>
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
        open={formModal}
        options={options.data}
        onClose={() => setFormModal(false)}
        onSaved={() => query.refetch()}
      />

      <Modal
        open={Boolean(deleteTarget)}
        onClose={removeGroup.isPending ? undefined : () => setDeleteTarget(null)}
        title="Delete this batch group?"
        subtitle={deleteTarget ? `${deleteTarget.code} · ${humanStatus(deleteTarget.category)}` : ''}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={removeGroup.isPending}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => removeGroup.mutate()}
              loading={removeGroup.isPending}
              disabled={deleteCode.length !== 6 || requestDeleteCode.isPending}
            >
              Delete batch
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-600">
            This removes the batch row from every programme in the group. A batch with students or offerings cannot be
            deleted; move those records first or archive the batch instead.
          </p>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-700">Email confirmation code</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => requestDeleteCode.mutate()}
                loading={requestDeleteCode.isPending}
              >
                Email me a code
              </Button>
            </div>
            <div className="mt-3">
              <CodeInput value={deleteCode} onChange={setDeleteCode} disabled={removeGroup.isPending} />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function BatchFormModal({ open, options, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    const currentYear = (options?.academicYears || []).find((year) => year.isCurrent);
    setForm({
      code: '',
      name: '',
      department: '',
      programs: [],
      category: 'regular',
      admissionAcademicYear: currentYear?.id || '',
      durationYears: '',
      currentLevel: 1,
      status: 'planned',
    });
  }, [open, options]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.department || !form.admissionAcademicYear) {
        throw new Error('Department and admission year are required.');
      }
      if (!form.programs?.length) throw new Error('Choose at least one programme.');
      const payload = cleanPayload({
        code: form.code.trim() || undefined,
        name: form.name.trim() || undefined,
        category: form.category,
        admissionAcademicYear: form.admissionAcademicYear,
        durationYears: form.durationYears ? Number(form.durationYears) : undefined,
        currentLevel: Number(form.currentLevel) || 1,
        status: form.status,
        department: form.department,
        programs: form.programs,
      });
      return (await api.post(`${REGISTRAR}/batches`, payload)).data;
    },
    onSuccess: (data) => {
      const count = data.batches?.length;
      toast.success(count > 1 ? `${count} programme batch rows created.` : 'Batch created.');
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
  const chosen = programmes.filter((row) => (form.programs || []).includes(row.id));
  const categories = chosen.length
    ? chosen.reduce((allowed, row) => {
        const next = row.categories?.length ? row.categories : ['regular', 'extension'];
        return allowed.filter((category) => next.includes(category));
      }, ['regular', 'extension'])
    : ['regular', 'extension'];

  const chooseDepartment = (department) => {
    setForm((current) => ({ ...current, department, programs: [], category: 'regular' }));
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

  return (
    <Modal
      open={open}
      title="New batch"
      subtitle="Choose a department and every programme that shares this intake. The code and name are generated when left blank."
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      footer={<><Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending}>Create batch</Button></>}
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        <FormGrid>
          <Field label="Batch code" value={form.code || ''} onChange={(event) => set('code', event.target.value)} placeholder="Auto: BAT-2026" hint="Leave blank to use BAT-<admission year>." />
          <Field label="Batch name" value={form.name || ''} onChange={(event) => set('name', event.target.value)} placeholder="Auto: 2026 Regular Students" hint="Leave blank to generate a stream-aware name." />
          <SelectField label="Department" value={form.department || ''} onChange={(event) => chooseDepartment(event.target.value)} required>
            <option value="">Choose a department</option>
            {(options?.departments || []).map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}
          </SelectField>
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
        <p className="text-xs leading-relaxed text-slate-500">Every ticked programme gets its own batch row, sharing this code, stream and admission year. Student numbers count per programme.</p>
      </div>
    </Modal>
  );
}
