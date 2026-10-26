import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, Legend } from 'recharts';
import { SlidersHorizontal, UserPlus, Users, Building2, BookOpen, GraduationCap, TrendingUp } from 'lucide-react';
import { api } from '../../lib/api';
import {
  REGISTRAR,
  displayDate,
  humanStatus,
  levelLabel,
  qualificationLabel,
  toneForStatus,
} from '../../lib/registrar';
import { useDebounced } from '../../lib/useDebounced';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import StudentFormModal from '../../components/registrar/StudentFormModal';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Pagination from '../../components/ui/Pagination';
import SearchInput from '../../components/ui/SearchInput';
import ExportMenu from '../../components/ui/ExportMenu';
import { SelectField } from '../../components/registrar/Fields';

const initials = (value) =>
  (value || '')
    .split(/[\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'S';

export default function RegistrarStudents() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [status, setStatus] = useState('all');
  const [program, setProgram] = useState('');
  const [department, setDepartment] = useState('');
  const [batch, setBatch] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('fullName');
  const [order, setOrder] = useState('asc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [chartTab, setChartTab] = useState('programs');

  const options = useQuery({
    queryKey: ['registrar', 'students', 'options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/students/options`)).data,
    staleTime: 30_000,
  });

  const summary = useQuery({
    queryKey: ['registrar', 'students', 'summary'],
    queryFn: async () => (await api.get(`${REGISTRAR}/students/summary`)).data,
    staleTime: 30_000,
  });

  const chartData = useMemo(() => {
    if (!summary.data) return [];
    const source =
      chartTab === 'programs'
        ? summary.data.byProgram || []
        : chartTab === 'departments'
          ? summary.data.byDepartment || []
          : summary.data.byBatch || [];
    return source.slice(0, 8).map((row) => ({
      name: row.code || row.name || 'Unknown',
      students: row.count || 0,
      trend: row.count || 0,
    }));
  }, [summary.data, chartTab]);

  const params = useMemo(
    () => ({
      page,
      limit,
      ...(debounced.trim() ? { search: debounced.trim() } : {}),
      ...(status !== 'all' ? { status } : {}),
      ...(program ? { program } : {}),
      ...(department ? { department } : {}),
      ...(batch ? { batch } : {}),
      ...(category !== 'all' ? { category } : {}),
      sort,
      order,
    }),
    [page, limit, debounced, status, program, department, batch, category, sort, order],
  );

  const students = useQuery({
    queryKey: ['registrar', 'students', params],
    queryFn: async () => (await api.get(`${REGISTRAR}/students`, { params })).data,
    placeholderData: (previous) => previous,
  });

  const rows = students.data?.rows ?? [];
  const pagination = students.data?.pagination ?? { page: 1, pages: 1, total: 0, limit };
  const counts = students.data?.counts ?? {};
  const filtered = Boolean(debounced.trim() || status !== 'all' || program || department || batch || category !== 'all');
  const availableBatches = useMemo(() => {
    const raw = (options.data?.batches || []).filter((row) =>
      (!program || row.program === program)
      && (category === 'all' || (row.category || 'regular') === category),
    );
    const seen = new Set();
    return raw.filter((row) => {
      const key = `${row.code}::${row.category || 'regular'}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [options.data?.batches, program, category]);
  const exportParams = {
    type: 'students',
    ...(status !== 'all' ? { status } : {}),
    ...(program ? { program } : {}),
    ...(department ? { department } : {}),
    ...(batch ? { batch } : {}),
    ...(category !== 'all' ? { category } : {}),
  };

  const columns = [
    {
      key: 'student',
      label: 'Student',
      render: (row) => (
        <div className="flex items-center gap-3">
          {row.photo?.thumbnailUrl ? (
            <img src={row.photo.thumbnailUrl} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-slate-100" />
          ) : (
            <span className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white">
              {initials(row.fullName)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{row.fullName}</p>
            <p className="truncate text-xs text-slate-500">{row.studentId}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'program',
      label: 'Programme',
      render: (row) => (
        <div>
          <p className="text-sm text-slate-700">{row.program?.code || '—'}</p>
          <p className="text-xs text-slate-400">{qualificationLabel(row.program?.qualificationType)}</p>
        </div>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      render: (row) => (
        <Badge tone={row.studentCategory === 'extension' ? 'warning' : 'neutral'}>
          {humanStatus(row.studentCategory || 'regular')}
        </Badge>
      ),
    },
    {
      key: 'level',
      label: 'Level',
      render: (row) => (
        <div>
          <p className="text-sm text-slate-700">{levelLabel(row.level, row.program?.qualificationType)}</p>
          <p className="text-xs text-slate-400">{row.batch?.code || 'No batch'}</p>
        </div>
      ),
    },
    {
      key: 'admission',
      label: 'Admission',
      render: (row) => (
        <div>
          <p className="text-sm text-slate-700">{row.admissionAcademicYear?.label || '—'}</p>
          <p className="text-xs text-slate-400">{displayDate(row.admissionDate)}</p>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={toneForStatus(row.studentStatus)}>{humanStatus(row.studentStatus)}</Badge>
          {row.enrollmentStatus ? <Badge tone={toneForStatus(row.enrollmentStatus)}>{humanStatus(row.enrollmentStatus)}</Badge> : null}
        </div>
      ),
    },
    {
      key: 'actions',
      label: '',
      className: 'text-right',
      mobileFull: true,
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={(event) => { event.stopPropagation(); setEditing(row); }}>
            Edit
          </Button>
          <Button size="sm" onClick={(event) => { event.stopPropagation(); navigate(`/registrar/students/${row.id}`); }}>
            Open
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Students"
        subtitle="The official student register, with programme placement, status and photos. The server enforces every permission."
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportMenu
              basePath={`${REGISTRAR}/reports/export`}
              params={exportParams}
              filenamePrefix="student-register"
              label="Export register"
              disabled={students.isLoading}
            />
            <Button onClick={() => setCreating(true)} className="gap-2">
              <UserPlus className="h-4 w-4" /> Admit student
            </Button>
          </div>
        }
      />

      {/* Hybrid Summary chart — only shown when no filters are active */}
      {!filtered && summary.data ? (
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-brand-600" />
              <h2 className="text-sm font-semibold text-slate-900">Enrollment overview</h2>
              <Badge tone="brand">{summary.data.total} total students</Badge>
            </div>
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs font-medium">
              {['programs', 'departments', 'batches'].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setChartTab(tab)}
                  className={`rounded-lg px-2.5 py-1 capitalize transition ${
                    chartTab === tab ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  By {tab}
                </button>
              ))}
            </div>
          </div>
          <div className="p-5">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <ChartTooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Bar dataKey="students" fill="#4f46e5" radius={[6, 6, 0, 0]} name="Student Count" barSize={36} />
                  <Line type="monotone" dataKey="trend" stroke="#06b6d4" strokeWidth={2.5} dot={{ r: 4, fill: '#06b6d4' }} name="Enrollment Trend" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <SearchInput
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder="Search by name, student ID, email or phone"
            loading={students.isFetching}
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <SelectField
              label="Status"
              value={status}
              onChange={(event) => { setStatus(event.target.value); setPage(1); }}
            >
              <option value="all">All students ({counts.all ?? pagination.total})</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="graduated">Graduated</option>
              <option value="withdrawn">Withdrawn</option>
              <option value="suspended">Suspended</option>
              <option value="archived">Archived</option>
            </SelectField>
            <SelectField
              label="Department"
              value={department}
              onChange={(event) => { setDepartment(event.target.value); setProgram(''); setBatch(''); setPage(1); }}
            >
              <option value="">All departments</option>
              {(options.data?.departments || []).map((row) => (
                <option key={row.id} value={row.id}>{row.code} · {row.name}</option>
              ))}
            </SelectField>
            <SelectField
              label="Category"
              value={category}
              onChange={(event) => { setCategory(event.target.value); setBatch(''); setPage(1); }}
            >
              <option value="all">All categories</option>
              <option value="regular">Regular</option>
              <option value="extension">Extension</option>
            </SelectField>
            <SelectField
              label="Programme"
              value={program}
              onChange={(event) => { setProgram(event.target.value); setBatch(''); setPage(1); }}
            >
              <option value="">All programmes</option>
              {(options.data?.programs || [])
                .filter((row) => !department || row.department === department)
                .map((row) => (
                  <option key={row.id} value={row.id}>{row.code} · {row.name}</option>
                ))}
            </SelectField>
            <SelectField
              label="Batch"
              value={batch}
              onChange={(event) => { setBatch(event.target.value); setPage(1); }}
            >
              <option value="">All batches</option>
              {availableBatches.map((row) => (
                <option key={row.id} value={row.id}>{row.code} · {row.name}</option>
              ))}
            </SelectField>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Sort</span>
              <div className="flex gap-2">
                <select
                  value={sort}
                  onChange={(event) => { setSort(event.target.value); setPage(1); }}
                  className="focus-ring h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white/85 px-3 text-sm text-slate-800"
                  aria-label="Sort students"
                >
                  <option value="fullName">Name</option>
                  <option value="studentId">Student ID</option>
                  <option value="level">Level</option>
                  <option value="admissionDate">Admission date</option>
                  <option value="createdAt">Newest record</option>
                </select>
                <button
                  type="button"
                  onClick={() => setOrder((value) => (value === 'asc' ? 'desc' : 'asc'))}
                  className="focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white/85 text-slate-500"
                  aria-label={order === 'asc' ? 'Sort descending' : 'Sort ascending'}
                  title={order === 'asc' ? 'Ascending' : 'Descending'}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Student register</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {students.isFetching ? 'Updating…' : `${pagination.total ?? 0} record${pagination.total === 1 ? '' : 's'}`}
            </p>
          </div>
          <p className="text-xs text-slate-400">Admissions are recorded here; there is no separate enrollment step.</p>
        </div>
        <RegistrarTable
          columns={columns}
          rows={rows}
          loading={students.isLoading}
          error={students.error ? students.error?.response?.data?.message || 'The student register could not be loaded.' : null}
          onRetry={students.refetch}
          rowKey={(row) => row.id}
          onRowClick={(row) => navigate(`/registrar/students/${row.id}`)}
          noResults={filtered}
          emptyTitle="No students yet"
          emptyMessage="Admit the first student to start building the official register."
          noResultsTitle="No students match those filters"
          noResultsMessage="Clear the search or choose a different programme, department or status."
        />
        <div className="px-5 pb-4">
          <Pagination
            page={pagination.page}
            pages={pagination.pages}
            total={pagination.total}
            limit={pagination.limit}
            onPage={setPage}
            onLimit={(value) => { setLimit(value); setPage(1); }}
          />
        </div>
      </Card>

      <StudentFormModal
        open={creating || Boolean(editing)}
        student={editing}
        options={options.data}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => {
          students.refetch();
          summary.refetch();
          queryClient.invalidateQueries({ queryKey: ['registrar', 'students'] });
        }}
      />
    </div>
  );
}