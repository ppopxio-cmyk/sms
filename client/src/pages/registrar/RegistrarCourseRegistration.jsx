import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  GraduationCap,
  Layers,
  UsersRound,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import {
  REGISTRAR,
  humanStatus,
  levelLabel,
  qualificationLabel,
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
import Pagination from '../../components/ui/Pagination';
import SearchInput from '../../components/ui/SearchInput';

export default function RegistrarCourseRegistration() {
  const queryClient = useQueryClient();
  const [selectedBatchKey, setSelectedBatchKey] = useState('');
  const [expandedDepts, setExpandedDepts] = useState({});

  // Offerings filters
  const [academicYear, setAcademicYear] = useState('');
  const [term, setTerm] = useState('');
  const [program, setProgram] = useState('');
  const [level, setLevel] = useState('');
  const [offeringStatus, setOfferingStatus] = useState('open');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [registering, setRegistering] = useState(null);

  // Records filters
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

  const rawBatches = options.data?.batches || [];
  const uniqueBatches = useMemo(() => {
    const map = new Map();
    for (const b of rawBatches) {
      if (b.status === 'archived') continue;
      const cat = b.category || 'regular';
      const key = `${b.code}::${cat}`;
      const progId = String(b.program?.id || b.program || '');
      if (!map.has(key)) {
        map.set(key, {
          key,
          code: b.code,
          category: cat,
          name: b.name,
          programIds: progId ? [progId] : [],
        });
      } else {
        const item = map.get(key);
        if (progId && !item.programIds.includes(progId)) {
          item.programIds.push(progId);
        }
      }
    }
    return Array.from(map.values());
  }, [rawBatches]);

  // Default to first batch if none selected
  useEffect(() => {
    if (!selectedBatchKey && uniqueBatches.length > 0) {
      setSelectedBatchKey(uniqueBatches[0].key);
    }
  }, [selectedBatchKey, uniqueBatches]);

  const activeBatchGroup = useMemo(() => {
    return uniqueBatches.find((b) => b.key === selectedBatchKey) || uniqueBatches[0] || null;
  }, [uniqueBatches, selectedBatchKey]);

  // Group programmes by department for the selected batch
  const departmentsWithPrograms = useMemo(() => {
    const depts = options.data?.departments || [];
    const progs = options.data?.programs || [];
    if (!activeBatchGroup) return [];

    const allowedProgIds = new Set(activeBatchGroup.programIds || []);
    // If batch has explicit programIds, filter by them; otherwise show all programs
    const batchPrograms = allowedProgIds.size > 0
      ? progs.filter((p) => allowedProgIds.has(String(p.id)))
      : progs;

    return depts
      .map((dept) => {
        const deptProgs = batchPrograms.filter(
          (p) => String(p.department?.id || p.department) === String(dept.id),
        );
        return {
          ...dept,
          programs: deptProgs,
        };
      })
      .filter((dept) => dept.programs.length > 0);
  }, [options.data?.departments, options.data?.programs, activeBatchGroup]);

  // Initialize all departments as expanded by default
  useEffect(() => {
    if (departmentsWithPrograms.length > 0) {
      setExpandedDepts((prev) => {
        const next = { ...prev };
        for (const dept of departmentsWithPrograms) {
          if (next[dept.id] === undefined) {
            next[dept.id] = true;
          }
        }
        return next;
      });
    }
  }, [departmentsWithPrograms]);

  const toggleDept = (deptId) => {
    setExpandedDepts((prev) => ({
      ...prev,
      [deptId]: !prev[deptId],
    }));
  };

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
      label: 'Student code',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold font-mono text-slate-900">{row.student?.studentId || '—'}</p>
          <p className="text-xs text-slate-500">{row.student?.fullName || '—'}</p>
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
        subtitle="Select a batch, browse departments and view programmes to register and manage stage courses."
      />

      {/* Batch Tabs (No 'All Batches', only unique batches) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Active Batches:
          </span>
          {activeBatchGroup && (
            <span className="text-xs text-slate-500">
              Selected stream: <strong className="text-slate-800 capitalize">{activeBatchGroup.category}</strong>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {uniqueBatches.map((b) => {
            const isActive = selectedBatchKey === b.key;
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => setSelectedBatchKey(b.key)}
                className={`focus-ring shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-sm ring-2 ring-brand-400'
                    : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {b.code} <span className="text-[11px] font-normal opacity-90 capitalize">({b.category})</span>
              </button>
            );
          })}
          {!uniqueBatches.length && (
            <p className="text-xs text-slate-400">No active batches available.</p>
          )}
        </div>
      </div>

      {/* Departments & Programmes List */}
      <div className="space-y-4">
        {departmentsWithPrograms.map((dept) => {
          const isExpanded = expandedDepts[dept.id] !== false;
          return (
            <Card key={dept.id} className="overflow-hidden border border-slate-200">
              <button
                type="button"
                onClick={() => toggleDept(dept.id)}
                className="w-full flex items-center justify-between px-5 py-4 bg-slate-50 hover:bg-slate-100 transition text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold text-brand-700 bg-brand-100 px-2 py-0.5 rounded">
                    {dept.code}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{dept.name}</h3>
                    <p className="text-xs text-slate-500">
                      {dept.programs.length} programme{dept.programs.length === 1 ? '' : 's'} available in {activeBatchGroup?.code}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{dept.programs.length} Programmes</Badge>
                  <span className="text-slate-400 p-1">
                    {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="p-5 border-t border-slate-100 bg-white">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {dept.programs.map((prog) => {
                      const qType = prog.qualificationType || 'degree';
                      const durationText = qType === 'degree'
                        ? `${prog.durationYears || 4} Years`
                        : qType === 'diploma'
                        ? `${prog.levels?.length || 4} Levels`
                        : `${prog.shortTerm?.duration || 3} ${prog.shortTerm?.unit || 'Months'}`;

                      return (
                        <div
                          key={prog.id}
                          className="flex flex-col justify-between rounded-xl border border-slate-200 p-4 hover:border-brand-300 hover:shadow-sm transition bg-white"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                                {prog.code}
                              </span>
                              <Badge tone="brand">
                                {qualificationLabel(qType)}
                              </Badge>
                            </div>
                            <h4 className="mt-2 text-sm font-semibold text-slate-900">
                              {prog.name}
                            </h4>
                            <p className="mt-1 text-xs text-slate-500">
                              Duration: <strong className="text-slate-700">{durationText}</strong>
                            </p>
                          </div>
                          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end">
                            <Link
                              to={`/registrar/course-registration/programme/${prog.id}`}
                              className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition"
                            >
                              <BookOpen className="h-3.5 w-3.5" /> View programme
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          );
        })}

        {!departmentsWithPrograms.length && (
          <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center bg-white">
            <GraduationCap className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-2 text-sm font-semibold text-slate-800">No departments found for this batch</p>
            <p className="text-xs text-slate-500">Select another batch to view programmes.</p>
          </div>
        )}
      </div>

      {/* Course offerings table */}
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

      {/* Registration records table */}
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

  const batches = useMemo(() => {
    const raw = (options?.batches || []).filter((row) =>
      offering?.program?.id && (row.program === offering.program.id || row.program?.id === offering.program.id)
      && (!category || (row.category || 'regular') === category),
    );
    const seen = new Set();
    return raw.filter((row) => {
      const key = `${row.code}::${row.category || 'regular'}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [options?.batches, offering?.program?.id, category]);

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
                      <span className="block font-mono font-semibold text-slate-900">{row.studentId}</span>
                      <span className="block text-xs text-slate-500">{row.fullName}</span>
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