import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ChevronDown, ChevronRight, Eye, Info, Layers3, Pencil, Plus, Trash2 } from 'lucide-react';
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

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4'];

export default function RegistrarBatches() {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [program, setProgram] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [formModal, setFormModal] = useState(false);
  const [editBatch, setEditBatch] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteCode, setDeleteCode] = useState('');

  const studentSummary = useQuery({
    queryKey: ['registrar', 'batches', 'student-summary'],
    queryFn: async () => {
      const res = await api.get(`${REGISTRAR}/batches/groups`, { params: { limit: 500, status: 'all' } });
      const groups = res.data?.groups || [];
      return groups.map((g) => ({ name: g.code, count: g.studentCount || 0 }));
    },
    staleTime: 3 * 60_000,
  });

  const options = useQuery({
    queryKey: ['registrar', 'students', 'options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/students/options`)).data,
    staleTime: 5 * 60_000,
  });

  const params = useMemo(() => ({
    page,
    limit,
    ...(debounced.trim() ? { search: debounced.trim() } : {}),
    ...(program ? { program } : {}),
    ...(category ? { category } : {}),
    ...(status !== 'all' ? { status } : {}),
  }), [page, limit, debounced, program, category, status]);

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
          <Button size="sm" variant="ghost" onClick={() => setEditBatch(row)} aria-label={`Edit ${row.code}`}>
            <Pencil className="h-3.5 w-3.5 text-slate-600" />
          </Button>
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

      {/* Animated performance chart */}
      {studentSummary.data?.length > 0 && (
        <Card>
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Student enrollment by batch</h2>
              <p className="mt-0.5 text-xs text-slate-500">Total students across all batches.</p>
            </div>
            <span className="text-xs text-slate-500">
              {studentSummary.data.reduce((s, r) => s + r.count, 0)} students
            </span>
          </div>
          <div className="px-5 py-5 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={studentSummary.data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value) => [value, 'Students']}
                  labelFormatter={(label) => `Batch: ${label}`}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {studentSummary.data.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <SearchInput value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search batch code or name" loading={query.isFetching} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SelectField label="Programme" value={program} onChange={(event) => { setProgram(event.target.value); setPage(1); }}>
              <option value="">All programmes</option>
              {(options.data?.programs || []).map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}
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
          noResults={Boolean(debounced.trim() || program || category || status !== 'all')}
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
      <BatchFormModal
        open={Boolean(editBatch)}
        editBatch={editBatch}
        options={options.data}
        onClose={() => setEditBatch(null)}
        onSaved={() => { query.refetch(); setEditBatch(null); }}
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

function BatchFormModal({ open, options, onClose, onSaved, editBatch }) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(editBatch);
  const [form, setForm] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTimeout(() => {
      setError('');
      const currentYear = (options?.academicYears || []).find((year) => year.isCurrent);
      if (editBatch) {
        setForm({
          code: editBatch.code || '',
          name: editBatch.name || '',
          programs: (editBatch.programs || []).map((p) => p.id || p),
          category: editBatch.category || 'regular',
          admissionAcademicYear: editBatch.admissionAcademicYear?.id || '',
          status: editBatch.status || 'planned',
        });
      } else {
        setForm({
          code: '',
          name: '',
          programs: [],
          category: 'regular',
          admissionAcademicYear: currentYear?.id || '',
          status: 'planned',
        });
      }
    }, 0);
  }, [open, options, editBatch]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.admissionAcademicYear) {
        throw new Error('Admission academic year is required.');
      }
      if (!isEdit && !form.programs?.length) throw new Error('Choose at least one programme.');
      if (isEdit) {
        const payload = cleanPayload({
          code: form.code.trim() || undefined,
          name: form.name.trim() || undefined,
          category: form.category,
          admissionAcademicYear: form.admissionAcademicYear || undefined,
          status: form.status,
          programs: form.programs?.length ? form.programs : undefined,
        });
        return (await api.patch(`${REGISTRAR}/batches/${editBatch.batchIds[0]}`, payload)).data;
      }
      const payload = cleanPayload({
        code: form.code.trim() || undefined,
        name: form.name.trim() || undefined,
        category: form.category,
        admissionAcademicYear: form.admissionAcademicYear,
        status: form.status,
        programs: form.programs,
      });
      return (await api.post(`${REGISTRAR}/batches`, payload)).data;
    },
    onSuccess: (data) => {
      const count = data.batches?.length;
      toast.success(isEdit ? 'Batch updated.' : (count > 1 ? `${count} programme batch rows created.` : 'Batch created.'));
      queryClient.invalidateQueries({ queryKey: ['registrar', 'students', 'options'] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'offering-options'] });
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
  const chosen = (form.programs || []).map((id) => (options?.programs || []).find((row) => row.id === id)).filter(Boolean);
  const categories = chosen.length
    ? chosen.reduce((allowed, row) => {
        const next = row.categories?.length ? row.categories : ['regular', 'extension'];
        return allowed.filter((category) => next.includes(category));
      }, ['regular', 'extension'])
    : ['regular', 'extension'];

  const toggleProgram = (programId) => {
    setForm((current) => {
      const programs = (current.programs || []).includes(programId)
        ? current.programs.filter((id) => id !== programId)
        : [...(current.programs || []), programId];
      const allowed = programs.length
        ? (options?.programs || [])
            .filter((row) => programs.includes(row.id))
            .reduce((values, row) => values.filter((category) => (row.categories?.length ? row.categories : ['regular', 'extension']).includes(category)), ['regular', 'extension'])
        : ['regular', 'extension'];
      return {
        ...current,
        programs,
        category: allowed.includes(current.category) ? current.category : allowed[0] || 'regular',
      };
    });
  };

  // Auto-generate code and name when fields are blank
  const handleAdmissionYearChange = (value) => {
    set('admissionAcademicYear', value);
    const year = (options?.academicYears || []).find((y) => y.id === value);
    if (year && !form.code) {
      const startYear = new Date(year.startDate).getFullYear();
      set('code', `REG-BAT-${startYear}`);
      set('name', `${startYear} ${form.category === 'extension' ? 'Extension' : 'Regular'} Students`);
    }
  };

  const handleCategoryChange = (value) => {
    set('category', value);
    if (!form.name) {
      const year = (options?.academicYears || []).find((y) => y.id === form.admissionAcademicYear);
      if (year) {
        const startYear = new Date(year.startDate).getFullYear();
        set('name', `${startYear} ${value === 'extension' ? 'Extension' : 'Regular'} Students`);
      }
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? `Edit batch: ${editBatch?.code || ''}` : 'New batch'}
      size="lg"
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      footer={<><Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending}>{isEdit ? 'Save batch' : 'Create batch'}</Button></>}
    >
      <div className="space-y-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}

        <div className="flex items-start gap-2.5 rounded-xl border border-sky-100 bg-sky-50/70 p-3 text-xs text-sky-800">
          <Info className="h-4 w-4 shrink-0 text-sky-600 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold">Automatic generation & structure inheritance</p>
            <p className="text-sky-700 leading-relaxed">
              Batch code and name generate automatically if left blank. Duration years and levels are automatically taken from the programmes in Academic Structure and shown in batch details.
            </p>
          </div>
        </div>

        <FormGrid>
          <SelectField label="Delivery stream" value={form.category || 'regular'} onChange={(e) => handleCategoryChange(e.target.value)} required>
            {categories.map((value) => <option key={value} value={value}>{humanStatus(value)}</option>)}
          </SelectField>
          <SelectField label="Admission academic year" value={form.admissionAcademicYear || ''} onChange={(e) => handleAdmissionYearChange(e.target.value)} required>
            <option value="">Choose a year</option>
            {(options?.academicYears || []).map((year) => <option key={year.id} value={year.id}>{year.label}{year.isCurrent ? ' · current' : ''}</option>)}
          </SelectField>
        </FormGrid>

        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 sm:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {isEdit ? 'Programmes in this batch' : 'Programmes to include'}
            </p>
            <span className="text-xs text-slate-400">{(form.programs || []).length} selected</span>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-slate-100 bg-white p-2">
            {(options?.programs || []).map((row) => (
              <label key={row.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={(form.programs || []).includes(row.id)}
                  onChange={() => toggleProgram(row.id)}
                  disabled={isEdit}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                />
                <span className="min-w-0 flex-1 truncate font-medium">{row.code} · {row.name}</span>
                <span className="text-xs text-slate-400">{row.qualificationType || ''}</span>
              </label>
            ))}
            {!options?.programs?.length ? <p className="px-2 py-3 text-sm text-slate-500">No programmes available.</p> : null}
          </div>
        </div>

        <FormGrid>
          <Field
            label="Batch code"
            value={form.code || ''}
            onChange={(event) => set('code', event.target.value)}
            placeholder="Auto: REG-BAT-2026"
          />
          <Field
            label="Batch name"
            value={form.name || ''}
            onChange={(event) => set('name', event.target.value)}
            placeholder="Auto: 2026 Regular Students"
          />
          <SelectField label="Status" value={form.status || 'planned'} onChange={(event) => set('status', event.target.value)}>
            {['planned', 'active', 'completed', 'archived'].map((value) => <option key={value} value={value}>{humanStatus(value)}</option>)}
          </SelectField>
        </FormGrid>
      </div>
    </Modal>
  );
}
