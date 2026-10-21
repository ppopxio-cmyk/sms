import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, SlidersHorizontal, UserPlus } from 'lucide-react';
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
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [status, setStatus] = useState('all');
  const [program, setProgram] = useState('');
  const [department, setDepartment] = useState('');
  const [sort, setSort] = useState('fullName');
  const [order, setOrder] = useState('asc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);

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
      ...(program ? { program } : {}),
      ...(department ? { department } : {}),
      sort,
      order,
    }),
    [page, limit, debounced, status, program, department, sort, order],
  );

  const students = useQuery({
    queryKey: ['registrar', 'students', params],
    queryFn: async () => (await api.get(`${REGISTRAR}/students`, { params })).data,
    placeholderData: (previous) => previous,
  });

  const rows = students.data?.rows ?? [];
  const pagination = students.data?.pagination ?? { page: 1, pages: 1, total: 0, limit };
  const counts = students.data?.counts ?? {};
  const filtered = Boolean(debounced.trim() || status !== 'all' || program || department);

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
          <Button onClick={() => setCreating(true)} className="gap-2">
            <UserPlus className="h-4 w-4" /> Admit student
          </Button>
        }
      />

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <SearchInput
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder="Search by name, student ID, email or phone"
            loading={students.isFetching}
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              onChange={(event) => { setDepartment(event.target.value); setProgram(''); setPage(1); }}
            >
              <option value="">All departments</option>
              {(options.data?.departments || []).map((row) => (
                <option key={row.id} value={row.id}>{row.code} · {row.name}</option>
              ))}
            </SelectField>
            <SelectField
              label="Programme"
              value={program}
              onChange={(event) => { setProgram(event.target.value); setPage(1); }}
            >
              <option value="">All programmes</option>
              {(options.data?.programs || [])
                .filter((row) => !department || row.department === department)
                .map((row) => (
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
          <Link to="/registrar/enrollments" className="focus-ring inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold text-brand-700 hover:underline">
            <Plus className="h-3.5 w-3.5" /> Manage enrollments
          </Link>
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
        onSaved={() => students.refetch()}
      />
    </div>
  );
}
