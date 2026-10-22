import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardCheck, Plus, ShieldAlert } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import {
  REGISTRAR,
  humanStatus,
  levelLabel,
  toneForStatus,
} from '../../lib/registrar';
import { useDebounced } from '../../lib/useDebounced';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import ConfirmDialog from '../../components/registrar/ConfirmDialog';
import StudentPicker from '../../components/registrar/StudentPicker';
import { FormGrid, SelectField } from '../../components/registrar/Fields';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import SearchInput from '../../components/ui/SearchInput';

export default function RegistrarCourseRegistration() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [academicYear, setAcademicYear] = useState('');
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [registering, setRegistering] = useState(false);
  const [dropping, setDropping] = useState(null);

  const options = useQuery({
    queryKey: ['registrar', 'students', 'options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/students/options`)).data,
    staleTime: 5 * 60_000,
  });
  const calendar = useQuery({
    queryKey: ['registrar', 'calendar'],
    queryFn: async () => (await api.get(`${REGISTRAR}/academic-calendar`)).data,
    staleTime: 5 * 60_000,
  });

  const params = useMemo(() => ({
    page,
    limit,
    ...(debounced.trim() ? { search: debounced.trim() } : {}),
    ...(academicYear ? { academicYear } : {}),
    ...(term ? { term } : {}),
    ...(status !== 'all' ? { status } : {}),
  }), [page, limit, debounced, academicYear, term, status]);

  const query = useQuery({
    queryKey: ['registrar', 'registrations', params],
    queryFn: async () => (await api.get(`${REGISTRAR}/course-registration`, { params })).data,
    placeholderData: (previous) => previous,
  });

  const rows = query.data?.rows ?? [];
  const pagination = query.data?.pagination ?? { page: 1, pages: 1, total: 0, limit };
  const counts = query.data?.counts ?? {};
  const filtered = Boolean(debounced.trim() || academicYear || term || status !== 'all');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['registrar', 'registrations'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'offerings'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'dashboard'] });
  };

  const drop = useMutation({
    mutationFn: async (reason) => (await api.patch(`${REGISTRAR}/course-registration/${dropping.id}/drop`, { reason })).data,
    onSuccess: () => {
      toast.success('Registration dropped and the seat released.');
      setDropping(null);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, 'The registration could not be dropped.')),
  });

  const columns = [
    {
      key: 'student',
      label: 'Student',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-900">{row.student?.fullName || '—'}</p>
          <p className="text-xs text-slate-500">{row.student?.studentId || '—'} · {levelLabel(row.student?.level)}</p>
        </div>
      ),
    },
    {
      key: 'course',
      label: 'Course',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-800">{row.course?.code || '—'}</p>
          <p className="text-xs text-slate-500">{row.course?.title || '—'}</p>
        </div>
      ),
    },
    {
      key: 'year',
      label: 'Academic year / term',
      render: (row) => `${row.academicYear?.label || '—'} · ${row.term || '—'}`,
    },
    { key: 'credits', label: 'Credits', render: (row) => row.creditHours ?? '—' },
    { key: 'status', label: 'Status', render: (row) => <Badge tone={toneForStatus(row.status)}>{humanStatus(row.status)}</Badge> },
    {
      key: 'actions',
      label: '',
      className: 'text-right',
      mobileFull: true,
      render: (row) => row.status === 'registered' ? (
        <Button size="sm" variant="secondary" onClick={() => setDropping(row)}>Drop</Button>
      ) : null,
    },
  ];

  const terms = useMemo(() => {
    const list = calendar.data?.terms || [];
    const names = new Set(list.filter((row) => !academicYear || row.academicYear?.id === academicYear).map((row) => row.name));
    return Array.from(names);
  }, [calendar.data, academicYear]);

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Course registration"
        subtitle="The server checks the published curriculum, open offering, seat capacity, prerequisite results and a live registration calendar event before it reserves a seat."
        actions={<Button onClick={() => setRegistering(true)} className="gap-2"><Plus className="h-4 w-4" /> Register student</Button>}
      />

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <SearchInput value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search student name or ID" loading={query.isFetching} />
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField label="Academic year" value={academicYear} onChange={(event) => { setAcademicYear(event.target.value); setTerm(''); setPage(1); }}>
              <option value="">All years</option>
              {(options.data?.academicYears || []).map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
            </SelectField>
            <SelectField label="Term" value={term} onChange={(event) => { setTerm(event.target.value); setPage(1); }}>
              <option value="">All terms</option>
              {terms.map((name) => <option key={name} value={name}>{name}</option>)}
            </SelectField>
            <SelectField label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="all">All statuses</option>
              {['registered', 'dropped', 'withdrawn', 'completed', 'cancelled'].map((value) => <option key={value} value={value}>{humanStatus(value)}</option>)}
            </SelectField>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        {['registered', 'dropped', 'completed'].map((value) => (
          <div key={value} className="glass rounded-2xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{humanStatus(value)}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{counts[value] ?? (value === 'registered' ? pagination.total : 0)}</p>
          </div>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Registration records</h2>
            <p className="mt-0.5 text-xs text-slate-500">{pagination.total ?? 0} record{pagination.total === 1 ? '' : 's'}</p>
          </div>
          <ClipboardCheck className="h-4 w-4 text-slate-300" />
        </div>
        <RegistrarTable
          columns={columns}
          rows={rows}
          loading={query.isLoading}
          error={query.error ? query.error?.response?.data?.message || 'Registrations could not be loaded.' : null}
          onRetry={query.refetch}
          rowKey={(row) => row.id}
          noResults={filtered}
          emptyTitle="No registrations yet"
          emptyMessage="Register a student once an offering and registration window are open."
        />
        <div className="px-5 pb-4">
          <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPage={setPage} onLimit={(value) => { setLimit(value); setPage(1); }} />
        </div>
      </Card>

      <RegisterModal
        open={registering}
        options={options.data}
        terms={calendar.data?.terms || []}
        onClose={() => setRegistering(false)}
        onSaved={invalidate}
      />
      <ConfirmDialog
        open={Boolean(dropping)}
        title="Drop this registration?"
        message={dropping ? `${dropping.student?.fullName || 'The student'} · ${dropping.course?.code || 'course'}. The seat is released immediately.` : ''}
        confirmLabel="Drop registration"
        tone="danger"
        loading={drop.isPending}
        reason={{ label: 'Reason', minLength: 5, placeholder: 'Why is this registration being dropped?' }}
        onClose={() => setDropping(null)}
        onConfirm={(reason) => drop.mutate(reason)}
      />
    </div>
  );
}

function RegisterModal({ open, options, terms, onClose, onSaved }) {
  const [student, setStudent] = useState(null);
  const [academicYear, setAcademicYear] = useState('');
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setStudent(null);
    setAcademicYear(options?.academicYears?.find((row) => row.isCurrent)?.id || '');
    setTerm('');
    setSelected([]);
    setError('');
  }, [open, options?.academicYears]);

  const yearTerms = useMemo(
    () => Array.from(new Set(terms.filter((row) => row.academicYear?.id === academicYear).map((row) => row.name))),
    [terms, academicYear],
  );

  const eligibility = useQuery({
    queryKey: ['registrar', 'registration-eligible', student?.id, academicYear, term],
    queryFn: async () => (await api.get(`${REGISTRAR}/course-registration/eligible`, {
      params: { student: student.id, academicYear, term },
    })).data,
    enabled: Boolean(student?.id && academicYear && term),
    retry: false,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!student || !academicYear || !term) throw new Error('Choose the student, academic year and term.');
      if (!selected.length) throw new Error('Choose at least one eligible course.');
      return (await api.post(`${REGISTRAR}/course-registration`, { student: student.id, offeringIds: selected })).data;
    },
    onSuccess: (data) => {
      toast.success(`${data.registrations?.length || selected.length} course registration${selected.length === 1 ? '' : 's'} created.`);
      onSaved?.();
      onClose?.();
    },
    onError: (err) => {
      const message = errorMessage(err, 'The registration could not be created.');
      setError(message);
      toast.error(message);
    },
  });

  const offerings = eligibility.data?.offerings ?? [];
  const eligibleRows = offerings.filter((row) => row.eligible);

  return (
    <Modal
      open={open}
      title="Register a student"
      subtitle="Pick the year and term first; the server then resolves the published plan and each course's eligibility."
      size="lg"
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      footer={<><Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!selected.length}>Register {selected.length || ''}</Button></>}
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        <StudentPicker value={student} onChange={(value) => { setStudent(value); setSelected([]); }} />
        <FormGrid>
          <SelectField label="Academic year" value={academicYear} onChange={(event) => { setAcademicYear(event.target.value); setTerm(''); setSelected([]); }}>
            <option value="">Choose a year</option>
            {(options?.academicYears || []).map((row) => <option key={row.id} value={row.id}>{row.label}{row.isCurrent ? ' · current' : ''}</option>)}
          </SelectField>
          <SelectField label="Term" value={term} onChange={(event) => { setTerm(event.target.value); setSelected([]); }}>
            <option value="">Choose a term</option>
            {yearTerms.map((name) => <option key={name} value={name}>{name}</option>)}
          </SelectField>
        </FormGrid>

        {student && academicYear && term ? (
          eligibility.isLoading ? (
            <p className="rounded-xl bg-slate-50 px-3.5 py-4 text-sm text-slate-500">Checking the curriculum, prerequisites and registration window…</p>
          ) : eligibility.error ? (
            <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
              <div className="flex items-start gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><p>{eligibility.error?.response?.data?.message || 'Eligibility could not be checked.'}</p></div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 px-3.5 py-3 text-xs text-slate-600">
                <Badge tone={eligibility.data?.windowOpen ? 'success' : 'danger'}>
                  {eligibility.data?.windowOpen ? 'Registration window open' : 'Registration window closed'}
                </Badge>
                <span>{eligibility.data?.plan?.title || 'Published plan'} · v{eligibility.data?.plan?.version}</span>
                <span>{eligibleRows.length} eligible of {offerings.length}</span>
              </div>
              <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-2xl border border-slate-100 p-2">
                {offerings.map((row) => {
                  const checked = selected.includes(row.id);
                  const disabled = !row.eligible;
                  return (
                    <label key={row.id} className={`flex items-start gap-3 rounded-xl px-3 py-2.5 text-sm ${disabled ? 'opacity-70' : checked ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => setSelected((current) => checked ? current.filter((id) => id !== row.id) : [...current, row.id])}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-800">{row.course?.code} · {row.course?.title}</span>
                        <span className="block text-xs text-slate-500">
                          {row.credits} credits · {row.teacher?.name || 'No teacher'} · {row.seats} seat{row.seats === 1 ? '' : 's'} left
                        </span>
                        {row.alreadyRegistered ? <span className="text-xs font-medium text-sky-700">Already registered</span> : null}
                        {row.status !== 'open' ? <span className="text-xs font-medium text-slate-500">Offering is {humanStatus(row.status)}</span> : null}
                        {row.missingPrerequisites?.length ? <span className="text-xs font-medium text-rose-700">Missing prerequisite result</span> : null}
                        {!row.seats && !row.alreadyRegistered ? <span className="text-xs font-medium text-rose-700">No seats left</span> : null}
                      </span>
                    </label>
                  );
                })}
                {!offerings.length ? <p className="px-3 py-5 text-sm text-slate-500">No offering exists for this programme, year, term and level.</p> : null}
              </div>
              {eligibleRows.length ? (
                <button type="button" onClick={() => setSelected(eligibleRows.map((row) => row.id))} className="focus-ring rounded-lg text-xs font-semibold text-brand-700 hover:underline">
                  Select all eligible courses
                </button>
              ) : null}
            </div>
          )
        ) : (
          <p className="rounded-xl bg-sky-50 px-3.5 py-3 text-xs leading-relaxed text-sky-800">
            Choose a student, academic year and term. The eligibility list only includes offerings the server can verify.
          </p>
        )}
      </div>
    </Modal>
  );
}
