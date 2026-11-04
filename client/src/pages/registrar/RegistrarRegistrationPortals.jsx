import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import {
  Globe,
  Plus,
  Search,
  Copy,
  Check,
  ExternalLink,
  QrCode,
  Calendar,
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  Edit3,
  Power,
  PlaySquare,
  BookOpen,
  Building2,
  Share2,
  Download,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { REGISTRAR } from '../../lib/registrar';
import { formatEthiopian } from '../../lib/ethiopianDate';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import SearchInput from '../../components/ui/SearchInput';
import Pagination from '../../components/ui/Pagination';

const INITIAL_FORM = {
  title: '',
  department: '',
  program: '',
  batch: '',
  category: 'regular',
  opensAt: new Date().toISOString().slice(0, 10),
  closesAt: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  maxApplications: 500,
  tutorialVideoUrl: '',
  instructions: '',
};

export default function RegistrarRegistrationPortals() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit] = useState(12);

  const [createOpen, setCreateOpen] = useState(false);
  const [editPortal, setEditPortal] = useState(null);
  const [qrModal, setQrModal] = useState({ open: false, portal: null, dataUrl: null });
  const [copiedId, setCopiedId] = useState(null);

  const [form, setForm] = useState(INITIAL_FORM);

  // 1. Fetch options (departments, programs, batches)
  const optionsQuery = useQuery({
    queryKey: ['registrar', 'student-options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/students/options`)).data,
  });

  const departments = optionsQuery.data?.departments || [];
  const programs = optionsQuery.data?.programs || [];
  const batches = optionsQuery.data?.batches || [];

  // Filter programs by selected department
  const availablePrograms = useMemo(() => {
    if (!form.department) return programs;
    return programs.filter((p) => String(p.department) === String(form.department));
  }, [programs, form.department]);

  // Filter batches by selected program
  const availableBatches = useMemo(() => {
    if (!form.program) return batches;
    return batches.filter((b) => String(b.program) === String(form.program));
  }, [batches, form.program]);

  // 2. Fetch Portals
  const portalsQuery = useQuery({
    queryKey: ['registrar', 'registration-portals', { search, statusFilter, page, limit }],
    queryFn: async () => {
      const params = { page, limit };
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== 'all') params.status = statusFilter;
      return (await api.get(`${REGISTRAR}/registration-portals`, { params })).data;
    },
  });

  const portals = portalsQuery.data?.portals || [];
  const total = portalsQuery.data?.total || 0;
  const pages = portalsQuery.data?.pages || 1;

  // Overview statistics
  const stats = useMemo(() => {
    let activeCount = 0;
    let totalApps = 0;
    let pendingApps = 0;
    let approvedApps = 0;
    for (const p of portals) {
      if (p.isOpen) activeCount += 1;
      totalApps += p.stats?.total || 0;
      pendingApps += p.stats?.pending || 0;
      approvedApps += p.stats?.approved || 0;
    }
    return { activeCount, totalApps, pendingApps, approvedApps };
  }, [portals]);

  // 3. Create Portal Mutation
  const createMutation = useMutation({
    mutationFn: async (payload) => {
      return (await api.post(`${REGISTRAR}/registration-portals`, payload)).data;
    },
    onSuccess: (data) => {
      toast.success(`Registration portal "${data.portal?.title}" created successfully!`);
      setCreateOpen(false);
      setForm(INITIAL_FORM);
      queryClient.invalidateQueries({ queryKey: ['registrar', 'registration-portals'] });
    },
    onError: (err) => {
      toast.error(errorMessage(err, 'Failed to create registration portal.'));
    },
  });

  // 4. Update Portal Mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }) => {
      return (await api.patch(`${REGISTRAR}/registration-portals/${id}`, updates)).data;
    },
    onSuccess: () => {
      toast.success('Registration portal updated.');
      setEditPortal(null);
      queryClient.invalidateQueries({ queryKey: ['registrar', 'registration-portals'] });
    },
    onError: (err) => {
      toast.error(errorMessage(err, 'Failed to update portal.'));
    },
  });

  const handleCopyLink = async (portal) => {
    const url = `${window.location.origin}/register/${portal.portalId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(portal.portalId);
      toast.success('Application portal link copied to clipboard.');
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      toast.error('Could not copy link to clipboard.');
    }
  };

  const handleShowQr = async (portal) => {
    const url = `${window.location.origin}/register/${portal.portalId}`;
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 320, margin: 2 });
      setQrModal({ open: true, portal, dataUrl });
    } catch {
      toast.error('Could not generate QR code.');
    }
  };

  const handleDownloadQr = () => {
    if (!qrModal.dataUrl || !qrModal.portal) return;
    const a = document.createElement('a');
    a.href = qrModal.dataUrl;
    a.download = `QR-${qrModal.portal.portalId}.png`;
    a.click();
  };

  const handleToggleStatus = (portal) => {
    const newStatus = portal.status === 'open' ? 'closed' : 'open';
    updateMutation.mutate({
      id: portal._id || portal.id,
      updates: { status: newStatus },
    });
  };

  const handleStartEdit = (portal) => {
    setEditPortal({
      id: portal._id || portal.id,
      title: portal.title || '',
      status: portal.status || 'open',
      opensAt: portal.opensAt ? new Date(portal.opensAt).toISOString().slice(0, 10) : '',
      closesAt: portal.closesAt ? new Date(portal.closesAt).toISOString().slice(0, 10) : '',
      maxApplications: portal.maxApplications || 500,
      tutorialVideoUrl: portal.tutorialVideoUrl || '',
      instructions: portal.instructions || '',
    });
  };

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        eyebrow="Admissions & Intake"
        title="Student Registration Portals"
        subtitle="Create and publish self-registration portals with capacity quotas, intake dates, and YouTube application guides."
        actions={
          <Button
            onClick={() => {
              setForm(INITIAL_FORM);
              setCreateOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Create Intake Portal
          </Button>
        }
      />

      {/* Overview Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 bg-white/70 backdrop-blur border-slate-200">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active Portals</p>
              <p className="text-2xl font-bold text-slate-900">{stats.activeCount}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-white/70 backdrop-blur border-slate-200">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Applications</p>
              <p className="text-2xl font-bold text-slate-900">{stats.totalApps}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-white/70 backdrop-blur border-slate-200">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Pending Review</p>
              <p className="text-2xl font-bold text-amber-600">{stats.pendingApps}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-white/70 backdrop-blur border-slate-200">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Admitted Students</p>
              <p className="text-2xl font-bold text-emerald-600">{stats.approvedApps}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-md">
            <SearchInput
              value={search}
              onChange={(val) => {
                setSearch(val);
                setPage(1);
              }}
              placeholder="Search portals by campaign title..."
            />
          </div>
          <div className="flex items-center gap-2">
            {['all', 'open', 'closed', 'archived'].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => {
                  setStatusFilter(status);
                  setPage(1);
                }}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
                  statusFilter === status
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Portals Grid */}
      {portalsQuery.isLoading ? (
        <div className="p-12 text-center text-slate-500">Loading registration portals...</div>
      ) : portals.length === 0 ? (
        <Card className="p-12 text-center">
          <Globe className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-3 text-lg font-bold text-slate-800">No Registration Portals Found</h3>
          <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
            Create an intake portal to start receiving online student applications for degree, TVET, or short courses.
          </p>
          <Button onClick={() => setCreateOpen(true)} className="mt-5 gap-2">
            <Plus className="h-4 w-4" /> Create First Portal
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {portals.map((portal) => {
            const isLive = portal.isOpen;
            const totalApps = portal.stats?.total || 0;
            const quota = portal.maxApplications || 500;
            const pct = Math.min(100, Math.round((totalApps / quota) * 100));

            return (
              <Card key={portal.portalId || portal._id} className="flex flex-col justify-between p-5 border-slate-200 hover:shadow-md transition">
                <div>
                  {/* Top line: Badges and Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={isLive ? 'success' : portal.status === 'open' ? 'warning' : 'neutral'}>
                        {isLive ? 'Open Now' : portal.status === 'closed' ? 'Closed' : 'Scheduled'}
                      </Badge>
                      <Badge tone="brand" className="uppercase text-[10px]">
                        {portal.category}
                      </Badge>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(portal)}
                      title={portal.status === 'open' ? 'Close Portal' : 'Reopen Portal'}
                      className={`p-1.5 rounded-lg border transition ${
                        portal.status === 'open'
                          ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                          : 'border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                      }`}
                    >
                      <Power className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Title & Structure */}
                  <h3 className="mt-3 text-base font-bold text-slate-900 leading-snug">
                    {portal.title}
                  </h3>
                  <div className="mt-2 space-y-1 text-xs text-slate-600">
                    <p className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="font-semibold text-slate-700">Dept:</span> {portal.department?.name || 'Department'}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="font-semibold text-slate-700">Prog:</span> {portal.program?.name || 'Programme'}
                    </p>
                    {portal.batch?.code ? (
                      <p className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="font-semibold text-slate-700">Batch:</span> {portal.batch.code} ({portal.batch.name})
                      </p>
                    ) : null}
                  </div>

                  {/* Schedule */}
                  <div className="mt-3 rounded-xl bg-slate-50 p-2.5 text-xs text-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-slate-500">
                        <Calendar className="h-3.5 w-3.5" /> Schedule:
                      </span>
                      <span className="font-medium text-slate-800">
                        {portal.opensAt ? new Date(portal.opensAt).toLocaleDateString() : '—'} →{' '}
                        {portal.closesAt ? new Date(portal.closesAt).toLocaleDateString() : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Quota Progress */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-500">Capacity Filled:</span>
                      <span className="text-slate-800">
                        {totalApps} / {quota} ({pct}%)
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-brand-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Application Counters */}
                  <div className="mt-4 grid grid-cols-3 gap-1.5 text-center text-xs">
                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 py-1.5 px-2">
                      <p className="font-bold text-amber-800">{portal.stats?.pending || 0}</p>
                      <p className="text-[10px] uppercase font-semibold text-amber-600">Pending</p>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 py-1.5 px-2">
                      <p className="font-bold text-emerald-800">{portal.stats?.approved || 0}</p>
                      <p className="text-[10px] uppercase font-semibold text-emerald-600">Admitted</p>
                    </div>
                    <div className="rounded-xl border border-rose-200 bg-rose-50/70 py-1.5 px-2">
                      <p className="font-bold text-rose-800">{portal.stats?.rejected || 0}</p>
                      <p className="text-[10px] uppercase font-semibold text-rose-600">Rejected</p>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="mt-5 pt-4 border-t border-slate-100 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyLink(portal)}
                      className="flex-1 gap-1 text-xs font-semibold"
                    >
                      {copiedId === portal.portalId ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copiedId === portal.portalId ? 'Copied' : 'Copy Link'}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleShowQr(portal)}
                      title="Show QR Code"
                      className="px-2.5"
                    >
                      <QrCode className="h-4 w-4 text-slate-600" />
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleStartEdit(portal)}
                      title="Edit Settings"
                      className="px-2.5"
                    >
                      <Edit3 className="h-4 w-4 text-slate-600" />
                    </Button>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => navigate(`/registrar/applications?portalId=${portal._id || portal.id}`)}
                    className="w-full gap-1.5 text-xs font-bold"
                  >
                    <Users className="h-3.5 w-3.5" />
                    Review Applications ({portal.stats?.pending || 0} pending)
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 ? (
        <div className="pt-2">
          <Pagination page={page} pages={pages} total={total} onChange={setPage} />
        </div>
      ) : null}

      {/* Create Portal Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Student Registration Portal"
        subtitle="Configure a public admissions link for prospective students."
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!form.title.trim()) return toast.error('Enter a title for this intake portal.');
                if (!form.department) return toast.error('Choose a target department.');
                if (!form.program) return toast.error('Choose a target programme.');
                createMutation.mutate(form);
              }}
              loading={createMutation.isPending}
            >
              Publish Intake Portal
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700">Intake Campaign Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Fall 2019 Regular Admissions — Clinical Nursing"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">Department *</label>
              <select
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value, program: '', batch: '' })}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-brand-500 focus:outline-none"
              >
                <option value="">Select Department...</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Programme *</label>
              <select
                value={form.program}
                onChange={(e) => setForm({ ...form, program: e.target.value, batch: '' })}
                disabled={!form.department}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-brand-500 focus:outline-none disabled:bg-slate-100"
              >
                <option value="">Select Programme...</option>
                {availablePrograms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">Target Batch (Optional)</label>
              <select
                value={form.batch}
                onChange={(e) => setForm({ ...form, batch: e.target.value })}
                disabled={!form.program}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-brand-500 focus:outline-none disabled:bg-slate-100"
              >
                <option value="">Auto-assign or choose batch...</option>
                {availableBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Study Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-brand-500 focus:outline-none"
              >
                <option value="regular">Regular</option>
                <option value="extension">Extension</option>
                <option value="evening">Evening</option>
                <option value="weekend">Weekend</option>
                <option value="distance">Distance</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">Opening Date *</label>
              <input
                type="date"
                value={form.opensAt}
                onChange={(e) => setForm({ ...form, opensAt: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-brand-500 focus:outline-none"
              >
              </input>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Closing Date *</label>
              <input
                type="date"
                value={form.closesAt}
                onChange={(e) => setForm({ ...form, closesAt: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-brand-500 focus:outline-none"
              >
              </input>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Max Applications Quota</label>
              <input
                type="number"
                min="10"
                max="5000"
                value={form.maxApplications}
                onChange={(e) => setForm({ ...form, maxApplications: Number(e.target.value) })}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">
              YouTube Tutorial Video URL (Optional)
            </label>
            <input
              type="url"
              value={form.tutorialVideoUrl}
              onChange={(e) => setForm({ ...form, tutorialVideoUrl: e.target.value })}
              placeholder="e.g. https://www.youtube.com/watch?v=dQw4w9WgXcQ"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Prospective students can click "Watch Tutorial" to view step-by-step registration instructions in a modal.
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">
              Admission Instructions & Requirements (Optional)
            </label>
            <textarea
              rows={3}
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              placeholder="State required entrance documents, tuition guidelines, or office contact details..."
              className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
        </div>
      </Modal>

      {/* Edit Portal Modal */}
      {editPortal ? (
        <Modal
          open={Boolean(editPortal)}
          onClose={() => setEditPortal(null)}
          title="Edit Intake Portal Settings"
          subtitle={`Update schedule, video guide, and limits for "${editPortal.title}".`}
          size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditPortal(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  updateMutation.mutate({
                    id: editPortal.id,
                    updates: {
                      title: editPortal.title,
                      status: editPortal.status,
                      opensAt: editPortal.opensAt,
                      closesAt: editPortal.closesAt,
                      maxApplications: editPortal.maxApplications,
                      tutorialVideoUrl: editPortal.tutorialVideoUrl,
                      instructions: editPortal.instructions,
                    },
                  });
                }}
                loading={updateMutation.isPending}
              >
                Save Changes
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700">Campaign Title</label>
              <input
                type="text"
                value={editPortal.title}
                onChange={(e) => setEditPortal({ ...editPortal, title: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Status</label>
                <select
                  value={editPortal.status}
                  onChange={(e) => setEditPortal({ ...editPortal, status: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                >
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Opening Date</label>
                <input
                  type="date"
                  value={editPortal.opensAt}
                  onChange={(e) => setEditPortal({ ...editPortal, opensAt: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Closing Date</label>
                <input
                  type="date"
                  value={editPortal.closesAt}
                  onChange={(e) => setEditPortal({ ...editPortal, closesAt: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Max Applications Quota</label>
              <input
                type="number"
                value={editPortal.maxApplications}
                onChange={(e) => setEditPortal({ ...editPortal, maxApplications: Number(e.target.value) })}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">YouTube Tutorial Video URL</label>
              <input
                type="url"
                value={editPortal.tutorialVideoUrl}
                onChange={(e) => setEditPortal({ ...editPortal, tutorialVideoUrl: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Instructions & Requirements</label>
              <textarea
                rows={3}
                value={editPortal.instructions}
                onChange={(e) => setEditPortal({ ...editPortal, instructions: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>
          </div>
        </Modal>
      ) : null}

      {/* QR Code Sharing Modal */}
      {qrModal.open ? (
        <Modal
          open={qrModal.open}
          onClose={() => setQrModal({ open: false, portal: null, dataUrl: null })}
          title="Share Registration Portal"
          subtitle={qrModal.portal?.title}
          size="sm"
          footer={
            <div className="flex w-full justify-between gap-2">
              <Button variant="outline" onClick={() => setQrModal({ open: false, portal: null, dataUrl: null })}>
                Close
              </Button>
              <Button onClick={handleDownloadQr} className="gap-1.5">
                <Download className="h-4 w-4" /> Download QR
              </Button>
            </div>
          }
        >
          <div className="space-y-4 text-center">
            {qrModal.dataUrl ? (
              <div className="mx-auto flex w-fit items-center justify-center rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <img src={qrModal.dataUrl} alt="Portal QR Code" className="h-56 w-56" />
              </div>
            ) : null}

            <div className="rounded-xl bg-slate-50 p-3 text-xs break-all font-mono text-slate-600">
              {window.location.origin}/register/{qrModal.portal?.portalId}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopyLink(qrModal.portal)}
              className="w-full gap-1.5 text-xs"
            >
              <Copy className="h-3.5 w-3.5" /> Copy Public Registration URL
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
