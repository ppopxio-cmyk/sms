import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Gift,
  Award,
  Search,
  RefreshCw,
  RotateCcw,
  User,
  Mail,
  X,
  ChevronRight,
  ShieldCheck,
  CheckSquare,
  Square,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardBody } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/StatePanel';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { formatEthiopian, ETH_MONTHS, toEthiopian } from '../../lib/ethiopianDate';
import AccountantAcademicFilter, { SelectToViewCard } from '../../components/finance/AccountantAcademicFilter';

export default function FinanceWaivers() {
  const queryClient = useQueryClient();

  // Academic Filter (Batch -> Department -> Programme)
  const [selectedBatch, setSelectedBatch] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');
  const [isFilterApplied, setIsFilterApplied] = useState(false);

  const [status, setStatus] = useState('approved');
  const [page, setPage] = useState(1);

  // Revoke state
  const [revokingWaiver, setRevokingWaiver] = useState(null);
  const [revokeReason, setRevokeReason] = useState('');

  // New-waiver wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  // 'waiver' = fee exemption (only UNPAID months), 'scholarship' = sponsor-funded award
  const [wizardMode, setWizardMode] = useState('waiver');
  const [wizardStep, setWizardStep] = useState(1);
  const [studentQuery, setStudentQuery] = useState('');
  const [pickedStudent, setPickedStudent] = useState(null);
  const [selectedEthYear, setSelectedEthYear] = useState('');
  const [selectedCycleIds, setSelectedCycleIds] = useState([]);
  const [wType, setWType] = useState('full');
  const [wAmount, setWAmount] = useState('');
  const [wReason, setWReason] = useState('');
  const [wScholarship, setWScholarship] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [codeRequested, setCodeRequested] = useState(false);

  // Academic years for cycles
  const { data: academicYears = [] } = useQuery({
    queryKey: ['finance', 'academicYears'],
    queryFn: async () => {
      const res = await api.get('/finance/academic-years');
      return res.data?.years || [];
    },
  });

  useEffect(() => {
    if (!selectedEthYear) {
      if (academicYears.length) {
        setSelectedEthYear(String(academicYears[0].ethYear));
      } else {
        setSelectedEthYear(String(toEthiopian(new Date()).year));
      }
    }
  }, [academicYears, selectedEthYear]);

  // Cycles for the selected academic year
  const yearCyclesQuery = useQuery({
    queryKey: ['finance', 'cyclesForWaiver', selectedEthYear],
    queryFn: async () => {
      const res = await api.get('/finance/cycles', {
        params: { ethYear: selectedEthYear, limit: 50 },
      });
      return res.data?.cycles || [];
    },
    enabled: wizardOpen && Boolean(selectedEthYear),
  });

  const handleApplyFilter = () => {
    setIsFilterApplied(true);
    setPage(1);
  };

  const handleResetFilter = () => {
    setSelectedBatch('');
    setSelectedDepartment('');
    setSelectedProgram('');
    setIsFilterApplied(false);
    setPage(1);
  };

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: [
      'finance',
      'waivers',
      { status, batchId: selectedBatch, departmentId: selectedDepartment, programId: selectedProgram, page, isFilterApplied },
    ],
    queryFn: async () => {
      const res = await api.get('/finance/waivers', {
        params: {
          status: status || undefined,
          batchId: selectedBatch || undefined,
          departmentId: selectedDepartment || undefined,
          programId: selectedProgram || undefined,
          page,
          limit: 25,
        },
      });
      return res.data;
    },
    enabled: isFilterApplied,
  });

  // Student search for the wizard
  const studentResults = useQuery({
    queryKey: ['finance', 'studentSearch', studentQuery],
    queryFn: async () => {
      const res = await api.get('/finance/students/search', { params: { q: studentQuery } });
      return res.data?.students || [];
    },
    enabled: wizardOpen && studentQuery.trim().length >= 2,
  });

  // Finance settings (default fee amounts) + picked student's charge ledger.
  const { data: financeSettings } = useQuery({
    queryKey: ['finance', 'settings'],
    queryFn: async () => (await api.get('/finance/settings')).data?.finance,
  });

  const pickedStudentProfile = useQuery({
    queryKey: ['finance', 'waiverStudentProfile', pickedStudent?.id || pickedStudent?._id],
    queryFn: async () => {
      const sid = pickedStudent.id || pickedStudent._id;
      const res = await api.get(`/finance/students/${sid}`);
      return res.data;
    },
    enabled: wizardOpen && Boolean(pickedStudent) && wizardMode === 'waiver',
  });

  // In waiver mode we only ever show the student's UNPAID monthly charges.
  const unpaidCharges = (pickedStudentProfile.data?.charges || []).filter((c) => c.status === 'unpaid');

  const openWizard = (mode) => {
    resetWizard();
    setWizardMode(mode);
    // Seed the default partial/fee amount from Finance Settings (stored in santim).
    const preset = financeSettings?.monthlyDefaults?.amount;
    if (preset) setWAmount((preset / 100).toFixed(2));
    setWizardOpen(true);
  };

  const resetWizard = () => {
    setWizardOpen(false);
    setWizardStep(1);
    setStudentQuery('');
    setPickedStudent(null);
    setSelectedCycleIds([]);
    setWType('full');
    setWAmount('');
    setWReason('');
    setWScholarship('');
    setVerificationCode('');
    setCodeRequested(false);
  };

  const handleSelectAllCycles = () => {
    if (wizardMode === 'waiver') {
      setSelectedCycleIds(unpaidCharges.map((c) => c.cycle?._id));
    } else {
      setSelectedCycleIds((yearCyclesQuery.data || []).map((c) => c._id || c.id));
    }
  };

  const handleClearAllCycles = () => {
    setSelectedCycleIds([]);
  };

  // Auto-computed total waived amount for the current selection.
  const waivedTotalEtb = (() => {
    if (wizardMode === 'waiver') {
      const selectedCharges = unpaidCharges.filter((c) => selectedCycleIds.includes(c.cycle?._id));
      if (wType === 'full') {
        return selectedCharges.reduce((sum, c) => sum + c.amountDue / 100, 0);
      }
      return Number(wAmount || 0) * selectedCharges.length;
    }
    // Scholarship mode: full fee of each picked year cycle.
    const picked = (yearCyclesQuery.data || []).filter((c) => selectedCycleIds.includes(c._id || c.id));
    if (wType === 'full') return picked.reduce((sum, c) => sum + c.amount / 100, 0);
    return Number(wAmount || 0) * picked.length;
  })();

  const toggleCycle = (id) => {
    setSelectedCycleIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // 2FA code request mutation
  const requestCodeMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/finance/waivers/request-code');
      return res.data;
    },
    onSuccess: (data) => {
      setCodeRequested(true);
      toast.success(data.message || 'Verification code sent to your registered accountant email.');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not send verification code.')),
  });

  // Batch waiver mutation
  const batchWaiverMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        studentId: pickedStudent.studentId || pickedStudent._id || pickedStudent.id,
        cycleIds: selectedCycleIds,
        type: wType,
        reason: wReason.trim(),
        scholarshipCollege: wScholarship.trim(),
        verificationCode: verificationCode.trim(),
      };
      if (wType === 'partial') {
        payload.amount = Number(wAmount);
      }
      const res = await api.post('/finance/waivers/batch-apply', payload);
      return res.data;
    },
    onSuccess: (res) => {
      toast.success(res.message || 'Fee waivers successfully granted!');
      resetWizard();
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not grant fee waivers.')),
  });

  const revokeMutation = useMutation({
    mutationFn: async ({ id, reason }) => {
      const res = await api.post(`/finance/waivers/${id}/revoke`, { reason });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Fee waiver revoked. Student charge restored to unpaid.');
      setRevokingWaiver(null);
      setRevokeReason('');
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fee Waivers & Scholarships"
        subtitle="Full and partial fee exemptions, scholarship approvals, and waiver revocation audit trail."
        icon={Gift}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-purple-200 text-purple-700 hover:bg-purple-50"
              onClick={() => openWizard('waiver')}
            >
              <Gift className="h-4 w-4" />
              <span>+ Grant Fee Waiver</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => openWizard('scholarship')}
            >
              <Award className="h-4 w-4" />
              <span>+ Grant Scholarship</span>
            </Button>
          </div>
        }
      />

      {/* Cascading Academic Filter: Batch -> Department -> Programme */}
      <AccountantAcademicFilter
        selectedBatch={selectedBatch}
        setSelectedBatch={setSelectedBatch}
        selectedDepartment={selectedDepartment}
        setSelectedDepartment={setSelectedDepartment}
        selectedProgram={selectedProgram}
        setSelectedProgram={setSelectedProgram}
        isApplied={isFilterApplied}
        onApply={handleApplyFilter}
        onReset={handleResetFilter}
      />

      {!isFilterApplied ? (
        <SelectToViewCard
          title="Select to View Fee Waivers"
          message="Please select a Batch, Department, or Programme above, then click View Records to display student fee waivers."
        />
      ) : (
        <>
          {/* Filter Tabs */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex gap-2">
              {['approved', 'revoked', ''].map((st) => (
                <button
                  key={st || 'all'}
                  onClick={() => {
                    setStatus(st);
                    setPage(1);
                  }}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold capitalize transition ${
                    status === st
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {st ? `${st} Waivers` : 'All Waivers'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-purple-200 text-purple-700 hover:bg-purple-50"
                onClick={() => openWizard('waiver')}
              >
                <Gift className="h-4 w-4" />
                <span>+ Grant Fee Waiver</span>
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => openWizard('scholarship')}
              >
                <Award className="h-4 w-4" />
                <span>+ Grant Scholarship</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </Button>
            </div>
          </div>

          {/* Waivers Table */}
          <Card>
            <CardBody className="p-0">
              {isLoading ? (
                <div className="p-6">
                  <SkeletonRows rows={6} />
                </div>
              ) : !data?.waivers?.length ? (
                <div className="p-10">
                  <EmptyState
                    icon={Gift}
                    title="No waivers found"
                    message={'Use the "+ Grant Fee Waiver" or "+ Grant Scholarship" buttons to grant a student fee exemption for specific months.'}
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        <th className="py-3.5 pl-6 pr-4">Student</th>
                        <th className="py-3.5 px-4">Cycle</th>
                        <th className="py-3.5 px-4">Waived Amount</th>
                        <th className="py-3.5 px-4">Scope</th>
                        <th className="py-3.5 px-4">Reason / Scholarship</th>
                        <th className="py-3.5 px-4">Email</th>
                        <th className="py-3.5 px-4">Date</th>
                        <th className="py-3.5 pr-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.waivers.map((w) => (
                        <tr key={w.id} className="transition hover:bg-slate-50/70">
                          <td className="py-3.5 pl-6 pr-4">
                            <Link
                              to={`/accountant/collections/students/${w.student?._id || w.student}`}
                              className="font-semibold text-slate-800 hover:text-brand-600"
                            >
                              {w.student?.fullName}
                            </Link>
                            <p className="font-mono text-xs text-slate-400">
                              {w.student?.studentId}
                            </p>
                          </td>

                          <td className="py-3.5 px-4 font-medium text-slate-800 text-xs">
                            {w.cycle?.title}
                          </td>

                          <td className="py-3.5 px-4 font-mono font-bold text-purple-700">
                            {w.amountEtb} ETB
                          </td>

                          <td className="py-3.5 px-4">
                            <Badge tone={w.type === 'full' ? 'purple' : 'neutral'}>
                              {w.type === 'full' ? 'FULL (100%)' : 'PARTIAL'}
                            </Badge>
                          </td>

                          <td className="py-3.5 px-4 text-xs text-slate-600 max-w-[220px] truncate" title={w.reason}>
                            {w.reason}
                            {w.scholarshipCollege ? (
                              <p className="text-[11px] font-semibold text-purple-600">🎓 {w.scholarshipCollege}</p>
                            ) : null}
                          </td>

                          <td className="py-3.5 px-4">
                            {w.emailSentAt ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                                <Mail className="h-3.5 w-3.5" /> Sent
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">—</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-xs text-slate-500">
                            {formatEthiopian(w.approvedAt || w.createdAt)}
                          </td>

                          <td className="py-3.5 pr-6 text-right">
                            {w.status === 'approved' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-rose-600 hover:bg-rose-50"
                                onClick={() => {
                                  setRevokingWaiver(w);
                                  setRevokeReason('');
                                }}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                <span>Revoke</span>
                              </Button>
                            )}
                            {w.status === 'revoked' && (
                              <Badge tone="rose">REVOKED</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}

      {/* GRANT FEE WAIVER / SCHOLARSHIP WIZARD */}
      <Modal
        open={wizardOpen}
        onClose={resetWizard}
        title={wizardMode === 'scholarship' ? 'Grant Scholarship' : 'Grant Fee Waiver'}
      >
        <div className="space-y-4">
          {/* Step Indicators */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 text-xs font-semibold">
            <div className={`flex items-center gap-1.5 ${wizardStep === 1 ? 'text-purple-600 font-bold' : pickedStudent ? 'text-emerald-600' : 'text-slate-400'}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${wizardStep === 1 ? 'bg-purple-100 text-purple-700' : pickedStudent ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100'}`}>1</span>
              <span>Find Student</span>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
            <div className={`flex items-center gap-1.5 ${wizardStep === 2 ? 'text-purple-600 font-bold' : selectedCycleIds.length > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${wizardStep === 2 ? 'bg-purple-100 text-purple-700' : selectedCycleIds.length > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100'}`}>2</span>
              <span>Select Months</span>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
            <div className={`flex items-center gap-1.5 ${wizardStep === 3 ? 'text-purple-600 font-bold' : 'text-slate-400'}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${wizardStep === 3 ? 'bg-purple-100 text-purple-700' : 'bg-slate-100'}`}>3</span>
              <span>Details & 2FA</span>
            </div>
          </div>

          {/* STEP 1: Student Search */}
          {wizardStep === 1 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                Step 1 — Search student by ID or full name
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  autoFocus
                  value={studentQuery}
                  onChange={(e) => setStudentQuery(e.target.value)}
                  placeholder="Search by student ID or name…"
                  className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm text-slate-800 focus:border-purple-500 focus:outline-none"
                />
              </div>

              {studentQuery.trim().length >= 2 && (
                <div className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                  {studentResults.isLoading ? (
                    <p className="p-3 text-xs text-slate-400">Searching students…</p>
                  ) : !studentResults.data?.length ? (
                    <p className="p-3 text-xs text-slate-400">No students match your query.</p>
                  ) : (
                    studentResults.data.map((s) => (
                      <button
                        key={s.id || s._id}
                        type="button"
                        onClick={() => {
                          setPickedStudent(s);
                          setStudentQuery('');
                          setWizardStep(2);
                        }}
                        className="flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50 transition"
                      >
                        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                          {s.photoUrl ? (
                            <img
                              src={s.photoUrl}
                              alt={s.fullName || s.name}
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const fb = e.currentTarget.parentElement.querySelector('.avatar-fallback');
                                if (fb) fb.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <div
                            className="avatar-fallback flex h-full w-full items-center justify-center bg-purple-50 text-xs font-bold text-purple-700"
                            style={{ display: s.photoUrl ? 'none' : 'flex' }}
                          >
                            <User className="h-5 w-5 text-purple-600" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{s.fullName || s.name}</p>
                          <p className="font-mono text-[11px] text-slate-500">
                            {s.studentId} • {s.programme || s.department || 'Regular'} • {s.batch || ''}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Month Selection — mode aware */}
          {wizardStep === 2 && pickedStudent && (
            <div className="space-y-3">
              {/* Picked Student Summary */}
              <div className="flex items-center justify-between rounded-xl bg-purple-50/60 p-3 border border-purple-100">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-200 text-purple-800 font-bold text-xs">
                    {(pickedStudent.fullName || pickedStudent.name || 'S')[0]}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{pickedStudent.fullName || pickedStudent.name}</p>
                    <p className="font-mono text-[11px] text-slate-500">
                      ID: {pickedStudent.studentId} • {pickedStudent.programme || pickedStudent.department || '—'}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setPickedStudent(null); setWizardStep(1); }}>
                  <X className="h-3.5 w-3.5" />
                  <span>Change</span>
                </Button>
              </div>

              {/* WAIVER MODE: only the student's UNPAID monthly charges */}
              {wizardMode === 'waiver' ? (
                <>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-medium text-amber-800">
                    Fee waivers apply only to <strong>unpaid months</strong> on this student's account. Paid, waived, or reversed months are hidden automatically.
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                    <span className="text-xs font-semibold text-slate-700">
                      Unpaid month cycles ({unpaidCharges.length}):
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllCycles}
                        className="text-[11px] font-semibold text-purple-600 hover:text-purple-800"
                      >
                        Select All
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={handleClearAllCycles}
                        className="text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                      >
                        Clear All
                      </button>
                      <Badge tone={selectedCycleIds.length > 0 ? 'purple' : 'neutral'}>
                        {selectedCycleIds.length} selected
                      </Badge>
                    </div>
                  </div>

                  {pickedStudentProfile.isLoading ? (
                    <p className="p-4 text-center text-xs text-slate-400">Loading student fee account…</p>
                  ) : unpaidCharges.length === 0 ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800">
                      Great news — {pickedStudent.fullName || 'this student'} has no unpaid monthly fees. Nothing left to waive.
                    </div>
                  ) : (
                    <div className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                      {unpaidCharges.map((c) => {
                        const cId = c.cycle?._id;
                        const isSelected = selectedCycleIds.includes(cId);
                        const overdue = new Date(c.dueAt) < new Date();
                        return (
                          <div
                            key={c._id || cId}
                            onClick={() => cId && toggleCycle(cId)}
                            className={`flex items-center justify-between p-3 cursor-pointer transition ${
                              isSelected ? 'bg-purple-50/70' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                              />
                              <div>
                                <p className="text-xs font-bold text-slate-800">
                                  {c.cycle?.title || 'Fee Cycle'}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  Due {formatEthiopian(c.dueAt)}
                                  {overdue ? <span className="font-bold text-rose-600"> • OVERDUE</span> : ''}
                                </p>
                              </div>
                            </div>
                            <p className="font-mono text-xs font-bold text-slate-700">
                              {c.amountDueEtb || (c.amountDue / 100).toFixed(2)} ETB
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* SCHOLARSHIP MODE: pick monthly cycles from the selected academic year */}
                  {/* Academic Year Selector */}
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                        Academic Year (EC)
                      </label>
                      <p className="text-[11px] text-slate-400">Select year to load monthly fee cycles.</p>
                    </div>
                    <select
                      value={selectedEthYear}
                      onChange={(e) => {
                        setSelectedEthYear(e.target.value);
                        setSelectedCycleIds([]);
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm outline-none focus:border-purple-500"
                    >
                      {academicYears.map((y) => (
                        <option key={y.ethYear} value={y.ethYear}>
                          {y.ethYear} EC Academic Year
                        </option>
                      ))}
                      {(!academicYears || academicYears.length === 0) && (
                        <option value={new Date().getFullYear() - 7}>{new Date().getFullYear() - 7} EC</option>
                      )}
                    </select>
                  </div>

                  {/* Month cycles multi-selection toolbar */}
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                    <span className="text-xs font-semibold text-slate-700">
                      Select month cycles to cover with scholarship:
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllCycles}
                        className="text-[11px] font-semibold text-purple-600 hover:text-purple-800"
                      >
                        Select All
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={handleClearAllCycles}
                        className="text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                      >
                        Clear All
                      </button>
                      <Badge tone={selectedCycleIds.length > 0 ? 'purple' : 'neutral'}>
                        {selectedCycleIds.length} selected
                      </Badge>
                    </div>
                  </div>

                  {/* Cycles List with Checkboxes */}
                  {yearCyclesQuery.isLoading ? (
                    <p className="p-4 text-center text-xs text-slate-400">Loading monthly fee cycles…</p>
                  ) : !yearCyclesQuery.data?.length ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
                      No payment cycles found for {selectedEthYear} EC. You can create cycles in the Payment Cycles page.
                    </div>
                  ) : (
                    <div className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                      {yearCyclesQuery.data.map((c) => {
                        const cId = c._id || c.id;
                        const isSelected = selectedCycleIds.includes(cId);
                        return (
                          <div
                            key={cId}
                            onClick={() => toggleCycle(cId)}
                            className={`flex items-center justify-between p-3 cursor-pointer transition ${
                              isSelected ? 'bg-purple-50/70' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                              />
                              <div>
                                <p className="text-xs font-bold text-slate-800">
                                  {c.title || `${ETH_MONTHS[(c.ethMonth || 1) - 1]} ${c.ethYear}`}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  Month {c.ethMonth} • Due {formatEthiopian(c.dueAt)}
                                </p>
                              </div>
                            </div>
                            <p className="font-mono text-xs font-bold text-slate-700">
                              {(c.amount / 100).toFixed(2)} ETB
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* Navigation buttons */}
              <div className="flex justify-between pt-2">
                <Button variant="outline" size="sm" onClick={() => setWizardStep(1)}>
                  Back
                </Button>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-600">
                    Total to waive: <span className="font-mono font-bold text-purple-700">{waivedTotalEtb.toFixed(2)} ETB</span>
                  </span>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={selectedCycleIds.length === 0}
                    onClick={() => setWizardStep(3)}
                    className="bg-purple-600 text-white hover:bg-purple-700"
                  >
                    <span>Continue to 2FA Details ({selectedCycleIds.length})</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Waiver Details & 2FA Authorization */}
          {wizardStep === 3 && pickedStudent && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                batchWaiverMutation.mutate();
              }}
              className="space-y-3.5"
            >
              {/* Summary Banner */}
              <div className="rounded-xl bg-purple-50/60 p-3 border border-purple-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-800">{pickedStudent.fullName || pickedStudent.name} ({pickedStudent.studentId})</p>
                  <p className="text-[11px] text-purple-700 font-semibold">
                    {wizardMode === 'scholarship' ? 'Covering' : 'Waiving'} {selectedCycleIds.length} month cycle(s) {'—'} total{' '}
                    <span className="font-mono font-bold">{waivedTotalEtb.toFixed(2)} ETB</span>
                  </p>
                </div>
                <Badge tone="purple">{selectedCycleIds.length} Months</Badge>
              </div>

              {/* Waiver Type: Full vs Partial */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">Waiver Scope</label>
                <div className="grid grid-cols-2 gap-2">
                  {['full', 'partial'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setWType(t)}
                      className={`rounded-xl border px-3 py-2 text-xs font-bold uppercase transition ${
                        wType === t
                          ? 'border-purple-600 bg-purple-50 text-purple-800'
                          : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {t === 'full' ? 'Full (100% Exemption)' : 'Partial Exemption'}
                    </button>
                  ))}
                </div>
              </div>

              {wType === 'partial' && (
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600">
                    Exemption amount per cycle (ETB)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={wAmount}
                    onChange={(e) => setWAmount(e.target.value)}
                    required
                    placeholder="e.g. 400"
                    className="mt-1 block w-full rounded-xl border border-slate-200 p-2.5 font-mono text-sm text-slate-800 focus:border-purple-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Reason (Required) */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600">
                  Reason for Exemption / Scholarship <span className="text-rose-500">*</span>
                </label>
                <input
                  value={wReason}
                  onChange={(e) => setWReason(e.target.value)}
                  placeholder="e.g. Full academic merit scholarship / Need-based college exemption"
                  required
                  className="mt-1 block w-full rounded-xl border border-slate-200 p-2.5 text-sm text-slate-800 focus:border-purple-500 focus:outline-none"
                />
              </div>

              {/* Scholarship College / Sponsor (Optional) */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600">
                  {wizardMode === 'scholarship' ? (
                    <>Scholarship Organization / College <span className="text-rose-500">*</span></>
                  ) : (
                    <>Scholarship Organization / College <span className="text-slate-400 font-normal">(Optional)</span></>
                  )}
                </label>
                <input
                  value={wScholarship}
                  onChange={(e) => setWScholarship(e.target.value)}
                  required={wizardMode === 'scholarship'}
                  placeholder="e.g. Mekuria Scholarship Foundation / Ministry of Education"
                  className="mt-1 block w-full rounded-xl border border-slate-200 p-2.5 text-sm text-slate-800 focus:border-purple-500 focus:outline-none"
                />
              </div>

              {/* 2FA Authorization Security Card */}
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 space-y-2.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-indigo-600 shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wide text-indigo-950">
                      Accountant 2FA Email Authorization
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Fee waivers require one-time email authorization for audit and compliance.
                    </p>
                  </div>
                </div>

                {!codeRequested ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => requestCodeMutation.mutate()}
                    disabled={requestCodeMutation.isPending}
                    className="w-full justify-center border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"
                  >
                    {requestCodeMutation.isPending ? 'Sending code…' : 'Send 6-Digit 2FA Code to Email'}
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-[11px] font-medium text-emerald-800">
                      A 6-digit verification code has been dispatched to your email. Valid for 10 minutes.
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                        Enter 6-Digit Verification Code <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="123456"
                        required
                        className="w-full text-center font-mono tracking-widest text-lg font-bold rounded-xl border border-slate-300 bg-white p-2 text-slate-900 focus:border-purple-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => requestCodeMutation.mutate()}
                        disabled={requestCodeMutation.isPending}
                        className="text-[11px] text-indigo-600 hover:underline font-semibold"
                      >
                        {requestCodeMutation.isPending ? 'Sending...' : 'Resend code'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Action Buttons */}
              <div className="flex justify-between pt-2">
                <Button variant="outline" type="button" onClick={() => setWizardStep(2)}>
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={
                    !codeRequested ||
                    verificationCode.length < 6 ||
                    !wReason.trim() ||
                    batchWaiverMutation.isPending
                  }
                  className="bg-purple-600 text-white hover:bg-purple-700"
                >
                  {batchWaiverMutation.isPending
                    ? 'Authorizing & Granting…'
                    : `Verify & ${wizardMode === 'scholarship' ? 'Record Scholarships' : 'Grant Waivers'} (${selectedCycleIds.length})`}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Modal>

      {/* REVOKE WAIVER MODAL */}
      <Modal
        open={Boolean(revokingWaiver)}
        onClose={() => setRevokingWaiver(null)}
        title="Revoke Fee Waiver"
      >
        {revokingWaiver && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              revokeMutation.mutate({
                id: revokingWaiver.id,
                reason: revokeReason,
              });
            }}
            className="space-y-4"
          >
            <p className="text-xs text-rose-600 font-medium">
              Revoking this waiver will restore the full tuition fee charge on {revokingWaiver.student?.fullName}'s account and re-impose academic holds if past due.
            </p>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">
                Reason for Revocation
              </label>
              <textarea
                rows={3}
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="Reason for revoking this exemption..."
                className="mt-1 block w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" type="button" onClick={() => setRevokingWaiver(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-rose-600 text-white hover:bg-rose-700"
                disabled={revokeMutation.isPending}
              >
                {revokeMutation.isPending ? 'Revoking...' : 'Confirm Revocation'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
