import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardCheck, UsersRound } from 'lucide-react';
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
import { FormGrid, SelectField } from '../../components/registrar/Fields';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import SearchInput from '../../components/ui/SearchInput';

export default function RegistrarCourseRegistration() {
  const queryClient = useQueryClient();
  const [academicYear, setAcademicYear] = useState('');
  const [term, setTerm] = useState('');
  const [program, setProgram] = useState('');
  const [level, setLevel] = useState('');
  const [offeringStatus, setOfferingStatus] = useState('open');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [registering, setRegistering] = useState(null);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [recordStatus, setRecordStatus] = useState('all');
  const [recordPage, setRecordPage] = useState(1);
  const [recordLimit, setRecordLimit] = useState(20);
  const [dropping, setDropping] = useState(null);

  const options = useQuery({
    queryKey: ['registrar', 'offering-options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/offerings/options`)).data,
    staleTime: 5 * 60_000,
  });

  const calendar = useQuery({
    queryKey: ['registrar', 'calendar'],
    queryFn: async () => (await api.get(`${REGISTRAR}/academic-calendar`)).data,
    staleTime: 5 * 60_000,
  });

  const offeringParams = useMemo(() => ({
    page,
    limit,
    ...(academicYear ? { academicYear } : {}),
    ...(term ? { term } : {}),
    ...(program ? { program } : {}),
    ...(level ? { level } : {}),
    status: offeringStatus,
  }), [page, limit, academicYear, term, program, level, offeringStatus]);

  const offerings = useQuery({
    queryKey: ['registrar', 'offerings', offeringParams],
    queryFn: async () => (await api.get(`${REGISTRAR}/offerings`, { params: offeringParams })).data,
    placeholderData: (previous) => previous,
  });

  const recordParams = useMemo(() => ({
    page: recordPage,
    limit: recordLimit,
    ...(debounced.trim() ? { search: debounced.trim() } : {}),
    ...(academicYear ? { academicYear } : {}),
    ...(term ? { term } : {}),
    ...(recordStatus !== 'all' ? { status: recordStatus } : {}),
  }), [recordPage, recordLimit, debounced, academicYear, term, recordStatus]);

  const records = useQuery({
    queryKey: ['registrar', 'registrations', recordParams],
    queryFn: async () => (await api.get(`${REGISTRAR}/course-registration`, { params: recordParams })).data,
    placeholderData: (previous) => previous,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['registrar', 'registrations'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'offerings'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'registration-candidates'] });
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

  const offeringRows = offerings.data?.rows ?? [];
  const offeringPagination = offerings.data?.pagination ?? { page: 1, pages: 1, total: 0, limit };
  const recordRows = records.data?.rows ?? [];
  const recordPagination = records.data?.pagination ?? { page: 1, pages: 1, total: 0, limit };
  const counts = records.data?.counts ?? {};

  const terms = useMemo(() => {
    const list = calendar.data?.terms || [];
    return Array.from(new Set(list
      .filter((row) => !academicYear || row.academicYear?.id === academicYear)
      .map((row) => row.name)));
  }, [calendar.data, academicYear]);

  const offeringColumns = [
    {
      key: 'course',
      label: 'Course',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-900">{row.course?.code || '—'}</p>
          <p className="text-xs text-slate-500">{row.course?.title || '—'}</p>
        </div>
      ),
    },
    {
      key: 'program',
      label: 'Programme / level',
      render: (row) => (
        <div>
          <p className="text-sm text-slate-700">{row.program?.code || '—'}</p>
          <p className="text-xs text-slate-400">{levelLabel(row.level, row.program?.qualificationType)}</p>
        </div>
      ),
    },
    {
      key: 'term',
      label: 'Year / term',
      render: (row) => `${row.academicYear?.label || '—'} · ${row.term || '—'}`,
    },
    { key: 'teacher', label: 'Teacher', render: (row) => row.teacher?.name || '—' },
    {
      key: 'seats',
      label: 'Seats',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-800">{row.registeredCount ?? 0} / {row.capacity ?? '—'}</p>
          <p className="text-xs text-slate-400">{Math.max(0, (row.capacity || 0) - (row.registeredCount || 0))} left</p>
        </div>
      ),
    },
    { key: 'status', label: 'Status', render: (row) => <Badge tone={toneForStatus(row.status)}>{humanStatus(row.status)}</Badge> },
    {
      key: 'actions',
      label: '',
      className: 'text-right',
      mobileFull: true,
      render: (row) => (
        <Button size="sm" variant="secondary" onClick={() => setRegistering(row)} className="gap-1.5">
          <UsersRound className="h-3.5 w-3.5" /> Students
        </Button>
      ),
    },
  ];

  const recordColumns = [
    {
      key: 'student',
      label: 'Student',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-900">{row.student?.fullName || '—'}</p>
          <p className="text-xs text-slate-500">
            {row.student?.studentId || '—'} · {levelLabel(row.student?.level)} · {humanStatus(row.student?.studentCategory || 'regular')}
          </p>
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
    { key: 'year', label: 'Academic year / term', render: (row) => `${row.academicYear?.label || '—'} · ${row.term || '—'}` },
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

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Course registration"
        subtitle="Choose a course offering, then register its eligible students in one action. The server checks the published plan, prerequisites, opening window, programme, level and seat capacity."
      />

      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SelectField label="Academic year" value={academicYear} onChange={(event) => { setAcademicYear(event.target.value); setTerm(''); setPage(1); setRecordPage(1); }}>
            <option value="">All years</option>
            {(options.data?.academicYears || []).map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
          </SelectField>
          <SelectField label="Term" value={term} onChange={(event) => { setTerm(event.target.value); setPage(1); setRecordPage(1); }}>
            <option value="">All terms</option>
            {terms.map((name) => <option key={name} value={name}>{name}</option>)}
          </SelectField>
          <SelectField label="Programme" value={program} onChange={(event) => { setProgram(event.target.value); setPage(1); }}>
            <option value="">All programmes</option>
            {(options.data?.programs || []).map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}
          </SelectField>
          <SelectField label="Level / year" value={level} onChange={(event) => { setLevel(event.target.value); setPage(1); }}>
            <option value="">All levels</option>
            {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>Level {value}</option>)}
          </SelectField>
          <SelectField label="Offering status" value={offeringStatus} onChange={(event) => { setOfferingStatus(event.target.value); setPage(1); }}>
            <option value="open">Open for registration</option>
            <option value="all">All statuses</option>
            {['draft', 'in_progress', 'completed', 'cancelled'].map((value) => <option key={value} value={value}>{humanStatus(value)}</option>)}
          </SelectField>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Course offerings</h2>
            <p className="mt-0.5 text-xs text-slate-500">{offeringPagination.total ?? 0} offering{offeringPagination.total === 1 ? '' : 's'}</p>
          </div>
          <ClipboardCheck className="h-4 w-4 text-slate-300" />
        </div>
        <RegistrarTable
          columns={offeringColumns}
          rows={offeringRows}
          loading={offerings.isLoading}
          error={offerings.error ? offerings.error?.response?.data?.message || 'Course offerings could not be loaded.' : null}
          onRetry={offerings.refetch}
          rowKey={(row) => row.id}
          noResults={Boolean(academicYear || term || program || level || offeringStatus !== 'open')}
          emptyTitle="No course offerings"
          emptyMessage="Create offerings from a published curriculum plan first."
          noResultsTitle="No offering matches"
          noResultsMessage="Change the year, term, programme, level or status filters."
        />
        <div className="px-5 pb-4">
          <Pagination page={offeringPagination.page} pages={offeringPagination.pages} total={offeringPagination.total} limit={offeringPagination.limit} onPage={setPage} onLimit={(value) => { setLimit(value); setPage(1); }} />
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        {['registered', 'dropped', 'completed'].map((value) => (
          <div key={value} className="glass rounded-2xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{humanStatus(value)}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{counts[value] ?? (value === 'registered' ? recordPagination.total : 0)}</p>
          </div>
        ))}
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Registration records</h2>
              <p className="mt-0.5 text-xs text-slate-500">{recordPagination.total ?? 0} record{recordPagination.total === 1 ? '' : 's'}</p>
            </div>
            <SelectField label="Record status" value={recordStatus} onChange={(event) => { setRecordStatus(event.target.value); setRecordPage(1); }} className="w-full sm:w-52">
              <option value="all">All statuses</option>
              {['registered', 'dropped', 'withdrawn', 'completed', 'cancelled'].map((value) => <option key={value} value={value}>{humanStatus(value)}</option>)}
            </SelectField>
          </div>
          <SearchInput value={search} onChange={(event) => { setSearch(event.target.value); setRecordPage(1); }} placeholder="Search student name or ID" loading={records.isFetching} />
        </div>
        <RegistrarTable
          columns={recordColumns}
          rows={recordRows}
          loading={records.isLoading}
          error={records.error ? records.error?.response?.data?.message || 'Registrations could not be loaded.' : null}
          onRetry={records.refetch}
          rowKey={(row) => row.id}
          noResults={Boolean(debounced.trim() || academicYear || term || recordStatus !== 'all')}
          emptyTitle="No registrations yet"
          emptyMessage="Register students from an open course offering above."
        />
        <div className="px-5 pb-4">
          <Pagination page={recordPagination.page} pages={recordPagination.pages} total={recordPagination.total} limit={recordPagination.limit} onPage={setRecordPage} onLimit={(value) => { setRecordLimit(value); setRecordPage(1); }} />
        </div>
      </Card>

      <RegisterOfferingModal
        offering={registering}
        options={options.data}
        onClose={() => setRegistering(null)}
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

function RegisterOfferingModal({ offering, options, onClose, onSaved }) {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [category, setCategory] = useState('');
  const [batch, setBatch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!offering) return;
    setSearch('');
    setCategory('');
    setBatch('');
    setPage(1);
    setSelected([]);
    setError('');
  }, [offering]);

  const params = useMemo(() => ({
    page,
    limit: 50,
    ...(debounced.trim() ? { search: debounced.trim() } : {}),
    ...(category ? { category } : {}),
    ...(batch ? { batch } : {}),
  }), [page, debounced, category, batch]);

  const candidates = useQuery({
    queryKey: ['registrar', 'registration-candidates', offering?.id, params],
    queryFn: async () => (await api.get(`${REGISTRAR}/course-registration/offerings/${offering.id}`, { params })).data,
    enabled: Boolean(offering?.id),
  });

  const batches = (options?.batches || []).filter((row) =>
    offering?.program?.id && row.program === offering.program.id
    && (!category || (row.category || 'regular') === category),
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!selected.length) throw new Error('Choose at least one eligible student.');
      return (await api.post(`${REGISTRAR}/course-registration/offerings/${offering.id}`, { studentIds: selected })).data;
    },
    onSuccess: (data) => {
      toast.success(`${data.registered ?? selected.length} student${data.registered === 1 ? '' : 's'} registered for ${offering?.course?.code || 'the course'}.`);
      onSaved?.();
      onClose?.();
    },
    onError: (err) => {
      const message = errorMessage(err, 'The students could not be registered.');
      setError(message);
      toast.error(message);
    },
  });

  const rows = candidates.data?.rows || [];
  const data = candidates.data;
  const seats = data?.offering?.seats ?? 0;
  const seatsLeft = Math.max(0, seats - selected.length);
  const eligibleRows = rows.filter((row) => row.eligible && !selected.includes(row.id));

  return (
    <Modal
      open={Boolean(offering)}
      title={`Register students${offering?.course ? ` · ${offering.course.code}` : ''}`}
      subtitle={offering ? `${offering.program?.code || 'Programme'} · ${levelLabel(offering.level, offering.program?.qualificationType)} · ${offering.academicYear?.label || ''} ${offering.term || ''}` : ''}
      size="lg"
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!selected.length}>
            Register {selected.length || ''}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        <SearchInput value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); setSelected([]); }} placeholder="Find a student in this programme and level" loading={candidates.isFetching} />
        <FormGrid>
          <SelectField label="Delivery stream" value={category} onChange={(event) => { setCategory(event.target.value); setBatch(''); setPage(1); setSelected([]); }}>
            <option value="">Both streams</option>
            <option value="regular">Regular</option>
            <option value="extension">Extension</option>
          </SelectField>
          <SelectField label="Batch" value={batch} onChange={(event) => { setBatch(event.target.value); setPage(1); setSelected([]); }}>
            <option value="">All batches</option>
            {batches.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}
          </SelectField>
        </FormGrid>

        {candidates.isLoading ? (
          <p className="rounded-xl bg-slate-50 px-3.5 py-4 text-sm text-slate-500">Checking the plan, prerequisites and registration window…</p>
        ) : candidates.error ? (
          <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">{candidates.error?.response?.data?.message || 'Eligibility could not be checked.'}</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 px-3.5 py-3 text-xs text-slate-600">
              <Badge tone={data?.windowOpen ? 'success' : 'danger'}>{data?.windowOpen ? 'Registration window open' : 'Registration window closed'}</Badge>
              <span>{data?.plan?.title || 'Published plan'} · v{data?.plan?.version}</span>
              <span>{seats} seat{seats === 1 ? '' : 's'} left</span>
              <span>{data?.pagination?.total ?? 0} student{(data?.pagination?.total ?? 0) === 1 ? '' : 's'}</span>
            </div>
            <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-2xl border border-slate-100 p-2">
              {rows.map((row) => {
                const checked = selected.includes(row.id);
                return (
                  <label key={row.id} className={`flex items-start gap-3 rounded-xl px-3 py-2.5 text-sm ${row.eligible ? checked ? 'bg-brand-50' : 'hover:bg-slate-50' : 'opacity-70'}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!row.eligible || (!checked && seatsLeft === 0)}
                      onChange={() => setSelected((current) => checked ? current.filter((id) => id !== row.id) : [...current, row.id])}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-800">{row.fullName}</span>
                      <span className="block text-xs text-slate-500">
                        {row.studentId} · {humanStatus(row.studentCategory || 'regular')} · {row.batch?.code || 'No batch'}
                      </span>
                      {row.alreadyRegistered ? <span className="text-xs font-medium text-sky-700">Already registered</span> : null}
                      {row.missingPrerequisites?.length ? <span className="text-xs font-medium text-rose-700">Missing prerequisite result</span> : null}
                      {!row.eligible && !row.alreadyRegistered && !row.missingPrerequisites?.length ? <span className="text-xs font-medium text-slate-500">Not available for registration</span> : null}
                    </span>
                  </label>
                );
              })}
              {!rows.length ? <p className="px-3 py-5 text-sm text-slate-500">No active student in this programme and level matches.</p> : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">{selected.length} selected of {seats} available seat{seats === 1 ? '' : 's'}</p>
              {eligibleRows.length ? (
                <button
                  type="button"
                  onClick={() => setSelected((current) => [
                    ...new Set([
                      ...current,
                      ...eligibleRows.slice(0, Math.max(0, seats - current.length)).map((row) => row.id),
                    ]),
                  ])}
                  className="focus-ring rounded-lg text-xs font-semibold text-brand-700 hover:underline"
                >
                  Select eligible on this page
                </button>
              ) : null}
            </div>
            <Pagination page={data?.pagination?.page || 1} pages={data?.pagination?.pages || 1} total={data?.pagination?.total || 0} limit={data?.pagination?.limit || 50} onPage={(value) => { setPage(value); setSelected([]); }} />
          </div>
        )}
      </div>
    </Modal>
  );
}
