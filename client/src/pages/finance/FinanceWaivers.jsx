import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Gift,
  Search,
  RefreshCw,
  RotateCcw,
  User,
  Mail,
  X,
  ChevronRight,
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
import { formatEthiopian } from '../../lib/ethiopianDate';
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

  // New-waiver wizard state (fee waivers only)
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [studentQuery, setStudentQuery] = useState('');
  const [pickedStudent, setPickedStudent] = useState(null);
  const [selectedCycleIds, setSelectedCycleIds] = useState([]);
  const [wReason, setWReason] = useState('');

  // 2FA Email Verification state
  const [verificationCode, setVerificationCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [codeCountdown, setCodeCountdown] = useState(0);

  useEffect(() => {
    if (codeCountdown <= 0) return;
    const t = setInterval(() => {
      setCodeCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [codeCountdown]);

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

  // Picked student's charge ledger.
  const pickedStudentProfile = useQuery({
    queryKey: ['finance', 'waiverStudentProfile', pickedStudent?.id || pickedStudent?._id],
    queryFn: async () => {
      const sid = pickedStudent.id || pickedStudent._id;
      const res = await api.get(`/finance/students/${sid}`);
      return res.data;
    },
    enabled: wizardOpen && Boolean(pickedStudent),
  });

  // We only ever show the student's UNPAID monthly charges.
  const unpaidCharges = (pickedStudentProfile.data?.charges || []).filter((c) => c.status === 'unpaid');

  const openWizard = () => {
    resetWizard();
    setWizardOpen(true);
  };

  const resetWizard = () => {
    setWizardOpen(false);
    setWizardStep(1);
    setStudentQuery('');
    setPickedStudent(null);
    setSelectedCycleIds([]);
    setWReason('');
    setVerificationCode('');
    setCodeSent(false);
    setCodeCountdown(0);
  };

  const handleRequestVerificationCode = async () => {
    try {
      setSendingCode(true);
      const res = await api.post('/finance/waivers/request-code');
      toast.success(res.data?.message || 'Verification code sent to your email.');
      setCodeSent(true);
      setCodeCountdown(60);
      if (res.data?.debugCode) {
        setVerificationCode(res.data.debugCode);
      }
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to send verification code.'));
    } finally {
      setSendingCode(false);
    }
  };

  const handleSelectAllCycles = () => {
    setSelectedCycleIds(unpaidCharges.map((c) => c.cycle?._id));
  };

  const handleClearAllCycles = () => {
    setSelectedCycleIds([]);
  };

  // Auto-computed total waived amount for the current selection (full exemptions).
  const waivedTotalEtb = unpaidCharges
    .filter((c) => selectedCycleIds.includes(c.cycle?._id))
    .reduce((sum, c) => sum + c.amountDue / 100, 0);

  const toggleCycle = (id) => {
    setSelectedCycleIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Batch waiver mutation — authorizing requires reason and email 2FA verification code.
  const batchWaiverMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        studentId: pickedStudent.studentId || pickedStudent._id || pickedStudent.id,
        cycleIds: selectedCycleIds,
        type: 'full',
        reason: wReason.trim(),
        verificationCode: verificationCode.trim(),
      };
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
              variant="primary"
              size="sm"
              onClick={openWizard}
            >
              <Gift className="h-4 w-4" />
              <span>+ Grant Fee Waiver</span>
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
                variant="primary"
                size="sm"
                onClick={openWizard}
              >
                <Gift className="h-4 w-4" />
                <span>+ Grant Fee Waiver</span>
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
                    message={'Use the "+ Grant Fee Waiver" button to grant a student fee exemption for specific unpaid months.'}
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

      {/* GRANT FEE WAIVER WIZARD */}
      <Modal
        open={wizardOpen}
        onClose={resetWizard}
        title="Grant Fee Waiver"
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

          {/* STEP 3: Reason & Confirmation */}
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
                    Waiving {selectedCycleIds.length} unpaid month cycle(s) {'—'} total{' '}
                    <span className="font-mono font-bold">{waivedTotalEtb.toFixed(2)} ETB</span>
                  </p>
                </div>
                <Badge tone="purple">{selectedCycleIds.length} Months</Badge>
              </div>

              {/* Total (auto-computed, for clarity) */}
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-slate-600">Total Waived Amount</span>
                <span className="font-mono text-sm font-bold text-slate-900">{waivedTotalEtb.toFixed(2)} Birr</span>
              </div>

              {/* Reason (Required) */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600">
                  Reason for Waiver <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={wReason}
                  onChange={(e) => setWReason(e.target.value)}
                  placeholder="e.g. Need-based college exemption / Full academic merit"
                  required
                  className="mt-1 block w-full rounded-xl border border-slate-200 p-2.5 text-sm text-slate-800 focus:border-purple-500 focus:outline-none"
                />
              </div>

              {/* 2FA Email Authorization (Required) */}
              <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3.5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-600 text-white shrink-0">
                      <Mail className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Email Verification Required</p>
                      <p className="text-[11px] text-slate-500">
                        A 6-digit code will be sent to your registered accountant email.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleRequestVerificationCode}
                    disabled={sendingCode || codeCountdown > 0}
                    className="shrink-0 text-xs border-purple-300 text-purple-700 hover:bg-purple-100"
                  >
                    {sendingCode
                      ? 'Sending…'
                      : codeCountdown > 0
                      ? `Resend in ${codeCountdown}s`
                      : codeSent
                      ? 'Resend Code'
                      : 'Send Verification Code'}
                  </Button>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    6-Digit Verification Code <span className="text-rose-500">*</span>
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="••••••"
                      className="w-44 rounded-xl border border-slate-300 bg-white px-3 py-2 text-center font-mono text-base font-black tracking-[0.35em] text-slate-900 focus:border-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-600"
                    />
                    {codeSent && (
                      <span className="text-xs font-semibold text-emerald-700">
                        Verification code sent! Valid for 10 min.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Action Buttons */}
              <div className="flex justify-between pt-2">
                <Button variant="outline" type="button" onClick={() => setWizardStep(2)}>
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={
                    !wReason.trim() ||
                    verificationCode.length !== 6 ||
                    batchWaiverMutation.isPending
                  }
                  className="bg-purple-600 text-white hover:bg-purple-700"
                >
                  {batchWaiverMutation.isPending
                    ? 'Verifying & Granting…'
                    : `Verify & Grant Fee Waivers (${selectedCycleIds.length})`}
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
