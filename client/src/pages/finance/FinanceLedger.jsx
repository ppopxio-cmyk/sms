import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Search,
  Printer,
  RotateCcw,
  CheckCircle2,
  XCircle,
  FileCheck2,
  ExternalLink,
  RefreshCw,
  Building2,
  Calendar,
  SearchCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/StatePanel';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { formatEthiopian } from '../../lib/ethiopianDate';
import Brand from '../../components/ui/Brand';
import AccountantAcademicFilter, { SelectToViewCard } from '../../components/finance/AccountantAcademicFilter';

export default function FinanceLedger() {
  const queryClient = useQueryClient();

  // Academic Filter (Batch -> Department -> Programme)
  const [selectedBatch, setSelectedBatch] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');
  const [isFilterApplied, setIsFilterApplied] = useState(false);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [page, setPage] = useState(1);

  // View / Print Receipt Modal
  const [activePayment, setActivePayment] = useState(null);

  // Reversal Modal
  const [reversingPayment, setReversingPayment] = useState(null);
  const [reversalReason, setReversalReason] = useState('');

  // Verify by Receipt Number Modal
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyReceiptNumber, setVerifyReceiptNumber] = useState('');
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');

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
      'ledger',
      { search, status, method, batchId: selectedBatch, departmentId: selectedDepartment, programId: selectedProgram, page, isFilterApplied },
    ],
    queryFn: async () => {
      const res = await api.get('/finance/ledger', {
        params: {
          search: search || undefined,
          status: status || undefined,
          method: method || undefined,
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

  const reverseMutation = useMutation({
    mutationFn: async ({ paymentId, reason }) => {
      const res = await api.post(`/finance/payments/${paymentId}/reverse`, { reason });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Payment reversed. Associated charge marked unpaid.');
      setReversingPayment(null);
      setReversalReason('');
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const handlePrintModal = () => {
    window.print();
  };

  const handleVerifyReceipt = async () => {
    if (!verifyReceiptNumber.trim()) return;
    setVerifying(true);
    setVerifyResult(null);
    setVerifyError('');
    try {
      const res = await fetch(`/api/finance/payments/verify/${verifyReceiptNumber.trim()}`);
      const data = await res.json();
      if (res.ok && data?.verification) {
        setVerifyResult(data);
      } else {
        setVerifyError(data?.message || 'No payment found with that receipt number.');
      }
    } catch {
      setVerifyError('Network error while verifying receipt.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <PageHeader
            title="Official Payments Ledger"
            subtitle="Append-only record of confirmed student fee settlements, digital receipts, and audit trail of payment reversals."
            icon={BookOpen}
          />
        </div>

        {/* Receipt verification stays visible at the top of the ledger page. */}
        <Button
          variant="primary"
          size="sm"
          className="shrink-0 self-start"
          onClick={() => {
            setVerifyReceiptNumber('');
            setVerifyResult(null);
            setVerifyOpen(true);
          }}
        >
          <SearchCheck className="h-4 w-4" />
          <span>Verify by Receipt #</span>
        </Button>
      </div>

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
          title="Select to View Payments Ledger"
          message="Please select a Batch, Department, or Programme above, then click View Records to display confirmed payments."
        />
      ) : (
        <>
          {/* Filter toolbar */}
          <Card>
        <CardBody className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by receipt number, FT ref, or payer name..."
                className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
              />
            </div>

            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700 focus:border-brand-500 focus:outline-none"
            >
              <option value="">All Payments</option>
              <option value="confirmed">Confirmed</option>
              <option value="reversed">Reversed</option>
            </select>

            <select
              value={method}
              onChange={(e) => {
                setMethod(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700 focus:border-brand-500 focus:outline-none"
            >
              <option value="">All Methods</option>
              <option value="cbe_receipt">CBE Digital Receipt</option>
              <option value="cash">Cash Settlement</option>
              <option value="manual">Manual Bank Transfer</option>
            </select>

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
        </CardBody>
      </Card>

      {/* Ledger Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="p-6">
              <SkeletonRows rows={8} />
            </div>
          ) : !data?.payments?.length ? (
            <div className="p-10">
              <EmptyState
                icon={BookOpen}
                title="No payment records found"
                message="Confirmed student payments will appear chronologically in this official ledger."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-3.5 pl-6 pr-4">Receipt Number</th>
                    <th className="py-3.5 px-4">Student</th>
                    <th className="py-3.5 px-4">Cycle</th>
                    <th className="py-3.5 px-4">Amount</th>
                    <th className="py-3.5 px-4">Method & Ref</th>
                    <th className="py-3.5 px-4">Paid At</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.payments.map((p) => (
                    <tr key={p.id} className="transition hover:bg-slate-50/70">
                      <td className="py-3.5 pl-6 pr-4">
                        <button
                          type="button"
                          onClick={() => setActivePayment(p)}
                          className="font-mono font-bold text-brand-600 hover:underline"
                        >
                          {p.receiptNumber}
                        </button>
                      </td>

                      <td className="py-3.5 px-4">
                        <Link
                          to={`/accountant/collections/students/${p.student?._id || p.student}`}
                          className="font-medium text-slate-800 hover:text-brand-600"
                        >
                          {p.student?.fullName || p.payerName}
                        </Link>
                        <p className="font-mono text-xs text-slate-400">
                          {p.student?.studentId}
                        </p>
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-700">
                        {p.cycle?.title || 'Fee'}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {p.amountEtb} ETB
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge tone={p.method === 'cbe_receipt' ? 'brand' : 'neutral'}>
                          {p.method.toUpperCase()}
                        </Badge>
                        <span className="block font-mono text-[11px] text-slate-400 truncate max-w-[140px]" title={p.bankReference}>
                          {p.bankReference}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        {formatEthiopian(p.paidAt, { time: true })}
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge tone={p.status === 'confirmed' ? 'emerald' : 'rose'}>
                          {p.status.toUpperCase()}
                        </Badge>
                      </td>

                      <td className="py-3.5 pr-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setActivePayment(p)}
                            title="View / Print Receipt"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Button>

                          {p.status === 'confirmed' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-rose-600 hover:bg-rose-50"
                              onClick={() => {
                                setReversingPayment(p);
                                setReversalReason('');
                              }}
                              title="Reverse Payment"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {data?.pages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 p-4">
              <p className="text-xs text-slate-500">
                Page {data.page} of {data.pages} ({data.total} total payments)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.pages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
      </>
      )}

      {/* OFFICIAL RECEIPT VIEW / PRINT MODAL */}
      <Modal
        open={Boolean(activePayment)}
        onClose={() => setActivePayment(null)}
        title="Official Payment Receipt"
        size="md"
      >
{activePayment && (
            <div className="print-receipt space-y-5 print:p-0">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h2 className="mt-2 text-base font-bold text-slate-800">
                Haramaya Health Science College
              </h2>
              <p className="font-mono text-sm font-semibold text-emerald-800">
                {activePayment.receiptNumber}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Status: {activePayment.status.toUpperCase()}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs">
              <div>
                <span className="text-slate-400">Student:</span>
                <p className="font-bold text-slate-800">
                  {activePayment.student?.fullName || activePayment.payerName}
                </p>
                <p className="font-mono text-[11px] text-slate-500">
                  {activePayment.student?.studentId}
                </p>
              </div>

              <div>
                <span className="text-slate-400">Payment Date:</span>
                <p className="font-medium text-slate-800">
                  {formatEthiopian(activePayment.paidAt, { time: true })}
                </p>
              </div>
            </div>

            <div className="border-t border-b border-slate-100 py-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Cycle:</span>
                <span className="font-medium text-slate-800">{activePayment.cycle?.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Bank Reference:</span>
                <span className="font-mono font-medium text-slate-800">{activePayment.bankReference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Method:</span>
                <span className="font-medium text-slate-800">{activePayment.method.toUpperCase()}</span>
              </div>
              {activePayment.recordedBy && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Recorded By:</span>
                  <span className="font-medium text-slate-800">{activePayment.recordedBy.name || activePayment.recordedBy.email}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-xl bg-brand-50 p-3">
              <span className="text-xs font-semibold text-brand-900">Amount Paid</span>
              <span className="font-mono text-xl font-bold text-brand-700">
                {activePayment.amountEtb} ETB
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setActivePayment(null)}>
                Close
              </Button>
              <Button onClick={handlePrintModal}>
                <Printer className="h-4 w-4" />
                <span>Print Receipt</span>
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* REVERSAL MODAL */}
      <Modal
        open={Boolean(reversingPayment)}
        onClose={() => setReversingPayment(null)}
        title="Reverse Confirmed Payment"
      >
        {reversingPayment && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              reverseMutation.mutate({
                paymentId: reversingPayment.id,
                reason: reversalReason,
              });
            }}
            className="space-y-4"
          >
            <p className="text-xs text-rose-600 font-medium">
              Reversing payment {reversingPayment.receiptNumber} will mark the transaction as reversed and reactivate the student's unpaid charge.
            </p>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">
                Reason for Reversal (Required for Audit Log)
              </label>
              <textarea
                rows={3}
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                placeholder="e.g. Bank chargeback, payment entered in error, or duplicate submission..."
                className="mt-1 block w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 focus:border-rose-500 focus:outline-none"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" type="button" onClick={() => setReversingPayment(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-rose-600 text-white hover:bg-rose-700"
                disabled={reverseMutation.isPending || !reversalReason.trim()}
              >
                {reverseMutation.isPending ? 'Reversing...' : 'Confirm Reversal'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* VERIFY BY RECEIPT NUMBER MODAL */}
      <Modal
        open={verifyOpen}
        onClose={() => {
          setVerifyOpen(false);
          setVerifyReceiptNumber('');
          setVerifyResult(null);
        }}
        title="Verify Payment by Receipt Number"
        size="md"
      >
        <div className="space-y-4">
          {!verifyResult ? (
            <div>
              <p className="text-xs text-slate-500 mb-4">
                Enter an official receipt number to verify the payment details.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleVerifyReceipt();
                }}
                className="space-y-3"
              >
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600">
                    Receipt Number
                  </label>
                  <input
                    type="text"
                    value={verifyReceiptNumber}
                    onChange={(e) => setVerifyReceiptNumber(e.target.value.trim().toUpperCase())}
                    placeholder="e.g. RCP-2019-001234"
                    required
                    className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm text-slate-800"
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" type="button" onClick={() => setVerifyOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-brand-600 text-white hover:bg-brand-700"
                    disabled={verifying || !verifyReceiptNumber.trim()}
                  >
                    {verifying ? 'Verifying...' : 'Verify Receipt'}
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-bold">Payment Verified / ክፍያ ተገርቧል</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs">
                <div>
                  <span className="text-slate-400">Receipt Number:</span>
                  <p className="font-mono font-bold text-slate-800">{verifyResult.verification.receiptNumber}</p>
                </div>
                <div>
                  <span className="text-slate-400">Status:</span>
                  <p className="font-bold text-emerald-700">{verifyResult.verification.status.toUpperCase()}</p>
                </div>
                <div>
                  <span className="text-slate-400">Student:</span>
                  <p className="font-bold text-slate-800">{verifyResult.verification.student?.fullName || '—'}</p>
                  <p className="font-mono text-[11px] text-slate-500">{verifyResult.verification.student?.studentId || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Programme:</span>
                  <p className="font-medium text-slate-800">{verifyResult.verification.student?.programme || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Cycle:</span>
                  <p className="font-medium text-slate-800">{verifyResult.verification.cycle?.title || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Paid At:</span>
                  <p className="font-medium text-slate-800">{formatEthiopian(verifyResult.verification.paidAt, { time: true })}</p>
                </div>
                <div>
                  <span className="text-slate-400">Method:</span>
                  <p className="font-medium text-slate-800">{verifyResult.verification.method.toUpperCase()}</p>
                </div>
                <div>
                  <span className="text-slate-400">Bank Ref:</span>
                  <p className="font-mono text-xs text-slate-800">{verifyResult.verification.bankReference}</p>
                </div>
                {verifyResult.verification.chapaReference && (
                  <div>
                    <span className="text-slate-400">Chapa Ref:</span>
                    <p className="font-mono text-xs text-emerald-700">{verifyResult.verification.chapaReference}</p>
                  </div>
                )}
                <div>
                  <span className="text-slate-400">Amount:</span>
                  <p className="font-mono text-sm font-bold text-slate-900">{verifyResult.verification.amountEtb} ETB</p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" type="button" onClick={() => {
                  setVerifyResult(null);
                  setVerifyReceiptNumber('');
                }}>
                  Verify Another
                </Button>
                <Button variant="outline" onClick={() => setVerifyOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
