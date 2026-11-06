import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Gift,
  Search,
  RefreshCw,
  RotateCcw,
  Plus,
  User,
  Mail,
  X,
  ChevronRight,
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

  // New-waiver wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [studentQuery, setStudentQuery] = useState('');
  const [pickedStudent, setPickedStudent] = useState(null);
  const [pickedCharge, setPickedCharge] = useState(null);
  const [wType, setWType] = useState('full');
  const [wAmount, setWAmount] = useState('');
  const [wReason, setWReason] = useState('');
  const [wScholarship, setWScholarship] = useState('');
  const [wSendEmail, setWSendEmail] = useState(true);

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

  // Unpaid months of the picked student
  const studentCharges = useQuery({
    queryKey: ['finance', 'studentUnpaid', pickedStudent?._id],
    queryFn: async () => {
      const res = await api.get('/finance/collections', {
        params: { search: pickedStudent.studentId, status: 'unpaid', limit: 100 },
      });
      return res.data?.charges || [];
    },
    enabled: Boolean(pickedStudent),
  });

  const resetWizard = () => {
    setWizardOpen(false);
    setStudentQuery('');
    setPickedStudent(null);
    setPickedCharge(null);
    setWType('full');
    setWAmount('');
    setWReason('');
    setWScholarship('');
    setWSendEmail(true);
  };

  const waiveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        type: wType,
        reason: wReason,
        scholarshipCollege: wScholarship,
        sendEmail: wSendEmail,
      };
      if (wType === 'partial') body.amount = Math.round(Number(wAmount) * 100);
      const res = await api.post(`/finance/charges/${pickedCharge.id}/waive`, body);
      return res.data;
    },
    onSuccess: (res) => {
      const emailed = res?.waiver?.emailSentAt;
      toast.success(
        emailed
          ? 'Waiver approved. Email confirmation sent to the student.'
          : emailed === null || emailed === undefined
            ? 'Waiver approved. (No email sent — student has no address on file or email failed.)'
            : 'Waiver approved.',
      );
      resetWizard();
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not create the waiver.')),
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
                onClick={() => setWizardOpen(true)}
              >
                <Plus className="h-4 w-4" />
                <span>New Waiver</span>
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
                    message="Use the “New Waiver” button to grant a fee exemption for a specific month."
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

      {/* NEW WAIVER WIZARD */}
      <Modal open={wizardOpen} onClose={resetWizard} title="Grant Fee Waiver">
        <div className="space-y-4">
          {/* Step 1 — student */}
          {!pickedStudent ? (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                Step 1 — Find the student
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  autoFocus
                  value={studentQuery}
                  onChange={(e) => setStudentQuery(e.target.value)}
                  placeholder="Search by student ID or name…"
                  className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none"
                />
              </div>

              {studentQuery.trim().length >= 2 && (
                <div className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                  {studentResults.isLoading ? (
                    <p className="p-3 text-xs text-slate-400">Searching…</p>
                  ) : !studentResults.data?.length ? (
                    <p className="p-3 text-xs text-slate-400">No students match.</p>
                  ) : (
                    studentResults.data.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setPickedStudent(s);
                          setStudentQuery('');
                        }}
                        className="flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50"
                      >
                        <div className="h-9 w-9 overflow-hidden rounded-lg bg-slate-100">
                          {s.photoUrl ? (
                            <img src={s.photoUrl} alt={s.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs font-bold text-brand-700">
                              {(s.name || 'S')[0]}
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                          <p className="font-mono text-[11px] text-slate-400">
                            {s.studentId} • {s.programme || s.department || '—'}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : !pickedCharge ? (
            /* Step 2 — month/charge */
            <div>
              <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-50 p-3">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 overflow-hidden rounded-lg bg-slate-100">
                    {pickedStudent.photoUrl ? (
                      <img src={pickedStudent.photoUrl} alt={pickedStudent.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-bold text-brand-700">
                        {(pickedStudent.name || 'S')[0]}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{pickedStudent.name}</p>
                    <p className="font-mono text-[11px] text-slate-400">{pickedStudent.studentId}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setPickedStudent(null)}>
                  <X className="h-3.5 w-3.5" />
                  <span>Change</span>
                </Button>
              </div>

              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                Step 2 — Pick the unpaid month to waive
              </p>
              {studentCharges.isLoading ? (
                <p className="p-3 text-xs text-slate-400">Loading months…</p>
              ) : !studentCharges.data?.length ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-700">
                  This student has no unpaid month charges — nothing to waive.
                </div>
              ) : (
                <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                  {studentCharges.data.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setPickedCharge(c);
                        setWAmount(String(c.amountDueEtb));
                      }}
                      className="flex w-full items-center justify-between p-3 text-left hover:bg-slate-50"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{c.cycle?.title || 'Monthly Fee'}</p>
                        <p className="font-mono text-[11px] text-slate-400">
                          EC {c.cycle?.ethYear || '—'} • Month {c.cycle?.ethMonth || '—'}
                          {c.dueAt ? ` • due ${formatEthiopian(c.dueAt)}` : ''}
                          {c.payments?.length ? ' • partial deposit' : ''}
                        </p>
                      </div>
                      <p className="font-mono text-sm font-bold text-slate-900">{c.amountDueEtb} ETB</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Step 3 — waiver details */
            <form
              onSubmit={(e) => {
                e.preventDefault();
                waiveMutation.mutate();
              }}
              className="space-y-3"
            >
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-800">{pickedStudent.name}</p>
                <p className="font-mono text-[11px] text-slate-500">
                  {pickedStudent.studentId} • {pickedCharge.cycle?.title || 'Monthly Fee'} • {pickedCharge.amountDueEtb} ETB
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600">Waiver type</label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {['full', 'partial'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setWType(t)}
                      className={`rounded-xl border px-3 py-2 text-xs font-bold uppercase transition ${
                        wType === t
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {t === 'full' ? 'Full (100%)' : 'Partial'}
                    </button>
                  ))}
                </div>
              </div>

              {wType === 'partial' && (
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600">
                    Partial amount to waive (ETB)
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={pickedCharge.amountDueEtb}
                    value={wAmount}
                    onChange={(e) => setWAmount(e.target.value)}
                    required
                    className="mt-1 block w-full rounded-xl border border-slate-200 p-2.5 font-mono text-sm text-slate-800"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600">
                  Reason (month / cycle)
                </label>
                <input
                  value={wReason}
                  onChange={(e) => setWReason(e.target.value)}
                  placeholder="e.g. Scholarship grant for this month"
                  required
                  className="mt-1 block w-full rounded-xl border border-slate-200 p-2.5 text-sm text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600">
                  Scholarship — which college?
                </label>
                <input
                  value={wScholarship}
                  onChange={(e) => setWScholarship(e.target.value)}
                  placeholder="e.g. Mekuria Scholarship College"
                  className="mt-1 block w-full rounded-xl border border-slate-200 p-2.5 text-sm text-slate-800"
                />
              </div>

              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={wSendEmail}
                  onChange={(e) => setWSendEmail(e.target.checked)}
                  className="rounded text-brand-600 focus:ring-brand-500"
                />
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" />
                  Email a confirmation to the student
                </span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" type="button" onClick={() => setPickedCharge(null)}>
                  Back
                </Button>
                <Button
                  type="submit"
                  className="bg-purple-600 text-white hover:bg-purple-700"
                  disabled={waiveMutation.isPending}
                >
                  {waiveMutation.isPending ? 'Approving…' : 'Approve Waiver'}
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
