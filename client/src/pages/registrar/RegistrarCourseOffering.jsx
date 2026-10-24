import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Building2, Calendar, CheckCircle2, Clock, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { REGISTRAR, humanStatus, levelLabel, toneForStatus } from '../../lib/registrar';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import SearchInput from '../../components/ui/SearchInput';
import Pagination from '../../components/ui/Pagination';

export default function RegistrarCourseOffering() {
  const [selectedDept, setSelectedDept] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // Fetch options to get all departments
  const optionsQuery = useQuery({
    queryKey: ['registrar', 'offering-options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/offerings/options`)).data,
    staleTime: 5 * 60_000,
  });

  const departments = optionsQuery.data?.departments || [];

  // Fetch all course offerings
  const offeringsQuery = useQuery({
    queryKey: ['registrar', 'all-course-offerings', page, limit],
    queryFn: async () => (await api.get(`${REGISTRAR}/offerings`, { params: { page, limit } })).data,
  });

  const offerings = offeringsQuery.data?.rows || [];
  const pagination = offeringsQuery.data?.pagination || { page: 1, pages: 1, total: 0, limit: 20 };

  // Filter offerings by department and search
  const filteredOfferings = useMemo(() => {
    let rows = offerings;
    if (selectedDept) {
      // Find programs belonging to this department
      const progsInDept = new Set(
        (optionsQuery.data?.programs || [])
          .filter((p) => String(p.department?.id || p.department) === String(selectedDept))
          .map((p) => String(p.id)),
      );
      rows = rows.filter((r) => {
        const progId = String(r.program?.id || r.program?._id || '');
        return progsInDept.has(progId);
      });
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) =>
        [
          r.course?.code,
          r.course?.title,
          r.program?.code,
          r.program?.name,
          r.teacher?.name,
          r.batch?.code,
        ].some((val) => String(val || '').toLowerCase().includes(q)),
      );
    }
    return rows;
  }, [offerings, selectedDept, search, optionsQuery.data?.programs]);

  const columns = [
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
      label: 'Programme & Level',
      render: (row) => (
        <div>
          <p className="text-sm text-slate-800 font-medium">{row.program?.code || '—'}</p>
          <p className="text-xs text-slate-400">
            {levelLabel(row.level, row.program?.qualificationType)} · {humanStatus(row.category || 'regular')}
          </p>
        </div>
      ),
    },
    {
      key: 'term',
      label: 'Academic year & Term',
      render: (row) => (
        <div>
          <p className="text-xs font-medium text-slate-700">{row.academicYear?.label || '—'}</p>
          <p className="text-xs text-slate-400">{row.term || 'All terms'}</p>
        </div>
      ),
    },
    {
      key: 'teacher',
      label: 'Assigned teacher',
      render: (row) => (
        row.teacher ? (
          <div>
            <p className="text-sm text-slate-800">{row.teacher.name}</p>
            <p className="text-xs text-slate-400">{row.teacher.email}</p>
          </div>
        ) : (
          <span className="text-xs text-slate-400 italic">Unassigned</span>
        )
      ),
    },
    {
      key: 'seats',
      label: 'Enrolled / Capacity',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-800">
            {row.registeredCount ?? 0} / {row.capacity ?? '—'}
          </p>
          <p className="text-xs text-slate-400">
            {row.capacity ? `${Math.max(0, row.capacity - (row.registeredCount ?? 0))} seats left` : 'No cap'}
          </p>
        </div>
      ),
    },
    {
      key: 'schedule',
      label: 'Schedule',
      render: (row) => (
        <span className="text-xs text-slate-600">
          {row.schedule || 'To be announced'}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <Badge tone={toneForStatus(row.status)}>{humanStatus(row.status)}</Badge>,
    },
  ];

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Course offerings"
        subtitle="View all assigned course offerings produced from published curriculum plans across departments."
      />

      <Card>
        {/* Department filter tabs */}
        <div className="border-b border-slate-100 px-5 py-3.5 bg-slate-50/50">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 shrink-0 mr-2 flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" /> Department:
            </span>
            <button
              type="button"
              onClick={() => { setSelectedDept(''); setPage(1); }}
              className={`focus-ring shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition ${!selectedDept ? 'bg-brand-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
            >
              All departments
            </button>
            {departments.map((dept) => (
              <button
                key={dept.id}
                type="button"
                onClick={() => { setSelectedDept(dept.id); setPage(1); }}
                className={`focus-ring shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition ${selectedDept === dept.id ? 'bg-brand-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
              >
                {dept.code} · {dept.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <p className="text-xs text-slate-500">
            Showing <span className="font-semibold text-slate-800">{filteredOfferings.length}</span> course offering{filteredOfferings.length === 1 ? '' : 's'}
          </p>
          <div className="w-72">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search course, teacher, or programme..."
            />
          </div>
        </div>

        <RegistrarTable
          columns={columns}
          rows={filteredOfferings}
          loading={offeringsQuery.isLoading}
          error={offeringsQuery.error ? offeringsQuery.error?.response?.data?.message || 'Offerings could not be loaded.' : null}
          onRetry={offeringsQuery.refetch}
          rowKey={(row) => row.id}
          emptyTitle="No course offerings found"
          emptyMessage="When curriculum plans are published, offerings are automatically assigned and listed here."
          noResultsTitle="No offerings match filters"
          noResultsMessage="Try selecting another department tab or clearing the search query."
        />

        <div className="px-5 pb-4 pt-2">
          <Pagination
            page={pagination.page}
            pages={pagination.pages}
            total={pagination.total}
            limit={pagination.limit}
            onPage={setPage}
            onLimit={(val) => { setLimit(val); setPage(1); }}
          />
        </div>
      </Card>
    </div>
  );
}
