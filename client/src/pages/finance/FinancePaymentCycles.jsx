import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Plus,
  Copy,
  Check,
  ExternalLink,
  QrCode,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Play,
  Square,
  RefreshCw,
  Ban,
  Trash2,
  Calendar,
  DollarSign,
  Search,
  Filter,
  ArrowRight,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import { api, errorMessage } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/StatePanel';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { ETH_MONTHS, formatEthiopian } from '../../lib/ethiopianDate';

const STATUS_TONES = {
  draft: 'neutral',
  open: 'brand',
  closed: 'slate',
  cancelled: 'rose',
};

export default function FinancePaymentCycles() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  // Detail Modal & Tabs
  const [selectedCycleId, setSelectedCycleId] = useState(null);
  const [detailTab, setDetailTab] = useState('overview'); // 'overview' | 'students' | 'submissions' | 'settings'

  // Create Cycle Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: 'Tikimt 2019',
    ethYear: 2019,
    ethMonth: 2,
    opensAt: new Date().toISOString().slice(0, 10),
    dueAt: new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10),
    amountEtb: '1500',
    accountNumber: '1000123456789',
    holderName: 'HARAMAYA HEALTH SCIENCE COLLEGE',
    bank: 'Commercial Bank of Ethiopia',
    targetAll: true,
  });

  // Action modals
  const [qrModalCycle, setQrModalCycle] = useState(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);

  // Copy feedback
  const [copiedId, setCopiedId] = useState(null);

  // 1. Fetch Cycles List
  const { data: cyclesData, isLoading, refetch } = useQuery({
    queryKey: ['finance', 'cycles', { status: statusFilter, page }],
    queryFn: async () => {
      const res = await api.get('/finance/cycles', {
        params: { status: statusFilter || undefined, page, limit: 15 },
      });
      return res.data;
    },
  });

  // 2. Fetch Selected Cycle Detail
  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['finance', 'cycle', selectedCycleId],
    queryFn: async () => {
      const res = await api.get(`/finance/cycles/${selectedCycleId}`);
      return res.data?.cycle;
    },
    enabled: Boolean(selectedCycleId),
  });

  // 3. Fetch Selected Cycle Charges / Students
  const { data: cycleChargesData } = useQuery({
    queryKey: ['finance', 'cycle-charges', selectedCycleId],
    queryFn: async () => {
      const res = await api.get('/finance/collections', {
        params: { cycleId: selectedCycleId, limit: 100 },
      });
      return res.data?.charges || [];
    },
    enabled: Boolean(selectedCycleId && detailTab === 'students'),
  });

  // 4. Create Cycle Mutation
  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const amountSantim = Math.round(parseFloat(payload.amountEtb) * 100);
      const res = await api.post('/finance/cycles', {
        title: payload.title,
        ethYear: Number(payload.ethYear),
        ethMonth: Number(payload.ethMonth),
        opensAt: payload.opensAt,
        dueAt: payload.dueAt,
        amount: amountSantim,
        bank: {
          bank: payload.bank,
          accountNumber: payload.accountNumber,
          holderName: payload.holderName,
        },
        targets: { all: payload.targetAll },
      });
      return res.data;
    },
    onSuccess: (res) => {
      toast.success('Payment cycle created as draft.');
      setShowCreateModal(false);
      queryClient.invalidateQueries({ queryKey: ['finance', 'cycles'] });
      setSelectedCycleId(res.cycle?._id || res.cycle?.id);
      setDetailTab('overview');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // 5. Open Cycle Mutation
  const openMutation = useMutation({
    mutationFn: async (cycleId) => {
      const res = await api.post(`/finance/cycles/${cycleId}/open`);
      return res.data;
    },
    onSuccess: (res) => {
      toast.success(`Cycle opened! Generated ${res.chargesGenerated} student charges.`);
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // 6. Close / Reopen / Cancel
  const closeMutation = useMutation({
    mutationFn: async (cycleId) => {
      const res = await api.post(`/finance/cycles/${cycleId}/close`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Cycle closed. Public portal link is now disabled.');
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const reopenMutation = useMutation({
    mutationFn: async ({ cycleId, newDueAt }) => {
      const res = await api.post(`/finance/cycles/${cycleId}/reopen`, { newDueAt });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Cycle reopened with updated due date.');
      setShowReopenModal(false);
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ cycleId, reason }) => {
      const res = await api.post(`/finance/cycles/${cycleId}/cancel`, { reason });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Payment cycle cancelled.');
      setShowCancelModal(false);
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const handleCopyLink = (portalHash, e) => {
    e?.stopPropagation();
    const url = `${window.location.origin}/monthly-payments/${portalHash}`;
    navigator.clipboard.writeText(url);
    setCopiedId(portalHash);
    toast.success('Public payment portal link copied!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleShowQr = async (cycle, e) => {
    e?.stopPropagation();
    const url = `${window.location.origin}/monthly-payments/${cycle.portalHash}`;
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 });
      setQrCodeDataUrl(dataUrl);
      setQrModalCycle(cycle);
    } catch {
      toast.error('Failed to generate QR code');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monthly Payment Cycles"
        subtitle="Schedule monthly student fee collections, configure CBE target accounts, and manage automated payment links."
        icon={CalendarDays}
        actions={
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" />
            <span>Create Fee Cycle</span>
          </Button>
        }
      />

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-1">
          {['', 'draft', 'open', 'closed', 'cancelled'].map((st) => (
            <button
              key={st}
              onClick={() => {
                setStatusFilter(st);
                setPage(1);
              }}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold capitalize transition ${
                statusFilter === st
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {st || 'All Cycles'}
            </button>
          ))}
        </div>

        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Cycles Table Card */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="p-6">
              <SkeletonRows rows={5} />
            </div>
          ) : !cyclesData?.cycles?.length ? (
            <div className="p-10">
              <EmptyState
                icon={CalendarDays}
                title="No payment cycles found"
                message="Create your first monthly payment cycle to begin collecting fees from students."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-3.5 pl-6 pr-4">Cycle & Month</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Fee Per Student</th>
                    <th className="py-3.5 px-4">Progress / Settled</th>
                    <th className="py-3.5 px-4">Due Date</th>
                    <th className="py-3.5 px-4 text-center">Portal Link & QR</th>
                    <th className="py-3.5 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cyclesData.cycles.map((cycle) => (
                    <tr
                      key={cycle.id}
                      onClick={() => {
                        setSelectedCycleId(cycle.id);
                        setDetailTab('overview');
                      }}
                      className="cursor-pointer transition hover:bg-slate-50/80"
                    >
                      <td className="py-4 pl-6 pr-4">
                        <p className="font-semibold text-slate-800">{cycle.title}</p>
                        <p className="text-xs text-slate-400">
                          {cycle.monthName} {cycle.ethYear} (EC)
                        </p>
                      </td>

                      <td className="py-4 px-4">
                        <Badge tone={STATUS_TONES[cycle.status] || 'neutral'}>
                          {cycle.status.toUpperCase()}
                        </Badge>
                      </td>

                      <td className="py-4 px-4 font-mono font-medium text-slate-800">
                        {(cycle.amount / 100).toFixed(2)} ETB
                      </td>

                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          <p className="font-mono text-xs font-semibold text-slate-800">
                            {cycle.collectedEtb} ETB
                            <span className="ml-1 text-[11px] font-normal text-slate-400">
                              ({cycle.paidCount} / {cycle.totalStudents} students)
                            </span>
                          </p>
                          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{
                                width: `${
                                  cycle.totalStudents > 0
                                    ? Math.min(100, (cycle.paidCount / cycle.totalStudents) * 100)
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4 text-xs text-slate-600">
                        {formatEthiopian(cycle.dueAt)}
                      </td>

                      <td className="py-4 px-4 text-center">
                        {cycle.status === 'open' ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => handleCopyLink(cycle.portalHash, e)}
                              title="Copy Student Link"
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                            >
                              {copiedId === cycle.portalHash ? (
                                <Check className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleShowQr(cycle, e)}
                              title="Show QR Code"
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                            >
                              <QrCode className="h-4 w-4" />
                            </button>
                            <a
                              href={`/monthly-payments/${cycle.portalHash}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title="Open Portal"
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-4 pr-6 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCycleId(cycle.id);
                            setDetailTab('overview');
                          }}
                        >
                          <span>Manage</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* CREATE CYCLE MODAL */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Monthly Fee Cycle"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate(createForm);
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
              Cycle Title
            </label>
            <input
              type="text"
              value={createForm.title}
              onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Ethiopian Month
              </label>
              <select
                value={createForm.ethMonth}
                onChange={(e) => {
                  const m = Number(e.target.value);
                  setCreateForm({
                    ...createForm,
                    ethMonth: m,
                    title: `${ETH_MONTHS[m - 1] || 'Month'} ${createForm.ethYear}`,
                  });
                }}
                className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
              >
                {ETH_MONTHS.map((m, idx) => (
                  <option key={m} value={idx + 1}>
                    {idx + 1}. {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Ethiopian Year
              </label>
              <input
                type="number"
                value={createForm.ethYear}
                onChange={(e) => setCreateForm({ ...createForm, ethYear: Number(e.target.value) })}
                className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Opening Date (UTC)
              </label>
              <input
                type="date"
                value={createForm.opensAt}
                onChange={(e) => setCreateForm({ ...createForm, opensAt: e.target.value })}
                className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Due Date (UTC)
              </label>
              <input
                type="date"
                value={createForm.dueAt}
                onChange={(e) => setCreateForm({ ...createForm, dueAt: e.target.value })}
                className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
              Amount (ETB)
            </label>
            <input
              type="number"
              step="0.01"
              value={createForm.amountEtb}
              onChange={(e) => setCreateForm({ ...createForm, amountEtb: e.target.value })}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
              required
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              College CBE Bank Details (Target for Verifier)
            </p>
            <div>
              <label className="block text-[11px] font-medium text-slate-600">Bank Name</label>
              <input
                type="text"
                value={createForm.bank}
                onChange={(e) => setCreateForm({ ...createForm, bank: e.target.value })}
                className="mt-0.5 block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600">Account Number</label>
              <input
                type="text"
                value={createForm.accountNumber}
                onChange={(e) => setCreateForm({ ...createForm, accountNumber: e.target.value })}
                className="mt-0.5 block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600">Holder Name</label>
              <input
                type="text"
                value={createForm.holderName}
                onChange={(e) => setCreateForm({ ...createForm, holderName: e.target.value })}
                className="mt-0.5 block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" type="button" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Draft Cycle'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* QR CODE MODAL */}
      <Modal
        open={Boolean(qrModalCycle)}
        onClose={() => setQrModalCycle(null)}
        title="Student Payment QR Code"
      >
        <div className="p-4 text-center">
          <p className="text-sm font-semibold text-slate-800">{qrModalCycle?.title}</p>
          <p className="text-xs text-slate-500">Scan with mobile phone to open direct payment portal</p>
          {qrCodeDataUrl && (
            <img
              src={qrCodeDataUrl}
              alt="Payment QR"
              className="mx-auto mt-4 h-64 w-64 rounded-2xl border border-slate-200 p-2"
            />
          )}
          <div className="mt-4 flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopyLink(qrModalCycle?.portalHash)}
            >
              <Copy className="h-4 w-4" />
              <span>Copy Link</span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* CYCLE DETAIL DRAWER / MODAL */}
      <Modal
        open={Boolean(selectedCycleId)}
        onClose={() => setSelectedCycleId(null)}
        title={detailData ? `${detailData.title} — Details & Management` : 'Cycle Details'}
        size="lg"
      >
        {detailLoading || !detailData ? (
          <div className="py-12 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-600" />
            <p className="mt-2 text-xs text-slate-500">Loading cycle details...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Tabs */}
            <div className="flex border-b border-slate-200">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'students', label: `Students (${detailData.stats?.totalStudents || 0})` },
                { id: 'settings', label: 'Cycle Actions & Settings' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setDetailTab(t.id)}
                  className={`border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
                    detailTab === t.id
                      ? 'border-brand-600 text-brand-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* TAB 1: OVERVIEW */}
            {detailTab === 'overview' && (
              <div className="space-y-5">
                {/* Status Bar */}
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-center gap-2">
                    <Badge tone={STATUS_TONES[detailData.status]}>
                      {detailData.status.toUpperCase()}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      Amount: {(detailData.amount / 100).toFixed(2)} ETB
                    </span>
                  </div>

                  <span className="text-xs text-slate-500">
                    Due: {formatEthiopian(detailData.dueAt)}
                  </span>
                </div>

                {/* Metric Summary */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-slate-100 bg-white p-3 text-center">
                    <p className="text-[11px] text-slate-400">Target Students</p>
                    <p className="mt-0.5 text-lg font-bold text-slate-800">
                      {detailData.stats?.totalStudents || 0}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-white p-3 text-center">
                    <p className="text-[11px] text-emerald-600">Paid & Verified</p>
                    <p className="mt-0.5 text-lg font-bold text-emerald-700">
                      {detailData.stats?.paidCount || 0}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-white p-3 text-center">
                    <p className="text-[11px] text-amber-600">Unpaid</p>
                    <p className="mt-0.5 text-lg font-bold text-amber-700">
                      {detailData.stats?.unpaidCount || 0}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-white p-3 text-center">
                    <p className="text-[11px] text-purple-600">Waived</p>
                    <p className="mt-0.5 text-lg font-bold text-purple-700">
                      {detailData.stats?.waivedCount || 0}
                    </p>
                  </div>
                </div>

                {/* Portal Link Box */}
                {detailData.status === 'open' ? (
                  <div className="rounded-2xl border border-brand-200 bg-brand-50/50 p-4">
                    <p className="text-xs font-semibold text-brand-900">
                      Public Student Payment Portal URL
                    </p>
                    <div className="mt-2 flex items-center justify-between rounded-xl bg-white p-2 border border-brand-100 text-xs">
                      <span className="font-mono text-slate-700 truncate pr-2">
                        {`${window.location.origin}/monthly-payments/${detailData.portalHash}`}
                      </span>
                      <Button
                        size="sm"
                        onClick={() => handleCopyLink(detailData.portalHash)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy</span>
                      </Button>
                    </div>
                  </div>
                ) : detailData.status === 'draft' ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-semibold text-amber-900">
                      Cycle is currently in DRAFT status
                    </p>
                    <p className="mt-1 text-xs text-amber-800">
                      The public payment link is inactive. Click "Open Payment Cycle" to activate the link and generate student charges.
                    </p>
                    <div className="mt-3">
                      <Button
                        size="sm"
                        disabled={openMutation.isPending}
                        onClick={() => openMutation.mutate(detailData._id || detailData.id)}
                      >
                        <Play className="h-4 w-4" />
                        <span>Open Payment Cycle Now</span>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                    This cycle is {detailData.status}. Public portal submissions are disabled.
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: STUDENTS / CHARGES */}
            {detailTab === 'students' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    Showing charges generated for this cycle
                  </p>
                </div>

                <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-100">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 sticky top-0 text-[10px] font-semibold uppercase text-slate-400">
                      <tr>
                        <th className="p-2.5">Student</th>
                        <th className="p-2.5">Programme</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5">Due / Paid</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(cycleChargesData || []).map((ch) => (
                        <tr key={ch.id}>
                          <td className="p-2.5 font-medium text-slate-800">
                            {ch.studentName}
                            <span className="block font-mono text-[10px] text-slate-400">
                              {ch.studentId}
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-600">{ch.programme || '—'}</td>
                          <td className="p-2.5">
                            <Badge
                              tone={
                                ch.status === 'paid'
                                  ? 'emerald'
                                  : ch.isOverdue
                                  ? 'rose'
                                  : ch.status === 'waived'
                                  ? 'purple'
                                  : 'neutral'
                              }
                            >
                              {ch.status.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="p-2.5 text-slate-500">
                            {ch.paidAt
                              ? formatEthiopian(ch.paidAt)
                              : formatEthiopian(ch.dueAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 3: SETTINGS / ACTIONS */}
            {detailTab === 'settings' && (
              <div className="space-y-4">
                {detailData.status === 'open' && (
                  <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                    <p className="text-xs font-semibold text-slate-800">Extend Due Date</p>
                    <p className="text-xs text-slate-500">
                      Extending the cycle due date automatically updates the deadline on all currently unpaid student charges.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={newDueDate}
                        onChange={(e) => setNewDueDate(e.target.value)}
                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs"
                      />
                      <Button
                        size="sm"
                        disabled={!newDueDate}
                        onClick={() => {
                          api.put(`/finance/cycles/${detailData._id || detailData.id}`, { dueAt: newDueDate })
                            .then(() => {
                              toast.success('Due date updated');
                              queryClient.invalidateQueries({ queryKey: ['finance'] });
                            })
                            .catch((err) => toast.error(errorMessage(err)));
                        }}
                      >
                        Update Due Date
                      </Button>
                    </div>

                    <div className="border-t border-slate-100 pt-3 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => closeMutation.mutate(detailData._id || detailData.id)}
                      >
                        <Square className="h-3.5 w-3.5 text-slate-500" />
                        <span>Close Cycle (Deactivate Link)</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-600 hover:bg-rose-50"
                        onClick={() => setShowCancelModal(true)}
                      >
                        <Ban className="h-3.5 w-3.5" />
                        <span>Cancel Cycle</span>
                      </Button>
                    </div>
                  </div>
                )}

                {detailData.status === 'closed' && (
                  <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                    <p className="text-xs font-semibold text-slate-800">Reopen Cycle</p>
                    <p className="text-xs text-slate-500">
                      Reactivating this cycle restores public portal access for unpaid students.
                    </p>
                    <Button
                      size="sm"
                      onClick={() => {
                        setNewDueDate(new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
                        setShowReopenModal(true);
                      }}
                    >
                      <Play className="h-4 w-4" />
                      <span>Reopen Cycle</span>
                    </Button>
                  </div>
                )}

                {detailData.status === 'draft' && (
                  <div className="flex justify-between items-center rounded-2xl border border-slate-200 p-4">
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Delete Draft</p>
                      <p className="text-xs text-slate-400">Soft delete this un-opened draft</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-rose-600 hover:bg-rose-50"
                      onClick={() => {
                        api.delete(`/finance/cycles/${detailData._id || detailData.id}`)
                          .then(() => {
                            toast.success('Draft cycle deleted');
                            setSelectedCycleId(null);
                            queryClient.invalidateQueries({ queryKey: ['finance'] });
                          })
                          .catch((err) => toast.error(errorMessage(err)));
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>Delete</span>
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* REOPEN MODAL */}
      <Modal
        open={showReopenModal}
        onClose={() => setShowReopenModal(false)}
        title="Reopen Payment Cycle"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Set a new due date for unpaid students in this cycle:
          </p>
          <input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            className="block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowReopenModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                reopenMutation.mutate({
                  cycleId: selectedCycleId,
                  newDueAt: newDueDate,
                })
              }
            >
              Confirm Reopen
            </Button>
          </div>
        </div>
      </Modal>

      {/* CANCEL MODAL */}
      <Modal
        open={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Cancel Payment Cycle"
      >
        <div className="space-y-4">
          <p className="text-xs text-rose-600">
            Are you sure you want to cancel this payment cycle? This will permanently mark it cancelled and disable the link.
          </p>
          <textarea
            rows={2}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason for cancellation..."
            className="block w-full rounded-xl border border-slate-200 p-2 text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCancelModal(false)}>
              Back
            </Button>
            <Button
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={() =>
                cancelMutation.mutate({
                  cycleId: selectedCycleId,
                  reason: cancelReason,
                })
              }
            >
              Cancel Cycle
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
