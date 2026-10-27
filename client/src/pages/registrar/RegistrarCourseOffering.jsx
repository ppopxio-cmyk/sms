import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Building2, Calendar, CheckCircle2, Clock, Layers, Sparkles, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import { REGISTRAR, humanStatus, levelLabel, toneForStatus } from '../../lib/registrar';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { SelectField } from '../../components/registrar/Fields';
import SearchInput from '../../components/ui/SearchInput';
import Pagination from '../../components/ui/Pagination';

export default function RegistrarCourseOffering() {
  const queryClient = useQueryClient();
  const [selectedDept, setSelectedDept] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // Bulk offering modal state
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkYear, setBulkYear] = useState('');
  const [bulkTerm, setBulkTerm] = useState('Semester 1');
  const [bulkDept, setBulkDept] = useState('');
  const [bulkCategory, setBulkCategory] = useState('regular');
  const [autoAssignTeacher, setAutoAssignTeacher] = useState(true);
  const [autoRegisterStudents, setAutoRegisterStudents] = useState(true);

  // Fetch options to get all departments
  const optionsQuery = useQuery({
    queryKey: ['registrar', 'offering-options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/offerings/options`)).data,
    staleTime: 5 * 60_000,
  });

  const departments = optionsQuery.data?.departments || [];
  const academicYears = optionsQuery.data?.academicYears || [];

  // Default bulk year to current academic year
  useEffect(() => {
    if (!bulkYear && academicYears.length > 0) {
      const current = academicYears.find((y) => y.isCurrent) || academicYears[0];
      if (current) setBulkYear(current.id);
    }
  }, [academicYears, bulkYear]);

  // Bulk generate mutation
  const bulkMutation = useMutation({
    mutationFn: async () => {
      return (
        await api.post(`${REGISTRAR}/offerings/bulk`, {
          academicYear: bulkYear || undefined,
          term: bulkTerm,
          department: bulkDept || undefined,
          category: bulkCategory,
          autoAssignTeacher,
          autoRegisterStudents,
        })
      ).data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Course offerings generated successfully.');
      setBulkModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['registrar', 'all-course-offerings'] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'offering-options'] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'offerings'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to generate course offerings.');
    },
  });

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
        actions={
          <Button
            size="sm"
            variant="primary"
            onClick={() => setBulkModalOpen(true)}
            className="gap-2 shadow-sm"
          >
            <Sparkles className="h-4 w-4" />
            Bulk generate offerings
          </Button>
        }
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

      {/* Bulk Offerings Modal */}
      <Modal
        open={bulkModalOpen}
        onClose={() => !bulkMutation.isPending && setBulkModalOpen(false)}
        title="Bulk generate course offerings"
        subtitle="Create open course offerings in bulk for all active courses, assigning teachers and enrolling students."
        size="md"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setBulkModalOpen(false)}
              disabled={bulkMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => bulkMutation.mutate()}
              loading={bulkMutation.isPending}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Generate offerings
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4 text-xs text-brand-900 leading-relaxed">
            <p className="font-semibold text-brand-950 flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="h-4 w-4 text-brand-600" /> Automated Academic Scheduling
            </p>
            This scans all active courses in your selected department (or college-wide), creates open offerings for the selected academic term, ensures course guides and syllabi are published, and enrolls active students.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              label="Academic year"
              value={bulkYear}
              onChange={(e) => setBulkYear(e.target.value)}
            >
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label} {y.isCurrent ? '(Current)' : ''}
                </option>
              ))}
            </SelectField>

            <SelectField
              label="Term / Semester"
              value={bulkTerm}
              onChange={(e) => setBulkTerm(e.target.value)}
            >
              <option value="Semester 1">Semester 1</option>
              <option value="Semester 2">Semester 2</option>
              <option value="Term 1">Term 1</option>
              <option value="Term 2">Term 2</option>
              <option value="Summer">Summer Term</option>
            </SelectField>

            <SelectField
              label="Department scope"
              value={bulkDept}
              onChange={(e) => setBulkDept(e.target.value)}
            >
              <option value="">All departments (All courses)</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} · {d.name}
                </option>
              ))}
            </SelectField>

            <SelectField
              label="Delivery stream"
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
            >
              <option value="regular">Regular</option>
              <option value="extension">Extension</option>
            </SelectField>
          </div>

          <div className="space-y-2.5 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
            <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={autoAssignTeacher}
                onChange={(e) => setAutoAssignTeacher(e.target.checked)}
                className="rounded text-brand-600 focus:ring-brand-500"
              />
              Auto-assign qualified department & programme teachers
            </label>

            <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRegisterStudents}
                onChange={(e) => setAutoRegisterStudents(e.target.checked)}
                className="rounded text-brand-600 focus:ring-brand-500"
              />
              Automatically enroll active students of matching programmes
            </label>
          </div>
        </div>
      </Modal>
    </div>
  );
}
