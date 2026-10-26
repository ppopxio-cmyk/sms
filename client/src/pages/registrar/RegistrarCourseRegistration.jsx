import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, ClipboardCheck, Download, FileText, Plus, Trash2, Upload, UsersRound } from 'lucide-react';
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
import Field from '../../components/ui/Field';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import SearchInput from '../../components/ui/SearchInput';

function shortenFileName(fileName, maxBase = 12) {
  if (!fileName) return '';
  const str = String(fileName).trim();
  const dotIndex = str.lastIndexOf('.');
  const ext = dotIndex !== -1 ? str.slice(dotIndex) : '';
  const base = dotIndex !== -1 ? str.slice(0, dotIndex) : str;
  if (base.length <= maxBase) return str;
  return `${base.slice(0, maxBase)}...${ext}`;
}

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
  const [materialDepartment, setMaterialDepartment] = useState('');
  const [materialProgram, setMaterialProgram] = useState('');
  const [materialLevel, setMaterialLevel] = useState('');
  const [materialSearch, setMaterialSearch] = useState('');
  const [materialModal, setMaterialModal] = useState(false);
  const [removingMaterial, setRemovingMaterial] = useState(null);

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

  const materials = useQuery({
    queryKey: ['registrar', 'course-materials'],
    queryFn: async () => (await api.get(`${REGISTRAR}/course-registration/resources`)).data,
    staleTime: 60_000,
  });

  const removeMaterial = useMutation({
    mutationFn: async () => (await api.delete(`${REGISTRAR}/course-registration/resources/${removingMaterial.id}`)).data,
    onSuccess: () => {
      toast.success('Course material removed.');
      setRemovingMaterial(null);
      queryClient.invalidateQueries({ queryKey: ['registrar', 'course-materials'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'The course material could not be removed.')),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['registrar', 'registrations'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'offerings'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'registration-candidates'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'plan-offerings'] });
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
  const allMaterials = materials.data?.resources ?? [];
  const materialCounts = useMemo(() => {
    const map = new Map();
    for (const row of allMaterials) {
      if (row.program?.id) map.set(row.program.id, (map.get(row.program.id) || 0) + 1);
    }
    return map;
  }, [allMaterials]);
  const programsInDept = useMemo(() => {
    const list = options.data?.programs || [];
    if (!materialDepartment) return list;
    return list.filter((p) => String(p.department?.id || p.department) === String(materialDepartment));
  }, [options.data?.programs, materialDepartment]);

  const visibleMaterials = useMemo(() => {
    const term = materialSearch.trim().toLowerCase();
    return allMaterials.filter((row) => (
      (!materialDepartment || String(row.department?.id || row.department) === String(materialDepartment))
      && (!materialProgram || row.program?.id === materialProgram)
      && (!materialLevel || String(row.level || 1) === String(materialLevel))
      && (!term || [row.courseName, row.courseCode, row.fileName].some((value) => String(value || '').toLowerCase().includes(term)))
    ));
  }, [allMaterials, materialDepartment, materialProgram, materialLevel, materialSearch]);

  const materialColumns = [
    {
      key: 'course',
      label: 'Course',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-900">{row.courseCode}</p>
          <p className="text-xs text-slate-500">{row.courseName}</p>
        </div>
      ),
    },
    {
      key: 'credits',
      label: 'Credits',
      render: (row) => <span className="text-xs font-semibold text-slate-700">{row.creditHours ?? 3} Cr.</span>,
    },
    {
      key: 'program',
      label: 'Programme',
      render: (row) => row.program ? (
        <div>
          <Link
            to={`/registrar/course-registration/programme/${row.program.id}`}
            className="text-sm font-medium text-brand-700 hover:underline"
            title="View programme courses"
          >
            {row.program.code} · {row.program.name}
          </Link>
          {row.department ? <p className="text-xs text-slate-400">{row.department.name || row.department.code}</p> : null}
        </div>
      ) : '—',
    },
    {
      key: 'file',
      label: 'Material',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-50 text-slate-500"><FileText className="h-4 w-4" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-700" title={row.fileName}>
              {shortenFileName(row.fileName)}
            </p>
            <p className="text-xs text-slate-400">{formatBytes(row.bytes)}</p>
          </div>
        </div>
      ),
    },
    { key: 'uploaded', label: 'Uploaded', render: (row) => new Date(row.createdAt).toLocaleDateString() },
    {
      key: 'actions',
      label: '',
      className: 'text-right',
      mobileFull: true,
      render: (row) => (
        <div className="flex justify-end items-center gap-1.5">
          <a href={row.url} target="_blank" rel="noreferrer" className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-brand-700 hover:bg-brand-50">
            <Download className="h-3.5 w-3.5" /> Open
          </a>
          {row.program?.id && (
            <Link
              to={`/registrar/course-registration/programme/${row.program.id}`}
              className="focus-ring inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              title="View all courses in this programme"
            >
              <BookOpen className="h-3.5 w-3.5" />
            </Link>
          )}
          <Button size="sm" variant="ghost" onClick={() => setRemovingMaterial(row)} aria-label={`Remove ${row.fileName}`}>
            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
          </Button>
        </div>
      ),
    },
  ];

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
        subtitle="Manage programme course materials and register students against active offerings."
      />

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Course materials</h2>
            <p className="mt-0.5 text-xs text-slate-500">Add course materials with automated codes and filenames, and filter across departments and programmes.</p>
          </div>
          <Button onClick={() => setMaterialModal(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Add material</Button>
        </div>
        <div className="border-b border-slate-100 px-5 py-3 space-y-3">
          {/* Department tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0 mr-1">Dept:</span>
            <button
              type="button"
              onClick={() => { setMaterialDepartment(''); setMaterialProgram(''); }}
              className={`focus-ring shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${!materialDepartment ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              All departments
            </button>
            {(options.data?.departments || []).map((dept) => (
              <button
                key={dept.id}
                type="button"
                onClick={() => { setMaterialDepartment(dept.id); setMaterialProgram(''); }}
                className={`focus-ring shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${materialDepartment === dept.id ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {dept.code} · {dept.name}
              </button>
            ))}
          </div>

          {/* Programme tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0 mr-1">Prog:</span>
            <button
              type="button"
              onClick={() => setMaterialProgram('')}
              className={`focus-ring shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${!materialProgram ? 'border border-brand-300 bg-brand-50 text-brand-800 font-semibold' : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
            >
              All programmes ({allMaterials.length})
            </button>
            {programsInDept.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setMaterialProgram(row.id)}
                className={`focus-ring shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${materialProgram === row.id ? 'border border-brand-300 bg-brand-50 text-brand-800 font-semibold' : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
              >
                {row.code} ({materialCounts.get(row.id) || 0})
              </button>
            ))}
          </div>

          {/* Year / Level tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0 mr-1">Year / Level:</span>
            <button
              type="button"
              onClick={() => setMaterialLevel('')}
              className={`focus-ring shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${!materialLevel ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              All Years & Levels
            </button>
            {[1, 2, 3, 4, 5].map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setMaterialLevel(String(lvl))}
                className={`focus-ring shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${String(materialLevel) === String(lvl) ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                Year {lvl} / Level {lvl}
              </button>
            ))}
          </div>

          {materialProgram && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-500">
                Viewing courses for <span className="font-semibold text-slate-700">{programsInDept.find((p) => p.id === materialProgram)?.name || 'selected programme'}</span>
              </span>
              <Link
                to={`/registrar/course-registration/programme/${materialProgram}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition"
              >
                <BookOpen className="h-3.5 w-3.5" /> View all programme courses & materials
              </Link>
            </div>
          )}
        </div>
        <div className="px-5 py-3">
          <SearchInput value={materialSearch} onChange={(event) => setMaterialSearch(event.target.value)} placeholder="Search course name, code or file" loading={materials.isFetching} />
        </div>
        <RegistrarTable
          columns={materialColumns}
          rows={visibleMaterials}
          loading={materials.isLoading}
          error={materials.error ? materials.error?.response?.data?.message || 'Course materials could not be loaded.' : null}
          onRetry={materials.refetch}
          rowKey={(row) => row.id}
          noResults={Boolean(materialProgram || materialSearch.trim())}
          emptyTitle="No course materials yet"
          emptyMessage="Use Add material to upload the first PDF or Word document."
          noResultsTitle="No material matches"
          noResultsMessage="Choose another programme or clear the search."
        />
      </Card>

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
      <CourseMaterialModal
        open={materialModal}
        options={options.data}
        existingMaterials={allMaterials}
        initialProgram={materialProgram}
        onClose={() => setMaterialModal(false)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['registrar', 'course-materials'] })}
      />
      <ConfirmDialog
        open={Boolean(removingMaterial)}
        title="Remove this course material?"
        message={removingMaterial ? `${removingMaterial.courseCode} · ${removingMaterial.fileName}. The file is removed from storage.` : ''}
        confirmLabel="Remove material"
        tone="danger"
        loading={removeMaterial.isPending}
        onClose={() => setRemovingMaterial(null)}
        onConfirm={() => removeMaterial.mutate()}
      />
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CourseMaterialModal({ open, options, existingMaterials = [], initialProgram, onClose, onSaved }) {
  const [department, setDepartment] = useState('');
  const [selectedBatches, setSelectedBatches] = useState([]);
  const [form, setForm] = useState({ program: '', courseName: '', courseCode: '', creditHours: 3 });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  const departments = options?.departments || [];
  const allPrograms = options?.programs || [];
  const allBatches = (options?.batches || []).filter((b) => b.status === 'active' || !b.status);

  const filteredPrograms = useMemo(() => {
    if (!department) return allPrograms;
    return allPrograms.filter((p) => String(p.department?.id || p.department) === String(department));
  }, [allPrograms, department]);

  const autoGenerateCode = (progId) => {
    const prog = allPrograms.find((p) => p.id === progId);
    if (!prog) return '';
    const progMaterials = (existingMaterials || []).filter(
      (m) => (m.program?.id || m.program) === progId,
    );
    const count = progMaterials.length;
    const nextNum = String(count + 1).padStart(3, '0');
    return `${prog.code}-${nextNum}`;
  };

  useEffect(() => {
    if (!open) return;
    setError('');
    setFile(null);
    setSelectedBatches([]);
    const initialProg = allPrograms.find((p) => p.id === initialProgram);
    const initialDept = initialProg?.department || '';
    setDepartment(initialDept);
    const autoCode = initialProg ? autoGenerateCode(initialProg.id) : '';
    setForm({
      program: initialProgram || '',
      courseName: '',
      courseCode: autoCode,
      creditHours: 3,
    });
  }, [open, initialProgram, allPrograms, existingMaterials]);

  const selectedProgObj = useMemo(() => {
    return allPrograms.find((p) => p.id === form.program);
  }, [allPrograms, form.program]);

  const durationInfo = useMemo(() => {
    if (!selectedProgObj) return null;
    const qType = selectedProgObj.qualificationType || 'degree';
    if (qType === 'degree') {
      const years = selectedProgObj.durationYears || 4;
      return { type: 'Degree', unit: 'Years', total: `${years} Years`, courseStage: '1st Year Course' };
    }
    if (qType === 'diploma') {
      const levels = selectedProgObj.levels?.length || 4;
      return { type: 'Diploma', unit: 'Levels', total: `${levels} Levels`, courseStage: 'Level 1 Course' };
    }
    const duration = selectedProgObj.shortTerm?.duration || 12;
    const unit = selectedProgObj.shortTerm?.unit || 'weeks';
    return { type: 'Short-term', unit: 'Duration', total: `${duration} ${unit}`, courseStage: '1st Week Course' };
  }, [selectedProgObj]);

  const toggleBatch = (batch) => {
    const bId = batch.id;
    const isSelected = selectedBatches.includes(bId);

    if (isSelected) {
      setSelectedBatches((prev) => prev.filter((id) => id !== bId));
    } else {
      if (selectedBatches.length >= 2) {
        toast.info('You can select up to 2 active batches (e.g. Regular & Extension).');
        return;
      }
      setSelectedBatches((prev) => [...prev, bId]);

      // If batch has an associated program, pre-select it and its department
      if (batch.program) {
        const prog = allPrograms.find((p) => p.id === batch.program);
        if (prog) {
          setForm((c) => ({
            ...c,
            program: prog.id,
            courseCode: c.courseCode || autoGenerateCode(prog.id),
          }));
          if (prog.department) {
            setDepartment(prog.department?.id || prog.department);
          }
        }
      }
    }
  };

  const handleProgramChange = (progId) => {
    const prog = allPrograms.find((p) => p.id === progId);
    const code = prog ? autoGenerateCode(prog.id) : '';
    setForm((current) => ({
      ...current,
      program: progId,
      courseCode: code || current.courseCode,
    }));
  };

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
    if (selectedFile) {
      const cleanName = selectedFile.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[_-]/g, ' ')
        .trim();
      setForm((current) => ({
        ...current,
        courseName: cleanName,
      }));
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.program || !form.courseName.trim() || !form.courseCode.trim()) {
        throw new Error('Programme, course name, course code and a file are required.');
      }
      if (!file) throw new Error('Choose a PDF or Word document.');
      if (file.size > 50 * 1024 * 1024) throw new Error('The course material must be smaller than 50 MB.');
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (!['pdf', 'doc', 'docx'].includes(extension)) throw new Error('Upload a PDF, DOC or DOCX file.');
      const contentType = file.type || {
        pdf: 'application/pdf',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }[extension];
      return (await api.post(`${REGISTRAR}/course-registration/resources`, file, {
        params: {
          program: form.program,
          courseName: form.courseName.trim(),
          courseCode: form.courseCode.trim().toUpperCase(),
          creditHours: Number(form.creditHours) || 3,
          filename: file.name,
          level: 1,
          batches: selectedBatches.join(','),
        },
        headers: { 'Content-Type': contentType },
        timeout: 60_000,
      })).data;
    },
    onSuccess: () => {
      toast.success('Course material uploaded.');
      onSaved?.();
      onClose?.();
    },
    onError: (err) => {
      const message = errorMessage(err, 'The course material could not be uploaded.');
      setError(message);
      toast.error(message);
    },
  });

  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  return (
    <Modal
      open={open}
      title="Add course material"
      subtitle="Attach course material to active batches and allocate 1st year / level 1 course."
      size="lg"
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} className="gap-1.5">
            <Upload className="h-4 w-4" /> Upload material
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}

        {/* Batch Tick Mode (Only Active Batches, Max 2) */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Select Active Batches (Tick up to 2 batches)
            </span>
            <span className="text-xs font-semibold text-brand-700">
              {selectedBatches.length}/2 Selected
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            One programme can have both Regular and Extension active batches taking this course.
          </p>
          <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pt-1">
            {allBatches.map((b) => {
              const isChecked = selectedBatches.includes(b.id);
              return (
                <label
                  key={b.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-xs transition ${
                    isChecked
                      ? 'border-brand-500 bg-brand-50 text-brand-900 font-semibold shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleBatch(b)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600"
                  />
                  <span>{b.code}</span>
                  <span className="text-[10px] text-slate-400 capitalize">({b.category || 'regular'})</span>
                </label>
              );
            })}
            {!allBatches.length && <p className="text-xs text-slate-500">No active batches found.</p>}
          </div>
        </div>

        {/* Duration stage badge */}
        {durationInfo && (
          <div className="rounded-xl bg-brand-50/80 border border-brand-200 p-3 text-xs text-brand-900 flex items-center justify-between">
            <div>
              <span className="font-bold">{durationInfo.type}:</span> {durationInfo.courseStage}
              <span className="text-slate-500 ml-2">(Total Duration: {durationInfo.total})</span>
            </div>
            <Badge tone="brand">Duration: {durationInfo.unit}</Badge>
          </div>
        )}

        <FormGrid>
          <SelectField
            label="Department"
            value={department}
            onChange={(event) => {
              const deptId = event.target.value;
              setDepartment(deptId);
              setForm((current) => ({ ...current, program: '', courseCode: '' }));
            }}
            required
          >
            <option value="">Choose a department</option>
            {departments.map((row) => (
              <option key={row.id} value={row.id}>
                {row.code} · {row.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Programme"
            value={form.program}
            onChange={(event) => handleProgramChange(event.target.value)}
            disabled={!department && departments.length > 0}
            required
          >
            <option value="">Choose a programme</option>
            {filteredPrograms.map((row) => (
              <option key={row.id} value={row.id}>
                {row.code} · {row.name}
              </option>
            ))}
          </SelectField>
          <Field
            label="Course code"
            value={form.courseCode}
            onChange={(event) => set('courseCode', event.target.value)}
            placeholder="e.g. CS-001"
            hint="Auto-generated based on programme code. Can be customized."
            required
          />
          <Field
            label="Course name"
            value={form.courseName}
            onChange={(event) => set('courseName', event.target.value)}
            placeholder="e.g. Introduction to Computing"
            hint="Auto-filled from attached file name."
            required
          />
          <Field
            label="Credit hours"
            type="number"
            min="0.5"
            max="1000"
            step="0.5"
            value={form.creditHours}
            onChange={(event) => set('creditHours', event.target.value)}
            required
          />
          <Field
            label="PDF or Word document"
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileChange}
            hint="Maximum 50 MB. PDF, DOC or DOCX."
            required
          />
        </FormGrid>
      </div>
    </Modal>
  );
}

function CreateOfferingModal({ open, plans, teachers, onClose, onSaved }) {
  const [planId, setPlanId] = useState('');
  const [curriculumCourse, setCurriculumCourse] = useState('');
  const [teacher, setTeacher] = useState('');
  const [capacity, setCapacity] = useState('60');
  const [schedule, setSchedule] = useState('');
  const [status, setStatus] = useState('draft');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setPlanId('');
    setCurriculumCourse('');
    setTeacher('');
    setCapacity('60');
    setSchedule('');
    setStatus('draft');
    setError('');
  }, [open]);

  const entries = useQuery({
    queryKey: ['registrar', 'plan-offerings', planId],
    queryFn: async () => (await api.get(`${REGISTRAR}/curriculum/${planId}/offerings`)).data,
    enabled: open && Boolean(planId),
  });

  const plan = plans.find((row) => row.id === planId);
  const allEntries = entries.data?.entries || [];
  const available = allEntries.filter((row) => !row.hasOffering && row.term);
  const missingTerm = allEntries.filter((row) => !row.hasOffering && !row.term).length;
  const selected = available.find((row) => row.id === curriculumCourse);

  const save = useMutation({
    mutationFn: async () => {
      if (!planId) throw new Error('Choose a published curriculum plan.');
      if (!curriculumCourse) throw new Error('Choose the curriculum course to offer.');
      const seats = Number(capacity);
      if (!Number.isInteger(seats) || seats < 1 || seats > 500) {
        throw new Error('Capacity must be a whole number between 1 and 500.');
      }
      return (
        await api.post(`${REGISTRAR}/offerings`, {
          curriculumCourse,
          ...(teacher ? { teacher } : {}),
          capacity: seats,
          ...(schedule.trim() ? { schedule: schedule.trim() } : {}),
          status,
        })
      ).data;
    },
    onSuccess: () => {
      toast.success(
        `${selected?.course?.code || 'The course'} offering created${
          status === 'open' ? ' and open for registration.' : ' as a draft.'
        }`,
      );
      onSaved();
      onClose();
    },
    onError: (saveError) => setError(errorMessage(saveError, 'The offering could not be created.')),
  });

  return (
    <Modal
      open={open}
      title="Create a course offering"
      subtitle="Offer a course from a published curriculum plan, then assign a teacher and open registration."
      size="lg"
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!planId || !curriculumCourse}>
            Create offering
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        <SelectField
          label="Published curriculum plan"
          value={planId}
          onChange={(event) => {
            setPlanId(event.target.value);
            setCurriculumCourse('');
            setError('');
          }}
          hint={plans.length ? 'Only published plans can produce offerings.' : 'Publish a curriculum plan first.'}
          required
        >
          <option value="">Choose a plan</option>
          {plans.map((row) => (
            <option key={row.id} value={row.id}>
              {row.title} · {row.program?.code || 'Programme'} · {row.academicYear?.label || 'Year'}
            </option>
          ))}
        </SelectField>

        {plan ? (
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <span className="font-semibold text-slate-800">{plan.program?.name || 'Programme'}</span>
            <span className="mx-1.5">·</span>
            {plan.academicYear?.label || 'Academic year'}
            <span className="mx-1.5">·</span>
            {available.length} course{available.length === 1 ? '' : 's'} still to offer
          </div>
        ) : null}

        <SelectField
          label="Curriculum course"
          value={curriculumCourse}
          onChange={(event) => setCurriculumCourse(event.target.value)}
          disabled={!planId || entries.isLoading}
          hint={
            planId && !entries.isLoading && !available.length
              ? missingTerm
                ? `${missingTerm} course${missingTerm === 1 ? '' : 's'} need a term before they can be offered.`
                : 'Every course in this plan already has an offering.'
              : 'Only active curriculum courses with a term can be offered.'
          }
          required
        >
          <option value="">{entries.isLoading ? 'Loading courses...' : 'Choose a course'}</option>
          {available.map((row) => (
            <option key={row.id} value={row.id}>
              {row.course?.code || 'Course'} · {row.course?.title || ''} · {row.term} · {levelLabel(row.level, plan?.program?.qualificationType)}
            </option>
          ))}
        </SelectField>

        {entries.isError ? (
          <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
            {errorMessage(entries.error, 'The curriculum courses could not be loaded.')}
          </p>
        ) : selected ? (
          <div className="grid gap-2 rounded-2xl border border-slate-100 px-4 py-3 text-xs text-slate-600 sm:grid-cols-3">
            <span><span className="font-semibold text-slate-800">{selected.course?.code}</span> {selected.course?.title}</span>
            <span>Term: {selected.term}</span>
            <span>{selected.creditHours} credit hour{selected.creditHours === 1 ? '' : 's'}</span>
          </div>
        ) : null}

        <FormGrid>
          <SelectField label="Teacher" value={teacher} onChange={(event) => setTeacher(event.target.value)} hint="Optional. An active teacher can be assigned now or later.">
            <option value="">Assign later</option>
            {teachers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </SelectField>
          <Field label="Capacity" type="number" min="1" max="500" value={capacity} onChange={(event) => setCapacity(event.target.value)} required />
          <Field label="Schedule" value={schedule} onChange={(event) => setSchedule(event.target.value)} placeholder="e.g. Mon 8:00-10:00, Room 4" />
          <SelectField label="Status" value={status} onChange={(event) => setStatus(event.target.value)}>
            {['draft', 'open', 'in_progress', 'completed', 'cancelled'].map((value) => (
              <option key={value} value={value}>{humanStatus(value)}</option>
            ))}
          </SelectField>
        </FormGrid>
      </div>
    </Modal>
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
