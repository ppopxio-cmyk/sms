import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Award,
  BookOpen,
  Calendar,
  Eye,
  FileText,
  GraduationCap,
  ScrollText,
  Search,
  UserCheck,
  ArrowLeft,
  Building2,
  ChevronRight,
  Users,
  Sparkles,
  Layers,
  Clock,
} from 'lucide-react';
import { api } from '../../lib/api';
import { REGISTRAR, displayDateTime } from '../../lib/registrar';
import { formatEthiopian } from '../../lib/ethiopianDate';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import { SelectField } from '../../components/registrar/Fields';
import Card, { CardBody } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import SearchInput from '../../components/ui/SearchInput';
import Pagination from '../../components/ui/Pagination';

export default function RegistrarGraduated() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Selected cohort slug state
  const [openedCohort, setOpenedCohort] = useState(null);

  // Top Filter & Search state
  const [draftSearch, setDraftSearch] = useState('');
  const [draftBatch, setDraftBatch] = useState('');
  const [draftDepartment, setDraftDepartment] = useState('');
  const [draftProgram, setDraftProgram] = useState('');
  const [hasClickedShow, setHasClickedShow] = useState(false);

  const [search, setSearch] = useState('');
  const [batch, setBatch] = useState('');
  const [department, setDepartment] = useState('');
  const [program, setProgram] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // Cohort Slug Search state
  const [cohortSearch, setCohortSearch] = useState('');
  const [cohortPage, setCohortPage] = useState(1);
  const [cohortLimit, setCohortLimit] = useState(20);

  // Query graduated summary (departments, programs, batches with graduated students, & department groups)
  const graduatedSummaryQuery = useQuery({
    queryKey: ['registrar', 'graduated-summary'],
    queryFn: async () => (await api.get(`${REGISTRAR}/students/graduated-summary`)).data,
    staleTime: 60_000,
  });

  const departments = graduatedSummaryQuery.data?.departments || [];
  const allPrograms = graduatedSummaryQuery.data?.programs || [];
  const rawBatches = graduatedSummaryQuery.data?.batches || [];
  const departmentGroups = graduatedSummaryQuery.data?.departmentGroups || [];
  const totalGraduated = graduatedSummaryQuery.data?.totalGraduated || 0;

  // Deduplicate batches by code and category for dropdown
  const uniqueBatches = useMemo(() => {
    const map = new Map();
    for (const b of rawBatches) {
      if (b.status === 'archived') continue;
      const cat = b.category || 'regular';
      const key = `${b.code}::${cat}`;
      if (!map.has(key)) {
        map.set(key, {
          id: b.id || b._id,
          code: b.code,
          category: cat,
        });
      }
    }
    return Array.from(map.values());
  }, [rawBatches]);

  // Filter programmes by selected department
  const programsInDept = useMemo(() => {
    if (!draftDepartment) return allPrograms;
    return allPrograms.filter(
      (p) => String(p.department?.id || p.department) === String(draftDepartment),
    );
  }, [allPrograms, draftDepartment]);

  // Synchronize URL slug parameter if present on mount/changes
  useEffect(() => {
    const slug = searchParams.get('slug');
    const batchId = searchParams.get('batch');
    const progId = searchParams.get('program');

    if (slug && batchId && progId && departmentGroups.length) {
      for (const group of departmentGroups) {
        const found = group.cohorts?.find(
          (c) => c.slug === slug || (c.batchId === batchId && c.programId === progId),
        );
        if (found) {
          setOpenedCohort(found);
          break;
        }
      }
    } else if (!slug && !batchId && !progId) {
      setOpenedCohort(null);
    }
  }, [searchParams, departmentGroups]);

  // Query parameters for global/filtered search
  const queryParams = useMemo(
    () => ({
      page,
      limit,
      status: 'graduated',
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(batch ? { batch } : {}),
      ...(department ? { department } : {}),
      ...(program ? { program } : {}),
      sort: 'completionDate',
      order: 'desc',
    }),
    [page, limit, search, batch, department, program],
  );

  const studentsQuery = useQuery({
    queryKey: ['registrar', 'graduated-students', queryParams],
    queryFn: async () => (await api.get(`${REGISTRAR}/students`, { params: queryParams })).data,
    enabled: hasClickedShow && !openedCohort,
  });

  // Query parameters for cohort slug view
  const cohortQueryParams = useMemo(() => {
    if (!openedCohort) return null;
    return {
      page: cohortPage,
      limit: cohortLimit,
      status: 'graduated',
      batch: openedCohort.batchId,
      program: openedCohort.programId,
      ...(cohortSearch.trim() ? { search: cohortSearch.trim() } : {}),
      sort: 'completionDate',
      order: 'desc',
    };
  }, [openedCohort, cohortPage, cohortLimit, cohortSearch]);

  const cohortStudentsQuery = useQuery({
    queryKey: ['registrar', 'graduated-cohort-students', cohortQueryParams],
    queryFn: async () => (await api.get(`${REGISTRAR}/students`, { params: cohortQueryParams })).data,
    enabled: Boolean(openedCohort),
  });

  const handleShowGraduated = () => {
    setOpenedCohort(null);
    setSearchParams({});
    setSearch(draftSearch);
    setBatch(draftBatch);
    setDepartment(draftDepartment);
    setProgram(draftProgram);
    setHasClickedShow(true);
    setPage(1);
  };

  const handleResetFilters = () => {
    setDraftSearch('');
    setDraftBatch('');
    setDraftDepartment('');
    setDraftProgram('');
    setSearch('');
    setBatch('');
    setDepartment('');
    setProgram('');
    setHasClickedShow(false);
    setOpenedCohort(null);
    setSearchParams({});
    setPage(1);
  };

  const handleOpenCohort = (cohort) => {
    setOpenedCohort(cohort);
    setHasClickedShow(false);
    setCohortSearch('');
    setCohortPage(1);
    setSearchParams({
      slug: cohort.slug,
      batch: cohort.batchId,
      program: cohort.programId,
    });
  };

  const handleBackToOverview = () => {
    setOpenedCohort(null);
    setSearchParams({});
    setCohortSearch('');
    setCohortPage(1);
  };

  const rows = studentsQuery.data?.rows || [];
  const pagination = studentsQuery.data?.pagination || { page: 1, pages: 1, total: 0, limit };

  const cohortRows = cohortStudentsQuery.data?.rows || [];
  const cohortPagination = cohortStudentsQuery.data?.pagination || {
    page: 1,
    pages: 1,
    total: 0,
    limit: cohortLimit,
  };

  const columns = [
    {
      key: 'student',
      label: 'Trainee',
      render: (row) => (
        <div className="flex items-center gap-3">
          {row.photo?.thumbnailUrl || row.photo?.url ? (
            <img
              src={row.photo.thumbnailUrl || row.photo.url}
              alt=""
              className="h-9 w-9 rounded-full object-cover ring-1 ring-slate-200 shrink-0"
            />
          ) : (
            <span className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-xs">
              {(row.fullName || '?').slice(0, 2).toUpperCase()}
            </span>
          )}
          <div>
            <p className="text-sm font-semibold text-slate-900">{row.fullName}</p>
            <p className="text-xs font-mono text-brand-700">{row.studentId}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'programme',
      label: 'Programme & Department',
      render: (row) => (
        <div>
          <p className="text-sm font-medium text-slate-800">{row.program?.name || '—'}</p>
          <p className="text-xs text-slate-400">{row.department?.name || row.program?.code || '—'}</p>
        </div>
      ),
    },
    {
      key: 'batch',
      label: 'Batch',
      render: (row) => (
        <div>
          <span className="font-semibold text-xs text-slate-700">{row.batch?.code || '—'}</span>
          <span className="text-[11px] text-slate-400 capitalize block">
            ({row.studentCategory || row.batch?.category || 'regular'})
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: () => <Badge tone="success">Graduated</Badge>,
    },
    {
      key: 'completed',
      label: 'Completion Date (Eth)',
      render: (row) => (
        <span className="text-xs font-medium text-slate-700">
          {row.completionDate ? formatEthiopian(row.completionDate) : 'Completed'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Official Documents',
      className: 'text-right',
      mobileFull: true,
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Link to={`/registrar/transcripts`}>
            <Button size="sm" variant="secondary" className="gap-1 text-xs text-brand-700 hover:text-brand-800">
              <FileText className="h-3.5 w-3.5" /> Transcript
            </Button>
          </Link>
          <Link to={`/registrar/certificates`}>
            <Button size="sm" variant="secondary" className="gap-1 text-xs text-indigo-700 hover:text-indigo-800">
              <Award className="h-3.5 w-3.5" /> Certificate
            </Button>
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Graduated Students"
        subtitle="Browse verified graduated cohorts by department, view dedicated slug workbenches, and access transcripts & certificates."
      />

      {/* VIEW 1: COHORT SLUG WORKBENCH (When a specific cohort is opened) */}
      {openedCohort ? (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleBackToOverview}
                className="gap-1.5 text-xs text-slate-700 hover:text-slate-900"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to All Batches
              </Button>
              <div className="h-5 w-px bg-slate-200 hidden sm:block" />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">
                    {openedCohort.departmentName} · {openedCohort.programName}
                  </h2>
                  <Badge tone={openedCohort.batchCategory === 'extension' ? 'warning' : 'neutral'}>
                    Batch {openedCohort.batchCode} ({openedCohort.batchCategory})
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cohort Slug: <code className="font-mono text-brand-700">{openedCohort.slug}</code> ·{' '}
                  <strong className="text-emerald-700">{openedCohort.count}</strong> Graduated Trainees
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/registrar/transcripts">
                <Button size="sm" variant="secondary" className="gap-1.5 text-xs">
                  <FileText className="h-3.5 w-3.5 text-brand-600" /> Transcripts Hub
                </Button>
              </Link>
              <Link to="/registrar/certificates">
                <Button size="sm" variant="secondary" className="gap-1.5 text-xs">
                  <Award className="h-3.5 w-3.5 text-indigo-600" /> Certificates Hub
                </Button>
              </Link>
            </div>
          </div>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="relative w-full sm:w-80">
                <SearchInput
                  value={cohortSearch}
                  onChange={(e) => {
                    setCohortSearch(e.target.value);
                    setCohortPage(1);
                  }}
                  placeholder="Filter student ID or name in cohort..."
                />
              </div>
              <Badge tone="success">
                {cohortPagination.total} Graduated Trainee{cohortPagination.total === 1 ? '' : 's'}
              </Badge>
            </div>

            <RegistrarTable
              columns={columns}
              rows={cohortRows}
              loading={cohortStudentsQuery.isLoading}
              error={cohortStudentsQuery.error?.message}
              rowKey={(row) => row.id || row._id}
              emptyTitle="No graduated trainees found"
              emptyMessage={
                cohortSearch
                  ? `No graduated trainee in this cohort matched "${cohortSearch}".`
                  : 'No graduated trainees found in this cohort.'
              }
            />

            <div className="px-5 pb-4">
              <Pagination
                page={cohortPagination.page}
                pages={cohortPagination.pages}
                total={cohortPagination.total}
                limit={cohortPagination.limit}
                onPage={setCohortPage}
                onLimit={(val) => {
                  setCohortLimit(val);
                  setCohortPage(1);
                }}
              />
            </div>
          </Card>
        </div>
      ) : (
        /* VIEW 2: OVERVIEW & FILTER WORKBENCH */
        <div className="space-y-6">
          {/* Top Filter and Search Bar */}
          <Card>
            <CardBody className="p-4 sm:p-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
                <SelectField
                  label="Batch (Graduated Only)"
                  value={draftBatch}
                  onChange={(e) => setDraftBatch(e.target.value)}
                >
                  <option value="">All graduated batches...</option>
                  {uniqueBatches.map((b) => (
                    <option key={b.id || b.code} value={b.id}>
                      {b.code} ({b.category})
                    </option>
                  ))}
                </SelectField>

                <SelectField
                  label="Department (Graduated Only)"
                  value={draftDepartment}
                  onChange={(e) => {
                    setDraftDepartment(e.target.value);
                    setDraftProgram('');
                  }}
                >
                  <option value="">All graduated departments...</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} · {d.name}
                    </option>
                  ))}
                </SelectField>

                <SelectField
                  label="Programme (Graduated Only)"
                  value={draftProgram}
                  onChange={(e) => setDraftProgram(e.target.value)}
                >
                  <option value="">All graduated programmes...</option>
                  {programsInDept.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.name}
                    </option>
                  ))}
                </SelectField>

                <div>
                  <SearchInput
                    value={draftSearch}
                    onChange={(e) => setDraftSearch(e.target.value)}
                    placeholder="Search Student ID or Name..."
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                <Button
                  onClick={handleShowGraduated}
                  className="gap-2 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-sm h-10 px-5"
                >
                  <GraduationCap className="h-4 w-4" /> Show Graduated Students
                </Button>
                {hasClickedShow ? (
                  <Button
                    variant="secondary"
                    onClick={handleResetFilters}
                    className="text-xs h-10 px-4"
                  >
                    Reset & View Batches
                  </Button>
                ) : null}
              </div>
            </CardBody>
          </Card>

          {/* SECTION A: FILTERED SEARCH RESULTS TABLE (Visible only when Show button is clicked) */}
          {hasClickedShow ? (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div className="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleResetFilters}
                    className="gap-1.5 text-xs text-slate-700"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to Batches Overview
                  </Button>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Graduated Trainees Search Results</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {pagination.total} graduated trainee{pagination.total === 1 ? '' : 's'} matching criteria
                    </p>
                  </div>
                </div>
                <Badge tone="success">{pagination.total} Graduated</Badge>
              </div>

              <RegistrarTable
                columns={columns}
                rows={rows}
                loading={studentsQuery.isLoading}
                error={studentsQuery.error?.message}
                rowKey={(row) => row.id || row._id}
                emptyTitle="No graduated students found"
                emptyMessage="No graduated students matched your search criteria."
              />

              <div className="px-5 pb-4">
                <Pagination
                  page={pagination.page}
                  pages={pagination.pages}
                  total={pagination.total}
                  limit={pagination.limit}
                  onPage={setPage}
                  onLimit={(val) => {
                    setLimit(val);
                    setPage(1);
                  }}
                />
              </div>
            </Card>
          ) : (
            /* SECTION B: DEFAULT VIEW — RECENTLY GRADUATED BATCHES GROUPED BY DEPARTMENT */
            <div className="space-y-6">
              {/* Institution Graduation Summary Bar */}
              <div className="grid gap-4 sm:grid-cols-3">
                <Card className="p-4 sm:p-5 flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shrink-0">
                    <GraduationCap className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Graduated Trainees</p>
                    <p className="text-2xl font-black text-slate-900 mt-0.5">{totalGraduated}</p>
                  </div>
                </Card>

                <Card className="p-4 sm:p-5 flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shrink-0">
                    <Building2 className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Graduated Departments</p>
                    <p className="text-2xl font-black text-slate-900 mt-0.5">{departments.length}</p>
                  </div>
                </Card>

                <Card className="p-4 sm:p-5 flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shrink-0">
                    <Layers className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Graduated Cohorts</p>
                    <p className="text-2xl font-black text-slate-900 mt-0.5">
                      {departmentGroups.reduce((acc, d) => acc + (d.cohorts?.length || 0), 0)}
                    </p>
                  </div>
                </Card>
              </div>

              {/* Department Groups and Cohort Cards */}
              {graduatedSummaryQuery.isLoading ? (
                <Card className="p-8 text-center text-sm text-slate-500">
                  <div className="flex items-center justify-center gap-2">
                    <Clock className="h-4 w-4 animate-spin text-brand-600" />
                    <span>Loading recently graduated batches...</span>
                  </div>
                </Card>
              ) : departmentGroups.length === 0 ? (
                <Card className="py-14 text-center border-dashed">
                  <div className="max-w-md mx-auto space-y-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mx-auto">
                      <GraduationCap className="h-6 w-6" />
                    </div>
                    <h3 className="text-base font-bold text-slate-900">No Graduated Students Recorded</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      There are currently no students marked with graduated status. Students will appear here once their final stage and degree completion records are finalized.
                    </p>
                  </div>
                </Card>
              ) : (
                <div className="space-y-8">
                  {departmentGroups.map((group) => (
                    <div key={group.departmentId} className="space-y-3">
                      {/* Department Heading */}
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700 font-bold text-xs">
                            {group.departmentCode}
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900">{group.departmentName}</h3>
                            <p className="text-[11px] text-slate-400">
                              {group.cohorts?.length || 0} graduated cohort{group.cohorts?.length === 1 ? '' : 's'} ·{' '}
                              {group.cohorts?.reduce((acc, c) => acc + c.count, 0) || 0} total graduates
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Cohort Cards Grid */}
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {group.cohorts?.map((cohort) => (
                          <div
                            key={cohort.id}
                            className="group relative flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-brand-300 hover:shadow-md transition-all duration-200"
                          >
                            <div className="space-y-3">
                              <div className="flex items-start justify-between gap-2">
                                <span className="inline-flex items-center rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-100">
                                  {cohort.count} Graduated
                                </span>
                                <Badge tone={cohort.batchCategory === 'extension' ? 'warning' : 'neutral'}>
                                  Batch {cohort.batchCode}
                                </Badge>
                              </div>

                              <div>
                                <h4 className="text-sm font-bold text-slate-900 group-hover:text-brand-700 transition-colors">
                                  {cohort.programName}
                                </h4>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  Code: <span className="font-mono text-slate-600">{cohort.programCode}</span> ·{' '}
                                  <span className="capitalize">{cohort.qualificationType || 'degree'}</span>
                                </p>
                              </div>

                              <div className="rounded-xl bg-slate-50 p-2.5 text-xs text-slate-600 space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Delivery Stream:</span>
                                  <span className="font-semibold capitalize text-slate-700">{cohort.batchCategory}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Latest Completion:</span>
                                  <span className="font-medium text-slate-700">
                                    {cohort.latestCompletionDate ? formatEthiopian(cohort.latestCompletionDate) : 'Completed'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between">
                              <span className="text-[11px] font-mono text-slate-400">{cohort.slug}</span>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleOpenCohort(cohort)}
                                className="gap-1.5 text-xs text-brand-700 group-hover:bg-brand-50 group-hover:border-brand-200 transition-colors"
                              >
                                View Cohort <ChevronRight className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
