import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Layers3, Plus } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import {
  REGISTRAR,
  cleanPayload,
  dateInput,
  displayDate,
  humanStatus,
  levelLabel,
  toneForStatus,
} from '../../lib/registrar';
import { useDebounced } from '../../lib/useDebounced';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import StudentPicker from '../../components/registrar/StudentPicker';
import { FormGrid, SelectField } from '../../components/registrar/Fields';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import SearchInput from '../../components/ui/SearchInput';
import FilterTabs from '../../components/ui/FilterTabs';

export default function RegistrarEnrollments() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [status, setStatus] = useState('all');
  const [academicYear, setAcademicYear] = useState('');
  const [program, setProgram] = useState('');
  const [department, setDepartment] = useState('');
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [creating, setCreating] = useState(false);
  const [editingStatus, setEditingStatus] = useState(null);

  const options = useQuery({
    queryKey: ['registrar', 'students', 'options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/students/options`)).data,
    staleTime: 5 * 60_000,
  });

  const params = useMemo(
    () => ({
      page,
      limit,
      ...(debounced.trim() ? { search: debounced.trim() } : {}),
      ...(status !== 'all' ? { status } : {}),
      ...(academicYear ? { academicYear } : {}),
      ...(program ? { program } : {}),
      ...(department ? { department } : {}),
      ...(category !== 'all' ? { category } : {}),
    }),
    [page, limit, debounced, status, academicYear, program, department, category],
  );

  const query = useQuery({
    queryKey: ['registrar', 'enrollments', params],
    queryFn: async () => (await api.get(`${REGISTRAR}/enrollments`, { params })).data,
    placeholderData: (previous) => previous,
  });

  const rows = query.data?.rows ?? [];
  const pagination = query.data?.pagination ?? { page: 1, pages: 1, total: 0, limit };
  const filtered = Boolean(debounced.trim() || status !== 'all' || academicYear || program || department || category !== 'all');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['registrar', 'enrollments'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'students'] });
  };

  const columns = [
    {
      key: 'student',
      label: 'Student',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-900">{row.student?.fullName || 'Unknown student'}</p>
          <p className="text-xs text-slate-500">
            {row.student?.studentId || '�?"'} A� {humanStatus(row.student?.studentCategory || 'regular')}
          </p>
        </div>
      ),
    },
    {
      key: 'program',
      label: 'Programme',
      render: (row) => (
        <div>
          <p className="text-sm text-slate-700">{row.program?.code || '—'}</p>
          <p className="text-xs text-slate-400">{row.batch?.code || 'No batch'}</p>
        </div>
      ),
    },
    { key: 'year', label: 'Academic year', render: (row) => row.academicYear?.label || '—' },
    { key: 'level', label: 'Level', render: (row) => levelLabel(row.level, row.program?.qualificationType) },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <Badge tone={toneForStatus(row.status)}>{humanStatus(row.status)}</Badge>,
    },
    { key: 'date', label: 'Enrolled', render: (row) => displayDate(row.enrollmentDate) },
    {
      key: 'actions',
      label: '',
      className: 'text-right',
      mobileFull: true,
      render: (row) => (
        <Button size="sm" variant="secondary" onClick={(event) => { event.stopPropagation(); setEditingStatus(row); }}>
          Change status
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Enrollments"
        subtitle="Enrollment is the bridge between a student and an academic year. Activating it updates the student's level, batch and admission year."
        actions={
          <Button onClick={() => setCreating(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New enrollment
          </Button>
        }
      />

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <SearchInput
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder="Search by student name, ID or email"
            loading={query.isFetching}
          />
          <FilterTabs
            label="Student category"
            value={category}
            onChange={(value) => { setCategory(value); setPage(1); }}
            tabs={[
              { key: 'all', label: 'All students' },
              { key: 'regular', label: 'Regular' },
              { key: 'extension', label: 'Extension' },
            ]}
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="all">All statuses</option>
              {['pending', 'active', 'completed', 'withdrawn', 'cancelled'].map((value) => (
                <option key={value} value={value}>{humanStatus(value)}</option>
              ))}
            </SelectField>
            <SelectField label="Academic year" value={academicYear} onChange={(event) => { setAcademicYear(event.target.value); setPage(1); }}>
              <option value="">All academic years</option>
              {(options.data?.academicYears || []).map((year) => (
                <option key={year.id} value={year.id}>{year.label}</option>
              ))}
            </SelectField>
            <SelectField label="Department" value={department} onChange={(event) => { setDepartment(event.target.value); setProgram(''); setPage(1); }}>
              <option value="">All departments</option>
              {(options.data?.departments || []).map((row) => (
                <option key={row.id} value={row.id}>{row.code} A� {row.name}</option>
              ))}
            </SelectField>
            <SelectField label="Programme" value={program} onChange={(event) => { setProgram(event.target.value); setPage(1); }}>
              <option value="">All programmes</option>
              {(options.data?.programs || [])
                .filter((row) => !department || row.department === department)
                .map((row) => (
                  <option key={row.id} value={row.id}>{row.code} A� {row.name}</option>
                ))}
            </SelectField>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Enrollment records</h2>
            <p className="mt-0.5 text-xs text-slate-500">{pagination.total ?? 0} record{pagination.total === 1 ? '' : 's'}</p>
          </div>
          <Layers3 className="h-4 w-4 text-slate-300" />
        </div>
        <RegistrarTable
          columns={columns}
          rows={rows}
          loading={query.isLoading}
          error={query.error ? query.error?.response?.data?.message || 'Enrollments could not be loaded.' : null}
          onRetry={query.refetch}
          rowKey={(row) => row.id}
          noResults={filtered}
          emptyTitle="No enrollments yet"
          emptyMessage="Create an enrollment to place a student in an academic year."
        />
        <div className="px-5 pb-4">
          <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPage={setPage} onLimit={(value) => { setLimit(value); setPage(1); }} />
        </div>
      </Card>

      <EnrollmentFormModal
        open={creating}
        options={options.data}
        onClose={() => setCreating(false)}
        onSaved={invalidate}
      />
      <StatusModal
        enrollment={editingStatus}
        onClose={() => setEditingStatus(null)}
        onSaved={invalidate}
      />
    </div>
  );
}

function EnrollmentFormModal({ open, options, onClose, onSaved }) {
  const [student, setStudent] = useState(null);
  const [form, setForm] = useState({
    academicYear: '',
    batch: '',
    level: 1,
    enrollmentDate: dateInput(new Date()),
    status: 'active',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setStudent(null);
    setForm({ academicYear: '', batch: '', level: 1, enrollmentDate: dateInput(new Date()), status: 'active' });
    setError('');
  }, [open]);

  useEffect(() => {
    if (!student) return;
    const current = options?.academicYears?.find((year) => year.isCurrent) || options?.academicYears?.[0];
    setForm((value) => ({
      ...value,
      academicYear: value.academicYear || current?.id || '',
      level: student.level || 1,
      batch: student.batch?.id || '',
    }));
  }, [student, options?.academicYears]);

  const batches = (options?.batches || []).filter((batch) => !student?.program?.id || batch.program === student.program.id);

  const save = useMutation({
    mutationFn: async () => {
      if (!student) throw new Error('Choose a student.');
      if (!form.academicYear) throw new Error('Choose an academic year.');
      if (!form.enrollmentDate) throw new Error('Choose an enrollment date.');
      return (
        await api.post(`${REGISTRAR}/enrollments`, cleanPayload({
          student: student.id,
          academicYear: form.academicYear,
          batch: form.batch || null,
          level: Number(form.level) || 1,
          enrollmentDate: form.enrollmentDate,
          status: form.status,
        }))
      ).data;
    },
    onSuccess: () => {
      toast.success('Enrollment created.');
      onSaved?.();
      onClose?.();
    },
    onError: (err) => {
      const message = errorMessage(err, 'The enrollment could not be created.');
      setError(message);
      toast.error(message);
    },
  });

  return (
    <Modal
      open={open}
      title="New enrollment"
      subtitle="The programme and department come from the student record. The server checks for a duplicate active year."
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>Create enrollment</Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        <StudentPicker value={student} onChange={setStudent} hint="Search at least two characters, then choose the student." />
        <FormGrid>
          <SelectField label="Academic year" value={form.academicYear} onChange={(event) => setForm((value) => ({ ...value, academicYear: event.target.value }))} required>
            <option value="">Choose a year</option>
            {(options?.academicYears || []).map((year) => (
              <option key={year.id} value={year.id}>{year.label}{year.isCurrent ? ' · current' : ''}</option>
            ))}
          </SelectField>
          <SelectField label="Batch" value={form.batch} onChange={(event) => setForm((value) => ({ ...value, batch: event.target.value }))}>
            <option value="">Use the student's batch / none</option>
            {batches.map((batch) => (
              <option key={batch.id} value={batch.id}>{batch.code} · {batch.name}</option>
            ))}
          </SelectField>
          <Field label="Level / year" type="number" min="1" max="20" value={form.level} onChange={(event) => setForm((value) => ({ ...value, level: event.target.value }))} required />
          <Field label="Enrollment date" type="date" value={form.enrollmentDate} onChange={(event) => setForm((value) => ({ ...value, enrollmentDate: event.target.value }))} required />
          <SelectField label="Status" value={form.status} onChange={(event) => setForm((value) => ({ ...value, status: event.target.value }))}>
            {['pending', 'active', 'completed', 'withdrawn', 'cancelled'].map((value) => (
              <option key={value} value={value}>{humanStatus(value)}</option>
            ))}
          </SelectField>
        </FormGrid>
        <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-800">
          An active enrollment replaces the student's current level, batch and admission year. Use the status action for future changes so the history is kept.
        </p>
      </div>
    </Modal>
  );
}

function StatusModal({ enrollment, onClose, onSaved }) {
  const [status, setStatus] = useState('active');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (enrollment) {
      setStatus(enrollment.status);
      setReason('');
      setError('');
    }
  }, [enrollment]);

  const save = useMutation({
    mutationFn: async () => {
      if (status === enrollment.status) throw new Error('Choose a different status.');
      if (!reason.trim()) throw new Error('Write the reason for this status change.');
      return (await api.patch(`${REGISTRAR}/enrollments/${enrollment.id}/status`, { status, reason: reason.trim() })).data;
    },
    onSuccess: () => {
      toast.success('Enrollment status updated.');
      onSaved?.();
      onClose?.();
    },
    onError: (err) => {
      const message = errorMessage(err, 'The status could not be changed.');
      setError(message);
      toast.error(message);
    },
  });

  return (
    <Modal
      open={Boolean(enrollment)}
      title="Change enrollment status"
      subtitle={enrollment ? `${enrollment.student?.fullName} · ${enrollment.academicYear?.label || 'Academic year'}` : ''}
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>Save status</Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        <SelectField label="New status" value={status} onChange={(event) => setStatus(event.target.value)}>
          {['pending', 'active', 'completed', 'withdrawn', 'cancelled'].map((value) => (
            <option key={value} value={value}>{humanStatus(value)}</option>
          ))}
        </SelectField>
        <Field label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} required hint="Stored with the enrollment status history." />
      </div>
    </Modal>
  );
}
