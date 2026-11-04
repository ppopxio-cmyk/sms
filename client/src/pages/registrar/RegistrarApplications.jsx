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

  const portalParam = searchParams.get('portalId') || '';
  const [selectedPortal, setSelectedPortal] = useState(portalParam);
  const [statusFilter, setStatusFilter] = useState('all');
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

  // 2. Fetch Applications
  const applicationsQuery = useQuery({
    queryKey: ['registrar', 'applications', { selectedPortal, statusFilter, search, page, limit }],
    queryFn: async () => {
      const params = { page, limit };
      if (selectedPortal) params.portalId = selectedPortal;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      return (await api.get(`${REGISTRAR}/applications`, { params })).data;
    },
  });

  const applications = applicationsQuery.data?.applications || [];
  const total = applicationsQuery.data?.total || 0;
  const pages = applicationsQuery.data?.pages || 1;

  // 3. Approve Mutation
  const approveMutation = useMutation({
    mutationFn: async (id) => {
      return (await api.post(`${REGISTRAR}/applications/${id}/approve`)).data;
    },
    onSuccess: (data) => {
      toast.success(data.message || `Student admitted! ID: ${data.assignedStudentId}`);
      queryClient.invalidateQueries({ queryKey: ['registrar', 'applications'] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'registration-portals'] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'students'] });
      if (activeApplication) {
        setActiveApplication((prev) => ({
          ...prev,
          status: 'approved',
          assignedStudentId: data.assignedStudentId,
          student: data.student,
        }));
      }
    },
    onError: (err) => {
      toast.error(errorMessage(err, 'Failed to admit student.'));
    },
  });

  // 4. Reject Mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }) => {
      return (await api.post(`${REGISTRAR}/applications/${id}/reject`, { reason })).data;
    },
    onSuccess: () => {
      toast.success('Application rejected.');
      setRejectingApp(null);
      setRejectionReason('');
      queryClient.invalidateQueries({ queryKey: ['registrar', 'applications'] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'registration-portals'] });
      if (activeApplication) {
        setActiveApplication((prev) => ({
          ...prev,
          status: 'rejected',
          rejectionReason,
        }));
      }
    },
    onError: (err) => {
      toast.error(errorMessage(err, 'Failed to reject application.'));
    },
  });

  // Stats calculation
  const stats = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    for (const app of applications) {
      if (app.status === 'pending') pending += 1;
      else if (app.status === 'approved') approved += 1;
      else if (app.status === 'rejected') rejected += 1;
    }
    return { pending, approved, rejected, total };
  }, [applications, total]);

  const handlePortalFilterChange = (portalId) => {
    setSelectedPortal(portalId);
    setPage(1);
    if (portalId) {
      setSearchParams({ portalId });
    } else {
      setSearchParams({});
    }
  };

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        eyebrow="Admissions Review Queue"
        title="Prospective Student Applications"
        subtitle="Review prospective student applications, verify entry qualifications and photographs, and officially admit qualified students."
      />

      {/* Filter and Control Bar */}
      <Card className="p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            {/* Search Input */}
            <div className="w-full sm:max-w-xs">
              <SearchInput
                value={search}
                onChange={(val) => {
                  setSearch(val);
                  setPage(1);
                }}
                placeholder="Search by name, ID, email, phone..."
              />
            </div>

            {/* Portal Dropdown */}
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
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {[
              { id: 'all', label: 'All' },
              { id: 'pending', label: 'Pending Review' },
              { id: 'approved', label: 'Admitted' },
              { id: 'rejected', label: 'Rejected' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.id);
                  setPage(1);
                }}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
                  statusFilter === tab.id
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Applications Table */}
      <Card className="overflow-hidden border-slate-200">
        {applicationsQuery.isLoading ? (
          <div className="p-12 text-center text-slate-500">Loading student applications...</div>
        ) : applications.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-3 text-lg font-bold text-slate-800">No Applications Found</h3>
            <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
              {search.trim() || statusFilter !== 'all' || selectedPortal
                ? 'Try adjusting your filters or search keywords.'
                : 'Prospective students who submit through active registration portals will appear here.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3.5">Applicant</th>
                  <th className="px-4 py-3.5">Intake Portal & Programme</th>
                  <th className="px-4 py-3.5">Contact Details</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Submitted</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {applications.map((app) => {
                  const birthMonthName = ETH_MONTHS[app.birthMonth - 1] || `Month ${app.birthMonth}`;
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
                              <span>·</span>
                              <span>
                                {app.birthYear ? `${birthMonthName} ${app.birthDay}, ${app.birthYear}` : '—'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Intake & Program */}
                      <td className="px-4 py-3 text-xs">
                        <p className="font-semibold text-slate-800">{app.portal?.program?.name || 'Programme'}</p>
                        <p className="text-slate-500">{app.portal?.title || 'Registration Portal'}</p>
                        <div className="mt-1 flex items-center gap-1.5">
                          <Badge tone="brand" className="uppercase text-[10px]">
                            {app.portal?.category || 'regular'}
                          </Badge>
                          {app.portal?.batch?.code ? (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                              {app.portal.batch.code}
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="px-4 py-3 text-xs space-y-0.5">
                        <p className="flex items-center gap-1.5 text-slate-700">
                          <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[180px]">{app.email}</span>
                        </p>
                        <p className="flex items-center gap-1.5 text-slate-700">
                          <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                          <span>{app.phone}</span>
                        </p>
                        {app.address?.city ? (
                          <p className="flex items-center gap-1.5 text-slate-500">
                            <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                            <span>{app.address.city}</span>
                          </p>
                        ) : null}
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
                      <UserX className="mr-1.5 h-4 w-4" /> Reject
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
                      const studentId = activeApplication.student?._id || activeApplication.student?.id || activeApplication.student;
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
                  src={activeApplication.photo?.url || activeApplication.photo?.thumbnailUrl || '/avatar-placeholder.png'}
                  alt=""
                  className="h-20 w-20 rounded-2xl object-cover ring-2 ring-brand-300 shadow-md"
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
                    {activeApplication.assignedStudentId ? (
                      <p className="mt-1 font-mono text-sm font-extrabold text-emerald-800">
                        {activeApplication.assignedStudentId}
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

            {/* Rejection Warning if rejected */}
            {activeApplication.status === 'rejected' && activeApplication.rejectionReason ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800">
                <span className="font-bold uppercase tracking-wider text-rose-900">Rejection Reason:</span>
                <p className="mt-1 italic">"{activeApplication.rejectionReason}"</p>
              </div>
            ) : null}

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
                      ? `${ETH_MONTHS[activeApplication.birthMonth - 1] || activeApplication.birthMonth} ${activeApplication.birthDay}, ${activeApplication.birthYear}`
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

            {/* 4. Previous Education & Target Program */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                4. Academic History & Target Enrollment
              </h4>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-xs">
                <div>
                  <span className="text-slate-400">Previous School / College:</span>
                  <p className="font-semibold text-slate-800">
                    {activeApplication.previousEducation?.schoolName || '—'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Completed: {activeApplication.previousEducation?.completionYear || '—'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Previous Result / GPA:</span>
                  <p className="font-semibold text-slate-800">
                    {activeApplication.previousEducation?.gpaOrResult || '—'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Target Programme:</span>
                  <p className="font-semibold text-brand-800">
                    {activeApplication.portal?.program?.name || 'Programme'}
                  </p>
                  <p className="text-[11px] text-slate-500 capitalize">
                    {activeApplication.portal?.program?.qualificationType || 'Degree'} · {activeApplication.portal?.category || 'Regular'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Target Batch:</span>
                  <p className="font-semibold text-slate-800">
                    {activeApplication.portal?.batch?.name || activeApplication.portal?.batch?.code || 'Assigned upon approval'}
                  </p>
                </div>
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
          subtitle={`Provide an official reason for rejecting ${rejectingApp.fullName}'s application.`}
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
                Confirm Rejection
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-700">Official Reason *</label>
            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Ineligible entrance examination score, unverified secondary school transcript, quota exceeded..."
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-rose-500 focus:outline-none"
            />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
