import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
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
} from 'lucide-react';
import { api } from '../../lib/api';
import { REGISTRAR, displayDateTime } from '../../lib/registrar';
import { useDebounced } from '../../lib/useDebounced';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import { SelectField } from '../../components/registrar/Fields';
import Card, { CardBody } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import SearchInput from '../../components/ui/SearchInput';
import Pagination from '../../components/ui/Pagination';

export default function RegistrarGraduated() {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [batch, setBatch] = useState('');
  const [department, setDepartment] = useState('');
  const [program, setProgram] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const options = useQuery({
    queryKey: ['registrar', 'students', 'options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/students/options`)).data,
    staleTime: 5 * 60_000,
  });

  const departments = options.data?.departments || [];
  const allPrograms = options.data?.programs || [];
  const rawBatches = options.data?.batches || [];

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

  const programsInDept = useMemo(() => {
    if (!department) return allPrograms;
    return allPrograms.filter(
      (p) => String(p.department?.id || p.department) === String(department),
    );
  }, [allPrograms, department]);

  const queryParams = useMemo(() => ({
    page,
    limit,
    status: 'graduated',
    ...(debounced.trim() ? { search: debounced.trim() } : {}),
    ...(batch ? { batch } : {}),
    ...(department ? { department } : {}),
    ...(program ? { program } : {}),
    sort: 'completionDate',
    order: 'desc',
  }), [page, limit, debounced, batch, department, program]);

  const studentsQuery = useQuery({
    queryKey: ['registrar', 'graduated-students', queryParams],
    queryFn: async () => (await api.get(`${REGISTRAR}/students`, { params: queryParams })).data,
  });

  const rows = studentsQuery.data?.rows || [];
  const pagination = studentsQuery.data?.pagination || { page: 1, pages: 1, total: 0, limit };

  const columns = [
    {
      key: 'student',
      label: 'Student',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-900">{row.fullName}</p>
          <p className="text-xs font-mono text-brand-700">{row.studentId}</p>
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
          <span className="text-[11px] text-slate-400 capitalize block">({row.studentCategory || row.batch?.category || 'regular'})</span>
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
      label: 'Completion Date',
      render: (row) => (
        <span className="text-xs text-slate-600">
          {row.completionDate ? new Date(row.completionDate).toLocaleDateString() : 'Completed'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      className: 'text-right',
      mobileFull: true,
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Link to={`/registrar/transcripts`}>
            <Button size="sm" variant="secondary" className="gap-1 text-xs">
              <FileText className="h-3.5 w-3.5 text-brand-600" /> Transcript
            </Button>
          </Link>
          <Link to={`/registrar/certificates`}>
            <Button size="sm" variant="secondary" className="gap-1 text-xs">
              <Award className="h-3.5 w-3.5 text-indigo-600" /> Certificate
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
        subtitle="Browse all graduated students with verified stage completions, cumulative CGPA, and official graduation records."
      />

      {/* Filter and Search Bar */}
      <Card>
        <CardBody className="p-4 sm:p-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
            <SelectField
              label="Batch"
              value={batch}
              onChange={(e) => {
                setBatch(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Choose batch...</option>
              {uniqueBatches.map((b) => (
                <option key={b.id || b.code} value={b.id}>
                  {b.code} ({b.category})
                </option>
              ))}
            </SelectField>

            <SelectField
              label="Department"
              value={department}
              onChange={(e) => {
                setDepartment(e.target.value);
                setProgram('');
                setPage(1);
              }}
            >
              <option value="">Choose department...</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} · {d.name}
                </option>
              ))}
            </SelectField>

            <SelectField
              label="Programme"
              value={program}
              onChange={(e) => {
                setProgram(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Choose programme...</option>
              {programsInDept.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </SelectField>

            <div>
              <SearchInput
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search Student ID or Name..."
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Graduated Students Table */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Graduated Trainees</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {pagination.total} graduated student{pagination.total === 1 ? '' : 's'} found
            </p>
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
          emptyMessage="Students appear here once their cumulative CGPA is calculated and graduation status is approved."
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
    </div>
  );
}
