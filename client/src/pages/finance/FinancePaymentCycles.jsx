import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CalendarRange,
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
  Printer,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import { api, errorMessage } from '../../lib/api';
import { printPaymentReceiptVoucher } from '../../lib/printVoucher';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/StatePanel';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { ETH_MONTHS, formatEthiopian, toEthiopian, fromEthiopian } from '../../lib/ethiopianDate';

const STATUS_TONES = {
  draft: 'neutral',
  open: 'brand',
  closed: 'slate',
  cancelled: 'rose',
};

export default function FinancePaymentCycles() {
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [page, setPage] = useState(1);

  // Cascading Academic Structure Data
  const { data: structureData } = useQuery({
    queryKey: ['academic-structure'],
    queryFn: async () => {
      try {
        return (await api.get('/finance/academic-structure')).data;
      } catch {
        return (await api.get('/registrar/academic-structure')).data;
      }
    },
  });

  const departments = structureData?.departments || [];
  const academicYears = structureData?.academicYears || [];
  const programs = useMemo(() => {
    if (!departmentFilter) return structureData?.programs || [];
    return (structureData?.programs || []).filter(
      (p) => String(p.department?._id || p.department) === departmentFilter
    );
  }, [structureData?.programs, departmentFilter]);

  const batches = useMemo(() => {
    let list = structureData?.batches || [];
    if (programFilter) {
      list = list.filter((b) => String(b.program?._id || b.program) === programFilter);
    }
    const seen = new Set();
    const result = [];
    for (const b of list) {
      const id = String(b._id || b.id || '');
      const key = `${b.code || ''}-${b.name || ''}`.trim().toLowerCase() || id;
      if (!seen.has(id) && !seen.has(key) && (b.status === 'active' || !b.status)) {
        seen.add(id);
        seen.add(key);
        result.push(b);
      }
    }
    return result;
  }, [structureData?.batches, programFilter]);

  // Detail Modal & Tabs
  const [selectedCycleId, setSelectedCycleId] = useState(null);
  const [detailTab, setDetailTab] = useState('overview'); // 'overview' | 'students' | 'submissions' | 'settings'

  // Create Cycle Modal State
  const curEthDate = useMemo(() => toEthiopian(new Date()), []);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: 'Tikimt 2019',
    ethYear: 2019,
    ethMonth: 2,
    openDay: 25,
    dueEthYear: 2019,
    dueEthMonth: 2,
    dueDay: 30,
    amountEtb: '1500',
    targetAll: true,
  });
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Bulk Create modal state — one cycle per selected Ethiopian month (same year/targets)
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkForm, setBulkForm] = useState({
    ethYear: 2019,
    months: [1], // Meskerem pre-selected
    openDay: 25,
    dueDay: 30,
    amountEtb: '1500',
    targetAll: false,
    departments: [],
    autoOpen: true,
  });
  const toggleBulkMonth = (m) => {
    setBulkForm((f) => ({
      ...f,
      months: f.months.includes(m) ? f.months.filter((x) => x !== m) : [...f.months, m],
    }));
  };
  const toggleBulkDepartment = (id) => {
    setBulkForm((f) => ({
      ...f,
      departments: f.departments.includes(id) ? f.departments.filter((x) => x !== id) : [...f.departments, id],
    }));
  };
  const [showGlobalTutorialModal, setShowGlobalTutorialModal] = useState(false);
  const [globalTutorialInput, setGlobalTutorialInput] = useState('');
  const [savingTutorial, setSavingTutorial] = useState(false);

  // Fetch global finance settings for default amounts and tutorial link
  const { data: financeSettings } = useQuery({
    queryKey: ['finance', 'settings'],
    queryFn: async () => (await api.get('/finance/settings')).data?.finance,
  });

  const handleOpenGlobalTutorial = () => {
    setGlobalTutorialInput(financeSettings?.tutorialVideoUrl || '');
    setShowGlobalTutorialModal(true);
  };

  const handleSaveGlobalTutorial = async (e) => {
    e.preventDefault();
    setSavingTutorial(true);
    try {
      await api.put('/finance/settings', { tutorialVideoUrl: globalTutorialInput.trim() });
      queryClient.invalidateQueries({ queryKey: ['finance', 'settings'] });
      toast.success('Global YouTube tutorial embed link updated for all monthly payment cycles!');
      setShowGlobalTutorialModal(false);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save tutorial link'));
    } finally {
      setSavingTutorial(false);
    }
  };

  // Action modals
  const [qrModalCycle, setQrModalCycle] = useState(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);

  // Copy feedback
  const [copiedId, setCopiedId] = useState(null);

  // Students tab: live search across Student ID / full name + paid-receipt detail modal
  const [studentSearch, setStudentSearch] = useState('');
  const [studentBatchFilter, setStudentBatchFilter] = useState('');
  const [studentProgrammeFilter, setStudentProgrammeFilter] = useState('');
  const [studentSort, setStudentSort] = useState('paidFirst'); // paidFirst | newest | oldest
  const [paidDetail, setPaidDetail] = useState(null);

  // 1. Fetch Cycles List with Academic Year / Month / Status Filters
  const { data: cyclesData, isLoading, refetch } = useQuery({
    queryKey: [
      'finance',
      'cycles',
      {
        status: statusFilter,
        ethYear: yearFilter,
        ethMonth: monthFilter,
        departmentId: departmentFilter,
        programId: programFilter,
        search: searchFilter,
        page,
      },
    ],
    queryFn: async () => {
      const res = await api.get('/finance/cycles', {
        params: {
          status: statusFilter || undefined,
          ethYear: yearFilter || undefined,
          ethMonth: monthFilter || undefined,
          departmentId: departmentFilter || undefined,
          programId: programFilter || undefined,
          search: searchFilter || undefined,
          page,
          limit: 15,
        },
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

  // Students tab filters: unique batches & programmes from loaded charges, plus sorted/searched list
  const chargeBatches = useMemo(
    () => [...new Set((cycleChargesData || []).map((c) => c.batch).filter(Boolean))].sort(),
    [cycleChargesData]
  );
  const chargeProgrammes = useMemo(
    () => [...new Set((cycleChargesData || []).map((c) => c.programme).filter(Boolean))].sort(),
    [cycleChargesData]
  );
  const filteredCharges = useMemo(() => {
    const list = cycleChargesData || [];
    const q = studentSearch.trim().toLowerCase();
    const result = list.filter(
      (c) =>
        (!q ||
          String(c.studentId || '').toLowerCase().includes(q) ||
          String(c.studentName || '').toLowerCase().includes(q)) &&
        (!studentBatchFilter || c.batch === studentBatchFilter) &&
        (!studentProgrammeFilter || c.programme === studentProgrammeFilter)
    );
    result.sort((a, b) => {
      const aPaid = a.status === 'paid' ? 1 : 0;
      const bPaid = b.status === 'paid' ? 1 : 0;
      if (studentSort === 'paidFirst') {
        // Paid students first — ordered by payment date & time (most recent on top),
        // then unpaid charges by their due date (soonest due on top).
        if (aPaid !== bPaid) return bPaid - aPaid;
        if (aPaid) {
          const aPay = new Date(a.paidAt || a.updatedAt || 0).getTime();
          const bPay = new Date(b.paidAt || b.updatedAt || 0).getTime();
          return bPay - aPay;
        }
        const aDue = new Date(a.dueAt || 0).getTime();
        const bDue = new Date(b.dueAt || 0).getTime();
        return aDue - bDue;
      }
      const aT = new Date(a.createdAt || 0).getTime();
      const bT = new Date(b.createdAt || 0).getTime();
      return studentSort === 'newest' ? bT - aT : aT - bT;
    });
    return result;
  }, [cycleChargesData, studentSearch, studentBatchFilter, studentProgrammeFilter, studentSort]);

  // 4. Create Cycle Mutation
  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const amountSantim = Math.round(parseFloat(payload.amountEtb) * 100);
      const openDate = fromEthiopian(Number(payload.ethYear), Number(payload.ethMonth), Number(payload.openDay) || 25);
      const dueYear = Number(payload.dueEthYear) || Number(payload.ethYear);
      const dueMonth = Number(payload.dueEthMonth) || Number(payload.ethMonth);
      const dueDay = Number(payload.dueDay) || 30;
      const dueDate = fromEthiopian(dueYear, dueMonth, dueDay);

      const res = await api.post('/finance/cycles', {
        title: payload.title,
        ethYear: Number(payload.ethYear),
        ethMonth: Number(payload.ethMonth),
        opensAt: openDate ? openDate.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        dueAt: dueDate ? dueDate.toISOString().slice(0, 10) : new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
        amount: amountSantim,
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

  // 4b. Bulk Create Cycles Mutation — one cycle per selected month, per-month dates
  const bulkCreateMutation = useMutation({
    mutationFn: async () => {
      const yr = Number(bulkForm.ethYear);
      const months = bulkForm.months.map(Number).sort((a, b) => a - b);
      const amountSantim = Math.round(parseFloat(bulkForm.amountEtb) * 100);
      const openDay = Number(bulkForm.openDay) || 1;
      const dueDay = Number(bulkForm.dueDay) || 5;
      // Same open/close day for every selected month, converted month by month.
      const opensDates = months.map((m) => {
        const d = fromEthiopian(yr, m, openDay);
        return d ? d.toISOString().slice(0, 10) : undefined;
      });
      const dueDates = months.map((m) => {
        const d = fromEthiopian(yr, m, dueDay);
        return d ? d.toISOString().slice(0, 10) : undefined;
      });
      const res = await api.post('/finance/cycles/bulk', {
        ethYear: yr,
        ethMonths: months,
        opensDates,
        dueDates,
        amount: amountSantim,
        targets: {
          all: bulkForm.targetAll,
          departments: bulkForm.targetAll ? [] : bulkForm.departments,
        },
        autoOpen: bulkForm.autoOpen,
      });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Bulk cycles created.');
      setShowBulkModal(false);
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const res = await api.delete('/finance/cycles', {
        data: { confirm: 'DELETE_ALL_CYCLES_AND_PAYMENTS' },
      });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data?.message || 'All payment cycles and records deleted.');
      setShowDeleteAllModal(false);
      setDeleteConfirmText('');
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to delete cycles and records.')),
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

  const getCyclePortalUrl = (cycleOrHash) => {
    if (!cycleOrHash) return '';
    if (typeof cycleOrHash === 'object') {
      const identifier = cycleOrHash.slug || cycleOrHash.portalHash;
      return `${window.location.origin}/monthly-payments/${identifier}`;
    }
    return `${window.location.origin}/monthly-payments/${cycleOrHash}`;
  };

  const handleCopyLink = (cycleOrHash, e) => {
    e?.stopPropagation();
    const url = getCyclePortalUrl(cycleOrHash);
    const idKey = typeof cycleOrHash === 'object' ? (cycleOrHash.slug || cycleOrHash.portalHash) : cycleOrHash;
    navigator.clipboard.writeText(url);
    setCopiedId(idKey);
    toast.success('Public payment portal link copied!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleShowQr = async (cycle, e) => {
    e?.stopPropagation();
    const url = getCyclePortalUrl(cycle);
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="text-rose-600 border-rose-200 hover:bg-rose-50"
              onClick={() => setShowDeleteAllModal(true)}
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete All Cycles</span>
            </Button>
            <Button
              variant="outline"
              onClick={handleOpenGlobalTutorial}
              title="Configure single global tutorial video embed link for all monthly portals"
            >
              <Video className="h-4 w-4 text-brand-600" />
              <span>+ Embed Tutorial Link</span>
            </Button>
            <Button
              onClick={() => {
                // Seed default amount from Finance Settings (stored in santim).
                const preset = financeSettings?.monthlyDefaults?.amount;
                if (preset) {
                  setCreateForm((f) => ({ ...f, amountEtb: (preset / 100).toFixed(2) }));
                }
                setShowCreateModal(true);
              }}
            >
              <Plus className="h-4 w-4" />
              <span>Create Fee Cycle</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const preset = financeSettings?.monthlyDefaults?.amount;
                setBulkForm((f) => ({
                  ...f,
                  ethYear: curEthDate.year,
                  months: [1],
                  amountEtb: preset ? (preset / 100).toFixed(2) : f.amountEtb,
                  autoOpen: true,
                }));
                setShowBulkModal(true);
              }}
              title="Create one cycle per selected month in a single batch"
            >
              <CalendarRange className="h-4 w-4" />
              <span>Bulk Create</span>
            </Button>
          </div>
        }
      />

      {/* Filter Bar: Academic Year, Month, Status, Department */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex flex-wrap items-center gap-1">
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
                {st || 'All Statuses'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {(departmentFilter || programFilter || yearFilter || monthFilter || searchFilter || statusFilter) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDepartmentFilter('');
                  setProgramFilter('');
                  setYearFilter('');
                  setMonthFilter('');
                  setSearchFilter('');
                  setStatusFilter('');
                  setPage(1);
                }}
              >
                Reset Filters
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh</span>
            </Button>
          </div>
        </div>

        {/* Dropdowns: Academic Year First, then Month, Department, Programme, Search */}
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
              Academic Year (EC)
            </label>
            <select
              value={yearFilter}
              onChange={(e) => {
                setYearFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All Academic Years</option>
              {academicYears.map((ay) => {
                const match = ay.label?.match(/\b(20\d\d)\b/);
                const yr = match ? match[1] : (ay.startDate ? String(new Date(ay.startDate).getFullYear()) : String(ay.year || ''));
                return (
                  <option key={ay._id || ay.id} value={yr}>
                    {ay.label || `${yr} E.C.`}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Ethiopian Month
            </label>
            <select
              value={monthFilter}
              onChange={(e) => {
                setMonthFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All 13 Months</option>
              {ETH_MONTHS.map((name, idx) => (
                <option key={name} value={idx + 1}>
                  {idx + 1}. {name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Department
            </label>
            <select
              value={departmentFilter}
              onChange={(e) => {
                setDepartmentFilter(e.target.value);
                setProgramFilter('');
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d._id || d.id} value={d._id || d.id}>
                  {d.name || d.code}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Programme
            </label>
            <select
              value={programFilter}
              onChange={(e) => {
                setProgramFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All Programmes</option>
              {programs.map((p) => (
                <option key={p._id || p.id} value={p._id || p.id}>
                  {p.name || p.code}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Search / Student ID
            </label>
            <input
              type="text"
              placeholder="Title or Student ID..."
              value={searchFilter}
              onChange={(e) => {
                setSearchFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
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
                              onClick={(e) => handleCopyLink(cycle, e)}
                              title="Copy Student Link"
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                            >
                              {copiedId === (cycle.slug || cycle.portalHash) ? (
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
                              href={`/monthly-payments/${cycle.slug || cycle.portalHash}`}
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
                Ethiopian Month (Current & Upcoming)
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
                {ETH_MONTHS.map((m, idx) => ({ name: m, monthNum: idx + 1 }))
                  .filter((item) => Number(createForm.ethYear) > curEthDate.year || item.monthNum >= curEthDate.month)
                  .map((item) => (
                    <option key={item.name} value={item.monthNum}>
                      {item.monthNum}. {item.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Academic Year (EC)
              </label>
              <select
                value={createForm.ethYear}
                onChange={(e) => {
                  const yr = Number(e.target.value);
                  const m = createForm.ethMonth;
                  setCreateForm({
                    ...createForm,
                    ethYear: yr,
                    title: `${ETH_MONTHS[m - 1] || 'Month'} ${yr}`,
                  });
                }}
                className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
                required
              >
                {academicYears.length > 0 ? (
                  academicYears.map((ay) => {
                    const match = ay.label?.match(/\b(20\d\d)\b/);
                    const yr = match ? Number(match[1]) : curEthDate.year;
                    return (
                      <option key={ay._id || ay.id} value={yr}>
                        {ay.label || `${yr} E.C.`}
                      </option>
                    );
                  })
                ) : (
                  <option value={curEthDate.year}>{curEthDate.year} E.C.</option>
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Opening Day (1 - 30)
              </label>
              <div className="relative mt-1">
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={createForm.openDay}
                  onChange={(e) => setCreateForm({ ...createForm, openDay: Number(e.target.value) })}
                  className="block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
                  placeholder="25"
                  required
                />
                <span className="absolute right-3 top-2 text-xs font-semibold text-slate-400">
                  {ETH_MONTHS[createForm.ethMonth - 1]}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Opens: {ETH_MONTHS[createForm.ethMonth - 1]} {createForm.openDay}, {createForm.ethYear} E.C.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Due Month & Closing Day (1 - 30)
              </label>
              <div className="grid grid-cols-2 gap-1.5 mt-1">
                <select
                  value={createForm.dueEthMonth || createForm.ethMonth}
                  onChange={(e) => {
                    const dm = Number(e.target.value);
                    setCreateForm({
                      ...createForm,
                      dueEthMonth: dm,
                      dueEthYear: dm < createForm.ethMonth ? createForm.ethYear + 1 : createForm.ethYear,
                    });
                  }}
                  className="block w-full rounded-xl border border-slate-200 px-2 py-2 text-xs text-slate-900 focus:border-brand-500 focus:outline-none"
                >
                  {ETH_MONTHS.map((m, idx) => (
                    <option key={m} value={idx + 1}>
                      {idx + 1}. {m}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={createForm.dueDay}
                  onChange={(e) => setCreateForm({ ...createForm, dueDay: Number(e.target.value) })}
                  className="block w-full rounded-xl border border-slate-200 px-2 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
                  placeholder="30"
                  required
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Closes: {ETH_MONTHS[(createForm.dueEthMonth || createForm.ethMonth) - 1]} {createForm.dueDay}, {createForm.dueEthYear || createForm.ethYear} E.C.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 space-y-1.5 text-xs text-amber-900">
            <p className="font-bold uppercase tracking-wider text-[11px] text-amber-800">
              Automated Overdue Penalty & Portal Persistence
            </p>
            <p className="leading-relaxed text-[11px]">
              After Due Day (Day {createForm.dueDay}), the fee portal remains open indefinitely until explicitly closed. Late payers automatically incur +20 ETB on Day 1, doubling daily up to Day 5 (+320 ETB), and +50 ETB/day thereafter.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
              Base Monthly Fee Amount (ETB)
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

      {/* BULK CREATE CYCLES MODAL */}
      <Modal
        open={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        title="Bulk Create Monthly Cycles"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            bulkCreateMutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-3 text-[11px] leading-relaxed text-brand-900">
            Creates one monthly fee cycle per selected Ethiopian month — all with the same amount and target students. Months that already have an active cycle are skipped automatically.
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Year (EC)
              </label>
              <input
                type="number"
                value={bulkForm.ethYear}
                onChange={(e) => setBulkForm({ ...bulkForm, ethYear: e.target.value })}
                className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Opens Day
              </label>
              <input
                type="number"
                min="1"
                max="30"
                value={bulkForm.openDay}
                onChange={(e) => setBulkForm({ ...bulkForm, openDay: e.target.value })}
                className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Due Day
              </label>
              <input
                type="number"
                min="1"
                max="30"
                value={bulkForm.dueDay}
                onChange={(e) => setBulkForm({ ...bulkForm, dueDay: e.target.value })}
                className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
                required
              />
            </div>
          </div>
          <p className="-mt-2 text-[11px] text-slate-500">
            Due dates: {bulkForm.months.length
              ? bulkForm.months.map((m) => `${ETH_MONTHS[m - 1] || 'Month'} ${bulkForm.dueDay}`).join(', ')
              : '— select months below'}
          </p>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Months ({bulkForm.months.length} selected)
            </label>
            <div className="grid grid-cols-4 gap-1.5 rounded-xl border border-slate-200 p-2.5">
              {ETH_MONTHS.map((name, idx) => (
                <label
                  key={name}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-1.5 py-1 text-[11px] font-medium transition ${
                    bulkForm.months.includes(idx + 1)
                      ? 'bg-brand-50 text-brand-800'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={bulkForm.months.includes(idx + 1)}
                    onChange={() => toggleBulkMonth(idx + 1)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  {idx + 1}. {name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
              Base Monthly Fee Amount (ETB)
            </label>
            <input
              type="number"
              step="0.01"
              value={bulkForm.amountEtb}
              onChange={(e) => setBulkForm({ ...bulkForm, amountEtb: e.target.value })}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-600">
              Target Students
            </label>
            <label className="flex items-center gap-2 rounded-lg px-1 py-1 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={bulkForm.targetAll}
                onChange={(e) => setBulkForm({ ...bulkForm, targetAll: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              All active students
            </label>
            {!bulkForm.targetAll && (
              <div className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-slate-200 p-2.5">
                <p className="mb-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Departments
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {departments.map((d) => {
                    const id = String(d._id || d.id || '');
                    return (
                      <label
                        key={id}
                        className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-1.5 py-1 text-[11px] font-medium transition ${
                          bulkForm.departments.includes(id)
                            ? 'bg-brand-50 text-brand-800'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={bulkForm.departments.includes(id)}
                          onChange={() => toggleBulkDepartment(id)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                        {d.name || d.code}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <label className="flex items-start gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={bulkForm.autoOpen}
                onChange={(e) => setBulkForm({ ...bulkForm, autoOpen: e.target.checked })}
                className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span>
                <strong>Open immediately &amp; generate student charges.</strong>{' '}
                If the due day is already past, targeted students become <strong>overdue on the spot</strong> — late fees and document holds apply from day one.
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" type="button" onClick={() => setShowBulkModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                bulkCreateMutation.isPending ||
                bulkForm.months.length === 0 ||
                (!bulkForm.targetAll && bulkForm.departments.length === 0) ||
                !bulkForm.amountEtb
              }
            >
              {bulkCreateMutation.isPending
                ? 'Creating...'
                : `Create ${bulkForm.months.length} Cycle(s)`}
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
              onClick={() => handleCopyLink(qrModalCycle)}
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
                        {`${window.location.origin}/monthly-payments/${detailData.slug || detailData.portalHash}`}
                      </span>
                      <Button
                        size="sm"
                        onClick={() => handleCopyLink(detailData)}
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

                {/* Embedded Tutorial Video Preview */}
                {detailData.tutorialVideoUrl && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                        <Video className="h-4 w-4 text-red-600" />
                        <span>Embedded Tutorial Video Link</span>
                      </div>
                      <a
                        href={detailData.tutorialVideoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-600 hover:underline flex items-center gap-1 text-[11px]"
                      >
                        <span>Open Video</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-slate-500 truncate">{detailData.tutorialVideoUrl}</p>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: STUDENTS / CHARGES */}
            {detailTab === 'students' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">
                    Showing charges generated for this cycle. Paid rows are clickable.
                  </p>
                  <div className="flex items-center gap-2">
                    <select
                      value={studentSort}
                      onChange={(e) => setStudentSort(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="paidFirst">Paid students first</option>
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder="Search Student ID or full name..."
                      className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <select
                    value={studentBatchFilter}
                    onChange={(e) => setStudentBatchFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">All Batches</option>
                    {chargeBatches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                  <select
                    value={studentProgrammeFilter}
                    onChange={(e) => setStudentProgrammeFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">All Programmes</option>
                    {chargeProgrammes.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-100">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 sticky top-0 text-[10px] font-semibold uppercase text-slate-400">
                      <tr>
                        <th className="p-2.5">Student</th>
                        <th className="p-2.5">Programme</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5">Due / Paid</th>
                        <th className="p-2.5">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredCharges.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-xs text-slate-400">
                            No students match the current filters.
                          </td>
                        </tr>
                      ) : (
                        filteredCharges.map((ch) => {
                          const isPaid = ch.status === 'paid' && ch.payment;
                          return (
                            <tr
                              key={ch.id}
                              onClick={() => {
                                if (isPaid) setPaidDetail(ch);
                              }}
                              className={
                                isPaid
                                  ? 'cursor-pointer transition hover:bg-emerald-50/60'
                                  : ''
                              }
                            >
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
                              <td className="p-2.5">
                                {isPaid ? (
                                  <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-emerald-700">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    {ch.payment.receiptNumber}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-slate-400">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
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

                <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4 text-red-600" />
                    <p className="text-xs font-semibold text-slate-800">Embedded Tutorial Link (YouTube URL)</p>
                  </div>
                  <p className="text-xs text-slate-500">
                    Configure or update the embedded video tutorial shown at the top of the student payment portal for this cycle.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      defaultValue={detailData.tutorialVideoUrl || ''}
                      id="cycle-tutorial-url-input"
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="flex-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-800 font-mono"
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        const val = document.getElementById('cycle-tutorial-url-input')?.value || '';
                        api.put(`/finance/cycles/${detailData._id || detailData.id}`, { tutorialVideoUrl: val.trim() })
                          .then(() => {
                            toast.success('Tutorial video URL updated');
                            queryClient.invalidateQueries({ queryKey: ['finance'] });
                          })
                          .catch((err) => toast.error(errorMessage(err)));
                      }}
                    >
                      Save Link
                    </Button>
                  </div>
                </div>

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

      {/* PAID STUDENT RECEIPT DETAIL MODAL */}
      <Modal
        open={Boolean(paidDetail)}
        onClose={() => setPaidDetail(null)}
        title="Paid Student Receipt Detail"
        size="md"
      >
        {paidDetail && paidDetail.payment ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
              <p className="mt-2 text-sm font-bold text-slate-900">Payment Confirmed</p>
              <p className="text-xs text-slate-500">
                Recorded in the college fee register on {formatEthiopian(paidDetail.payment.paidAt)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-slate-100 bg-white p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Student Name</p>
                <p className="mt-0.5 font-semibold text-slate-800">{paidDetail.studentName}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Student ID</p>
                <p className="mt-0.5 font-mono font-semibold text-slate-800">{paidDetail.studentId}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Receipt Number</p>
                <p className="mt-0.5 font-mono font-semibold text-emerald-700">{paidDetail.payment.receiptNumber}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Amount</p>
                <p className="mt-0.5 font-mono font-semibold text-slate-800">
                  {(paidDetail.amountDue / 100).toFixed(2)} ETB
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Payment Method</p>
                <p className="mt-0.5 font-semibold text-slate-800">{paidDetail.payment.method}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Bank Reference</p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-800 break-all">
                  {paidDetail.payment.bankReference || '—'}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  printPaymentReceiptVoucher({
                    receiptNumber: paidDetail.payment.receiptNumber,
                    status: paidDetail.payment.status || 'confirmed',
                    studentName: paidDetail.studentName,
                    studentId: paidDetail.studentId,
                    programme: paidDetail.programme || '',
                    cycleTitle: paidDetail.cycleTitle || paidDetail.cycle?.title || 'Fee',
                    amountEtb: (paidDetail.amountDue / 100).toFixed(2),
                    method: paidDetail.payment.method,
                    bankReference: paidDetail.payment.bankReference,
                    payerName: paidDetail.studentName,
                    paidAt: paidDetail.payment.paidAt,
                    recordedBy: paidDetail.recordedBy?.name || paidDetail.payment.recordedBy?.name || '',
                  })
                }
              >
                <Printer className="h-4 w-4" />
                <span>Print Receipt</span>
              </Button>
              {paidDetail?.student?._id && (
                <Link
                  to={`/accountant/collections/students/${paidDetail.student._id}`}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>Student Finance Profile</span>
                </Link>
              )}
              <Button size="sm" onClick={() => setPaidDetail(null)}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-500">
            Loading receipt detail...
          </div>
        )}
      </Modal>

      {/* DELETE ALL CYCLES MODAL */}
      <Modal
        open={showDeleteAllModal}
        onClose={() => {
          setShowDeleteAllModal(false);
          setDeleteConfirmText('');
        }}
        title="Delete All Payment Cycles & Records"
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 space-y-1">
            <p className="font-bold uppercase tracking-wider text-rose-900">
              Warning: Permanent Data Deletion
            </p>
            <p>
              This will permanently delete all monthly payment cycles, generated student charges, payment records, attempts, waivers, and deadline extensions.
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Type <span className="font-mono font-bold text-rose-600">DELETE</span> to confirm:
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 font-mono focus:border-rose-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setShowDeleteAllModal(false);
                setDeleteConfirmText('');
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-rose-600 text-white hover:bg-rose-700"
              disabled={deleteConfirmText !== 'DELETE' || deleteAllMutation.isPending}
              onClick={() => deleteAllMutation.mutate()}
            >
              {deleteAllMutation.isPending ? 'Deleting...' : 'Delete Everything'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* GLOBAL EMBED TUTORIAL MODAL */}
      <Modal
        open={showGlobalTutorialModal}
        onClose={() => setShowGlobalTutorialModal(false)}
        title="Embed Tutorial Video Link (All Months)"
        size="md"
      >
        <form onSubmit={handleSaveGlobalTutorial} className="space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            Attach an official tutorial YouTube video once. This embed link is automatically shared across all monthly fee portals (e.g. Tikimt, Hidar, etc.). Students can watch how to pay or skip it without background audio playback.
          </p>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
              YouTube Video Embed / Watch URL
            </label>
            <input
              type="url"
              value={globalTutorialInput}
              onChange={(e) => setGlobalTutorialInput(e.target.value)}
              placeholder="e.g. https://www.youtube.com/watch?v=VIDEO_ID or https://youtu.be/VIDEO_ID"
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
              autoFocus
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Accepts standard YouTube links, short links, or embed links.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => setShowGlobalTutorialModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={savingTutorial}
              className="bg-brand-600 text-white hover:bg-brand-700"
            >
              {savingTutorial ? 'Saving...' : 'Save Global Tutorial Link'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
