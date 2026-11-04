import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Users,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Eye,
  Mail,
  Phone,
  MapPin,
  GraduationCap,
  Calendar,
  Building2,
  BookOpen,
  UserCheck,
  AlertCircle,
  ShieldCheck,
  ChevronRight,
  UserX,
  FileText,
  Download,
  Layers,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { REGISTRAR } from '../../lib/registrar';
import { formatEthiopian, ETH_MONTHS } from '../../lib/ethiopianDate';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import SearchInput from '../../components/ui/SearchInput';
import Pagination from '../../components/ui/Pagination';

export default function RegistrarApplications() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const tabParam = searchParams.get('tab') || 'pending';
  const portalParam = searchParams.get('portalId') || '';

  // Main Tabs: 'pending' (Pending Applications) | 'approved' (Approved Students) | 'all' (All Queue)
  const [activeTab, setActiveTab] = useState(tabParam);
  const [selectedPortal, setSelectedPortal] = useState(portalParam);
  const [batchFilter, setBatchFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);

  const [activeApplication, setActiveApplication] = useState(null);
  const [rejectingApp, setRejectingApp] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // 1. Fetch Portals for the portal dropdown
  const portalsQuery = useQuery({
    queryKey: ['registrar', 'registration-portals-list'],
    queryFn: async () => (await api.get(`${REGISTRAR}/registration-portals`, { params: { limit: 100 } })).data,
  });
  const portals = portalsQuery.data?.portals || [];

  // 2. Fetch Academic Structure (Departments, Programs, Batches) for Approved Students filters
  const structureQuery = useQuery({
    queryKey: ['registrar', 'academic-structure'],
    queryFn: async () => (await api.get(`${REGISTRAR}/academic-structure`)).data,
  });
  const departments = structureQuery.data?.departments || [];
  const allPrograms = structureQuery.data?.programs || [];
  const allBatches = structureQuery.data?.batches || [];

  // Filter programs based on selected department
  const filteredPrograms = useMemo(() => {
    if (!departmentFilter) return allPrograms;
    return allPrograms.filter(
      (p) => String(p.department?._id || p.department) === String(departmentFilter)
    );
  }, [allPrograms, departmentFilter]);

  // Tab Badge Counts
  const pendingCountQuery = useQuery({
    queryKey: ['registrar', 'applications-count', 'pending'],
    queryFn: async () => {
      const res = await api.get(`${REGISTRAR}/applications`, { params: { status: 'pending', limit: 1 } });
      return res.data?.total || 0;
    },
  });

  const approvedCountQuery = useQuery({
    queryKey: ['registrar', 'applications-count', 'approved'],
    queryFn: async () => {
      const res = await api.get(`${REGISTRAR}/applications`, { params: { status: 'approved', limit: 1 } });
      return res.data?.total || 0;
    },
  });

  // 3. Fetch Applications based on active tab and filters
  const applicationsQuery = useQuery({
    queryKey: [
      'registrar',
      'applications',
      { activeTab, selectedPortal, batchFilter, departmentFilter, programFilter, search, page, limit },
    ],
    queryFn: async () => {
      const params = { page, limit };
      if (activeTab === 'pending') {
        params.status = 'pending';
      } else if (activeTab === 'approved') {
        params.status = 'approved';
      }
      if (selectedPortal) params.portalId = selectedPortal;
      if (batchFilter) params.batchId = batchFilter;
      if (departmentFilter) params.departmentId = departmentFilter;
      if (programFilter) params.programId = programFilter;
      if (search.trim()) params.search = search.trim();

      return (await api.get(`${REGISTRAR}/applications`, { params })).data;
    },
  });

  const applications = applicationsQuery.data?.applications || [];
  const total = applicationsQuery.data?.total || 0;
  const pages = applicationsQuery.data?.pages || 1;

  // 4. Approve Mutation
  const approveMutation = useMutation({
    mutationFn: async (id) => {
      return (await api.post(`${REGISTRAR}/applications/${id}/approve`)).data;
    },
    onSuccess: (data) => {
      const assignedId = data.student?.studentId || data.assignedStudentId;
      toast.success(data.message || `Student officially admitted! Student ID: ${assignedId}`);
      queryClient.invalidateQueries({ queryKey: ['registrar', 'applications'] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'applications-count'] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'registration-portals'] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'students'] });
      if (activeApplication) {
        setActiveApplication((prev) => ({
          ...prev,
          status: 'approved',
          assignedStudentId: assignedId,
          student: data.student,
        }));
      }
    },
    onError: (err) => {
      toast.error(errorMessage(err, 'Failed to admit student.'));
    },
  });

  // 5. Reject Mutation (Removes permanently from database)
  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }) => {
      return (await api.post(`${REGISTRAR}/applications/${id}/reject`, { reason })).data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Application rejected and completely removed from the database.');
      setRejectingApp(null);
      setRejectionReason('');
      setActiveApplication(null);
      queryClient.invalidateQueries({ queryKey: ['registrar', 'applications'] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'applications-count'] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'registration-portals'] });
    },
    onError: (err) => {
      toast.error(errorMessage(err, 'Failed to reject application.'));
    },
  });

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setPage(1);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tabId);
      return next;
    });
  };

  const handlePortalFilterChange = (portalId) => {
    setSelectedPortal(portalId);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        eyebrow="Admissions Review Queue"
        title="Student Applications & Admitted Students"
        subtitle="Review prospective student applications, verify entry qualifications and 12th grade certificates, and manage admitted students."
      />

      {/* Main Mode Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => handleTabChange('pending')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold transition ${
            activeTab === 'pending'
              ? 'border-amber-500 text-amber-700 bg-amber-50/40'
              : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
          }`}
        >
          <Clock className="h-4 w-4" />
          <span>Pending Applications</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              activeTab === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {pendingCountQuery.data ?? '—'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('approved')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold transition ${
            activeTab === 'approved'
              ? 'border-emerald-600 text-emerald-800 bg-emerald-50/40'
              : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
          }`}
        >
          <CheckCircle2 className="h-4 w-4" />
          <span>Approved Students</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              activeTab === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {approvedCountQuery.data ?? '—'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('all')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold transition ${
            activeTab === 'all'
              ? 'border-brand-600 text-brand-700 bg-brand-50/40'
              : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>All Applications Queue</span>
        </button>
      </div>

      {/* Filter and Control Bar */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Search Input */}
          <div className="w-full sm:max-w-xs">
            <SearchInput
              value={search}
              onChange={(val) => {
                setSearch(val);
                setPage(1);
              }}
              placeholder={
                activeTab === 'approved'
                  ? 'Search by Student ID, name, phone...'
                  : 'Search by reference #, name, phone...'
              }
            />
          </div>

          {/* Conditional Filters based on tab */}
          <div className="flex flex-wrap items-center gap-2.5">
            {activeTab === 'approved' ? (
              <>
                {/* Batch Filter */}
                <select
                  value={batchFilter}
                  onChange={(e) => {
                    setBatchFilter(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-brand-500 focus:outline-none"
                >
                  <option value="">All Batches</option>
                  {allBatches.map((b) => (
                    <option key={b._id || b.id} value={b._id || b.id}>
                      {b.name || b.code} ({b.category || 'Regular'})
                    </option>
                  ))}
                </select>

                {/* Department Filter */}
                <select
                  value={departmentFilter}
                  onChange={(e) => {
                    setDepartmentFilter(e.target.value);
                    setProgramFilter('');
                    setPage(1);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-brand-500 focus:outline-none"
                >
                  <option value="">All Departments</option>
                  {departments.map((d) => (
                    <option key={d._id || d.id} value={d._id || d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>

                {/* Programme Filter */}
                <select
                  value={programFilter}
                  onChange={(e) => {
                    setProgramFilter(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-brand-500 focus:outline-none"
                >
                  <option value="">All Programmes</option>
                  {filteredPrograms.map((p) => (
                    <option key={p._id || p.id} value={p._id || p.id}>
                      {p.name} ({p.qualificationType || 'Degree'})
                    </option>
                  ))}
                </select>
              </>
            ) : (
              /* Portal Filter for Pending and All */
              <select
                value={selectedPortal}
                onChange={(e) => handlePortalFilterChange(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-brand-500 focus:outline-none"
              >
                <option value="">All Intake Portals</option>
                {portals.map((p) => (
                  <option key={p.id || p._id} value={p._id || p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            )}

            {(batchFilter || departmentFilter || programFilter || selectedPortal || search) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBatchFilter('');
                  setDepartmentFilter('');
                  setProgramFilter('');
                  setSelectedPortal('');
                  setSearch('');
                  setPage(1);
                }}
                className="text-xs"
              >
                Clear Filters
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Content Table */}
      <Card className="overflow-hidden border-slate-200">
        {applicationsQuery.isLoading ? (
          <div className="p-12 text-center text-slate-500">
            Loading {activeTab === 'approved' ? 'admitted students' : 'student applications'}...
          </div>
        ) : applications.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-3 text-lg font-bold text-slate-800">
              {activeTab === 'approved' ? 'No Admitted Students Found' : 'No Applications Found'}
            </h3>
            <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
              {search.trim() || batchFilter || departmentFilter || programFilter || selectedPortal
                ? 'Try adjusting your filters or search keywords.'
                : activeTab === 'approved'
                ? 'When prospective students are approved, they will appear in this admitted students list.'
                : 'Prospective students submitting through active registration portals will appear here.'}
            </p>
          </div>
        ) : activeTab === 'approved' ? (
          /* Approved Students Table */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3.5">Admitted Student</th>
                  <th className="px-4 py-3.5">Official Student ID</th>
                  <th className="px-4 py-3.5">Department & Programme</th>
                  <th className="px-4 py-3.5">Assigned Batch</th>
                  <th className="px-4 py-3.5">Contact</th>
                  <th className="px-4 py-3.5">Admitted On</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {applications.map((app) => {
                  const studentRecordId = app.student?._id || app.student?.id || app.student;
                  const officialId = app.assignedStudentId || app.student?.studentId || app.generatedStudentId || '—';
                  const photoSrc =
                    app.photo?.thumbnailUrl ||
                    app.photo?.url ||
                    app.student?.photo?.url ||
                    '/avatar-placeholder.png';

                  return (
                    <tr key={app.id || app._id} className="hover:bg-slate-50/70 transition">
                      {/* Photo & Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={photoSrc}
                            alt=""
                            className="h-10 w-10 rounded-xl object-cover ring-1 ring-slate-200"
                            onError={(e) => {
                              e.target.src =
                                'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>';
                            }}
                          />
                          <div>
                            <p className="font-bold text-slate-900">{app.fullName}</p>
                            <span className="text-xs text-slate-500 capitalize">{app.gender}</span>
                          </div>
                        </div>
                      </td>

                      {/* Official Student ID */}
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-lg bg-emerald-50 px-2.5 py-1 font-mono text-xs font-extrabold text-emerald-800 ring-1 ring-emerald-200">
                          {officialId}
                        </span>
                      </td>

                      {/* Department & Programme */}
                      <td className="px-4 py-3 text-xs">
                        <p className="font-semibold text-slate-900">
                          {app.program?.name || app.portal?.program?.name || 'Programme'}
                        </p>
                        <p className="text-slate-500">
                          {app.department?.name || app.portal?.department?.name || 'Department'}
                        </p>
                        <span className="mt-0.5 inline-block text-[10px] font-medium uppercase text-brand-700">
                          {app.qualificationType || app.program?.qualificationType || 'Degree'}
                        </span>
                      </td>

                      {/* Assigned Batch */}
                      <td className="px-4 py-3 text-xs">
                        <p className="font-semibold text-slate-800">
                          {app.batch?.name || app.batch?.code || app.portal?.batch?.name || 'Assigned'}
                        </p>
                        <Badge tone="neutral" className="uppercase text-[10px] mt-0.5">
                          {app.batch?.category || app.portal?.category || 'Regular'}
                        </Badge>
                      </td>

                      {/* Contact */}
                      <td className="px-4 py-3 text-xs space-y-0.5">
                        <p className="flex items-center gap-1.5 text-slate-700">
                          <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                          <span>{app.phone}</span>
                        </p>
                        <p className="flex items-center gap-1.5 text-slate-500">
                          <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[160px]">{app.email}</span>
                        </p>
                      </td>

                      {/* Admitted On */}
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {app.reviewedAt
                          ? new Date(app.reviewedAt).toLocaleDateString()
                          : app.createdAt
                          ? new Date(app.createdAt).toLocaleDateString()
                          : '—'}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setActiveApplication(app)}
                            className="gap-1 text-xs"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Application
                          </Button>

                          {studentRecordId ? (
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs"
                              onClick={() => navigate(`/registrar/students/${studentRecordId}`)}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Profile
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Applications Queue Table (Pending & All) */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3.5">Applicant</th>
                  <th className="px-4 py-3.5">Target Programme</th>
                  <th className="px-4 py-3.5">Contact Details</th>
                  <th className="px-4 py-3.5">Certificate Document</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Submitted</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {applications.map((app) => {
                  const birthMonthName = ETH_MONTHS[app.birthMonth - 1] || `Month ${app.birthMonth}`;
                  const hasDoc = Boolean(app.certificateDocument?.url || app.certificateDocument?.fileName);

                  return (
                    <tr key={app.id || app._id} className="hover:bg-slate-50/70 transition">
                      {/* Applicant Info */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={app.photo?.thumbnailUrl || app.photo?.url || '/avatar-placeholder.png'}
                            alt=""
                            className="h-10 w-10 rounded-xl object-cover ring-1 ring-slate-200"
                            onError={(e) => {
                              e.target.src =
                                'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>';
                            }}
                          />
                          <div>
                            <p className="font-bold text-slate-900">{app.fullName}</p>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <span className="font-mono font-medium text-brand-700">{app.applicationNumber}</span>
                              <span>·</span>
                              <span className="capitalize">{app.gender}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Programme & Qualification */}
                      <td className="px-4 py-3 text-xs">
                        <p className="font-semibold text-slate-800">
                          {app.program?.name || app.portal?.program?.name || 'Programme'}
                        </p>
                        <p className="text-slate-500">
                          {app.department?.name || app.portal?.department?.name || app.portal?.title || 'Portal'}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5">
                          <Badge tone="brand" className="uppercase text-[10px]">
                            {app.qualificationType || app.program?.qualificationType || 'degree'}
                          </Badge>
                          {app.batch?.code || app.portal?.batch?.code ? (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                              {app.batch?.code || app.portal?.batch?.code}
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="px-4 py-3 text-xs space-y-0.5">
                        <p className="flex items-center gap-1.5 text-slate-700">
                          <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                          <span>{app.phone}</span>
                        </p>
                        <p className="flex items-center gap-1.5 text-slate-700">
                          <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[160px]">{app.email}</span>
                        </p>
                      </td>

                      {/* Certificate Document badge */}
                      <td className="px-4 py-3 text-xs">
                        {hasDoc ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-200">
                            <FileText className="h-3 w-3 text-blue-500" />
                            Attached
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">None</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {app.status === 'approved' ? (
                          <div className="space-y-1">
                            <Badge tone="success" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Admitted
                            </Badge>
                            {app.assignedStudentId ? (
                              <p className="font-mono text-xs font-bold text-emerald-800">
                                {app.assignedStudentId}
                              </p>
                            ) : null}
                          </div>
                        ) : app.status === 'rejected' ? (
                          <Badge tone="danger" className="gap-1">
                            <XCircle className="h-3 w-3" /> Rejected
                          </Badge>
                        ) : (
                          <Badge tone="warning" className="gap-1">
                            <Clock className="h-3 w-3" /> Pending Review
                          </Badge>
                        )}
                      </td>

                      {/* Submitted Date */}
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {app.createdAt ? new Date(app.createdAt).toLocaleDateString() : '—'}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setActiveApplication(app)}
                          className="gap-1 text-xs font-bold"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          {app.status === 'pending' ? 'Review & Admit' : 'View Details'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pagination */}
      {pages > 1 ? (
        <div className="pt-2">
          <Pagination page={page} pages={pages} total={total} onChange={setPage} />
        </div>
      ) : null}

      {/* Application Details Review Modal */}
      {activeApplication ? (
        <Modal
          open={Boolean(activeApplication)}
          onClose={() => setActiveApplication(null)}
          title="Student Application Review"
          subtitle={`Application Reference: ${activeApplication.applicationNumber}`}
          size="lg"
          footer={
            <div className="flex w-full items-center justify-between gap-3">
              <Button variant="outline" onClick={() => setActiveApplication(null)}>
                Close
              </Button>

              <div className="flex items-center gap-2">
                {activeApplication.status === 'pending' ? (
                  <>
                    <Button
                      variant="outline"
                      className="border-rose-200 text-rose-700 hover:bg-rose-50"
                      onClick={() => setRejectingApp(activeApplication)}
                    >
                      <UserX className="mr-1.5 h-4 w-4" /> Reject & Remove
                    </Button>
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      loading={approveMutation.isPending}
                      onClick={() => approveMutation.mutate(activeApplication.id || activeApplication._id)}
                    >
                      <UserCheck className="mr-1.5 h-4 w-4" /> Approve & Admit Student
                    </Button>
                  </>
                ) : activeApplication.status === 'approved' && activeApplication.student ? (
                  <Button
                    onClick={() => {
                      const studentId =
                        activeApplication.student?._id ||
                        activeApplication.student?.id ||
                        activeApplication.student;
                      navigate(`/registrar/students/${studentId}`);
                    }}
                  >
                    <ExternalLink className="mr-1.5 h-4 w-4" /> Go to Official Student Record
                  </Button>
                ) : null}
              </div>
            </div>
          }
        >
          <div className="space-y-5">
            {/* Applicant Summary Banner */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-4">
                <img
                  src={
                    activeApplication.photo?.url ||
                    activeApplication.photo?.thumbnailUrl ||
                    '/avatar-placeholder.png'
                  }
                  alt=""
                  className="h-20 w-20 rounded-2xl object-cover ring-2 ring-brand-300 shadow-md shrink-0"
                  onError={(e) => {
                    e.target.src =
                      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>';
                  }}
                />
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{activeApplication.fullName}</h3>
                  <p className="text-xs font-mono font-semibold text-brand-700">
                    {activeApplication.applicationNumber}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Submitted on: {new Date(activeApplication.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>

              <div>
                {activeApplication.status === 'approved' ? (
                  <div className="text-right">
                    <Badge tone="success" className="gap-1 font-bold text-xs py-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Admitted Student
                    </Badge>
                    {activeApplication.assignedStudentId || activeApplication.student?.studentId ? (
                      <p className="mt-1 font-mono text-sm font-extrabold text-emerald-800">
                        {activeApplication.assignedStudentId || activeApplication.student?.studentId}
                      </p>
                    ) : null}
                  </div>
                ) : activeApplication.status === 'rejected' ? (
                  <div className="text-right">
                    <Badge tone="danger" className="gap-1 font-bold text-xs py-1">
                      <XCircle className="h-3.5 w-3.5" /> Application Rejected
                    </Badge>
                  </div>
                ) : (
                  <Badge tone="warning" className="gap-1 font-bold text-xs py-1">
                    <Clock className="h-3.5 w-3.5" /> Pending Admission
                  </Badge>
                )}
              </div>
            </div>

            {/* 1. Personal & Identity Details */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                1. Personal Details & Birth Date
              </h4>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-xs">
                <div>
                  <span className="text-slate-400">Gender:</span>
                  <p className="font-semibold capitalize text-slate-800">{activeApplication.gender || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Ethiopian Birth Date:</span>
                  <p className="font-semibold text-slate-800">
                    {activeApplication.birthYear
                      ? `${ETH_MONTHS[activeApplication.birthMonth - 1] || activeApplication.birthMonth} ${
                          activeApplication.birthDay
                        }, ${activeApplication.birthYear}`
                      : '—'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Nationality:</span>
                  <p className="font-semibold text-slate-800">{activeApplication.nationality || 'Ethiopian'}</p>
                </div>
              </div>
            </div>

            {/* 2. Contact & Address */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                2. Contact & Residential Address
              </h4>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-xs">
                <div>
                  <span className="text-slate-400">Google Email:</span>
                  <p className="font-semibold text-slate-800 break-all">{activeApplication.email}</p>
                </div>
                <div>
                  <span className="text-slate-400">Primary Phone:</span>
                  <p className="font-semibold text-slate-800">{activeApplication.phone}</p>
                </div>
                <div>
                  <span className="text-slate-400">City / Region:</span>
                  <p className="font-semibold text-slate-800">
                    {activeApplication.address?.city || '—'} ({activeApplication.address?.region || 'Addis Ababa'})
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Subcity / Woreda / House:</span>
                  <p className="font-semibold text-slate-800">
                    {[
                      activeApplication.address?.subcity,
                      activeApplication.address?.woreda ? `Woreda ${activeApplication.address.woreda}` : '',
                      activeApplication.address?.houseNumber ? `House ${activeApplication.address.houseNumber}` : '',
                    ]
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* 3. Emergency Contact */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                3. Emergency Contact
              </h4>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-xs">
                <div>
                  <span className="text-slate-400">Contact Name:</span>
                  <p className="font-semibold text-slate-800">{activeApplication.emergencyContact?.name || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Relationship:</span>
                  <p className="font-semibold text-slate-800">{activeApplication.emergencyContact?.relationship || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Contact Phone:</span>
                  <p className="font-semibold text-slate-800">{activeApplication.emergencyContact?.phone || '—'}</p>
                </div>
              </div>
            </div>

            {/* 4. Target Qualification & Programme */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                4. Target Qualification & Enrollment
              </h4>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-xs">
                <div>
                  <span className="text-slate-400">Qualification Type:</span>
                  <p className="font-semibold uppercase text-brand-800">
                    {activeApplication.qualificationType || activeApplication.program?.qualificationType || 'Degree'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Target Programme:</span>
                  <p className="font-semibold text-slate-800">
                    {activeApplication.program?.name || activeApplication.portal?.program?.name || 'Programme'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Target Department:</span>
                  <p className="font-semibold text-slate-800">
                    {activeApplication.department?.name || activeApplication.portal?.department?.name || 'Department'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Target Batch:</span>
                  <p className="font-semibold text-slate-800">
                    {activeApplication.batch?.name ||
                      activeApplication.batch?.code ||
                      activeApplication.portal?.batch?.name ||
                      'Assigned upon approval'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Previous School / College:</span>
                  <p className="font-semibold text-slate-800">
                    {activeApplication.previousEducation?.schoolName || '—'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Completion Year:</span>
                  <p className="font-semibold text-slate-800">
                    {activeApplication.previousEducation?.completionYear || '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* 5. 12th Grade Result Certificate Document */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                5. 12th Grade Result Certificate Document
              </h4>
              <div className="mt-2">
                {activeApplication.certificateDocument?.url ? (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shrink-0">
                          <FileText className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 text-xs">
                            {activeApplication.certificateDocument.fileName || '12th Grade Result Certificate'}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                            <span>
                              {activeApplication.certificateDocument.fileSize
                                ? `${(activeApplication.certificateDocument.fileSize / 1024 / 1024).toFixed(2)} MB`
                                : 'Document attached'}
                            </span>
                            {activeApplication.certificateDocument.fileType ? (
                              <>
                                <span>·</span>
                                <span className="uppercase">
                                  {activeApplication.certificateDocument.fileType.split('/')[1] || 'PDF'}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <a
                          href={activeApplication.certificateDocument.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm hover:bg-blue-50 transition"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View Document
                        </a>
                        <a
                          href={activeApplication.certificateDocument.url}
                          download={activeApplication.certificateDocument.fileName || '12th-grade-certificate'}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </a>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                    <FileText className="mx-auto h-6 w-6 text-slate-400 mb-1" />
                    No 12th Grade Result Certificate document uploaded for this applicant.
                  </div>
                )}
              </div>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* Rejection Prompt Modal */}
      {rejectingApp ? (
        <Modal
          open={Boolean(rejectingApp)}
          onClose={() => setRejectingApp(null)}
          title="Reject Student Application"
          subtitle={`Rejecting will completely remove ${rejectingApp.fullName}'s application from the database.`}
          size="sm"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectingApp(null)}>
                Cancel
              </Button>
              <Button
                className="bg-rose-600 hover:bg-rose-700 text-white"
                loading={rejectMutation.isPending}
                onClick={() => {
                  if (!rejectionReason.trim()) return toast.error('Enter a rejection reason.');
                  rejectMutation.mutate({
                    id: rejectingApp.id || rejectingApp._id,
                    reason: rejectionReason.trim(),
                  });
                }}
              >
                Confirm Rejection & Delete
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            <p className="text-xs text-rose-600 font-medium">
              Note: This action is permanent. The application record and any associated documents will be deleted.
            </p>
            <label className="text-xs font-semibold text-slate-700">Official Rejection Reason *</label>
            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Ineligible entrance examination score, unverified secondary school certificate, quota exceeded..."
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-rose-500 focus:outline-none"
            />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
