import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Receipt,
  Search,
  Filter,
  DollarSign,
  Gift,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  User,
  ArrowRight,
  Eye,
  RefreshCw,
  MoreVertical,
  Download,
  FileText,
  FileSpreadsheet,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import { downloadExport } from '../../lib/download';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/StatePanel';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { formatEthiopian } from '../../lib/ethiopianDate';
import AccountantAcademicFilter, { SelectToViewCard } from '../../components/finance/AccountantAcademicFilter';

function ExportButtonsBlock({ exporting, onExport }) {
  if (exporting) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
        <span>Generating {exporting.toUpperCase()}…</span>
      </div>
    );
  }
  return (
    <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 shadow-sm">
      <span className="flex items-center gap-1 bg-slate-50 px-2.5 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        <Download className="h-3.5 w-3.5" /> Export
      </span>
      <button
        type="button"
        onClick={() => onExport('pdf')}
        className="border-l border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-rose-600 hover:bg-rose-50"
      >
        PDF
      </button>
      <button
        type="button"
        onClick={() => onExport('docx')}
        className="border-l border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-sky-600 hover:bg-sky-50"
      >
        Word
      </button>
      <button
        type="button"
        onClick={() => onExport('xlsx')}
        className="border-l border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-emerald-600 hover:bg-emerald-50"
      >
        Excel
      </button>
    </div>
  );
}

export default function FinanceCollections() {
  const queryClient = useQueryClient();

  // Academic Filter (Batch -> Department -> Programme)
  const [selectedBatch, setSelectedBatch] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');
  const [isFilterApplied, setIsFilterApplied] = useState(false);
  const [exporting, setExporting] = useState('');
  const toastIdCollections = `collectionsexport`;

  // Filters
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);

  // Modals state
  const [activeCharge, setActiveCharge] = useState(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showWaiveModal, setShowWaiveModal] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);

  // Payment form
  const [payForm, setPayForm] = useState({
    amount: '',
    method: 'cash',
    bankReference: '',
    payerName: '',
  });

  // Waiver form
  const [waiveForm, setWaiveForm] = useState({
    type: 'full',
    amount: '',
    reason: 'Scholarship exemption',
  });

  // Extend form
  const [extendDate, setExtendDate] = useState('');
  const [extendReason, setExtendReason] = useState('Personal extension granted');

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

  const handleExportCollections = async (format) => {
    setExporting(format);
    const tid = toast.loading(`Generating ${format.toUpperCase()} export…`);
    try {
      const params = new URLSearchParams({ format });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (overdueOnly) params.set('overdueOnly', 'true');
      if (selectedBatch) params.set('batchId', selectedBatch);
      if (selectedDepartment) params.set('departmentId', selectedDepartment);
      if (selectedProgram) params.set('programId', selectedProgram);
      await downloadExport(`/finance/collections/export?${params.toString()}`, `student-fee-collections.${format}`);
      toast.success(`${format.toUpperCase()} exported.`, { id: tid });
    } catch (err) {
      toast.error(errorMessage(err, 'Export failed.'), { id: tid });
    } finally {
      setExporting('');
    }
  };

  // Fetch collections - only when filter applied
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: [
      'finance',
      'collections',
      { search, status, overdueOnly, batchId: selectedBatch, departmentId: selectedDepartment, programId: selectedProgram, page, isFilterApplied },
    ],
    queryFn: async () => {
      const res = await api.get('/finance/collections', {
        params: {
          search: search || undefined,
          status: status || undefined,
          overdueOnly: overdueOnly ? 'true' : undefined,
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

  // Record Payment Mutation
  const payMutation = useMutation({
    mutationFn: async ({ chargeId, data }) => {
      const res = await api.post(`/finance/charges/${chargeId}/pay`, {
        ...data,
        amount: Math.round(parseFloat(data.amount) * 100),
      });
      return res.data;
    },
    onSuccess: (res) => {
      toast.success(`Payment confirmed! Receipt ${res.payment?.receiptNumber} generated.`);
      setShowPayModal(false);
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // Waive Mutation
  const waiveMutation = useMutation({
    mutationFn: async ({ chargeId, data }) => {
      const res = await api.post(`/finance/charges/${chargeId}/waive`, {
        ...data,
        amount: data.type === 'partial' ? Math.round(parseFloat(data.amount) * 100) : undefined,
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Fee waiver recorded successfully.');
      setShowWaiveModal(false);
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // Extend Mutation
  const extendMutation = useMutation({
    mutationFn: async ({ chargeId, extendedDueAt, reason }) => {
      const res = await api.post(`/finance/charges/${chargeId}/extend`, {
        extendedDueAt,
        reason,
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Student deadline extended.');
      setShowExtendModal(false);
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Fee Collections"
        subtitle="Individual student fee charges, payment recording, fee waivers, and deadline extensions."
        icon={Receipt}
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
          title="Select to View Fee Collections"
          message="Please select a Batch, Department, or Programme above, then click View Records to display student fee charges."
        />
      ) : (
        <>
          {/* Filter Toolbar */}
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
                placeholder="Search by student name or student ID..."
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
              <option value="">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
              <option value="waived">Waived</option>
            </select>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={overdueOnly}
                onChange={(e) => {
                  setOverdueOnly(e.target.checked);
                  setPage(1);
                }}
                className="rounded text-brand-600 focus:ring-brand-500"
              />
              <span>Overdue (Holds Only)</span>
            </label>

            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>

            <ExportButtonsBlock
              exporting={exporting}
              onExport={handleExportCollections}
            />
          </div>
        </CardBody>
      </Card>

      {/* Charges Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="p-6">
              <SkeletonRows rows={8} />
            </div>
          ) : !data?.charges?.length ? (
            <div className="p-10">
              <EmptyState
                icon={Receipt}
                title="No charges found"
                message="No student charges match your active search and filter criteria."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-3.5 pl-6 pr-4">Student</th>
                    <th className="py-3.5 px-4">Cycle</th>
                    <th className="py-3.5 px-4">Amount Due</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Due Date</th>
                    <th className="py-3.5 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.charges.map((charge) => (
                    <tr key={charge.id} className="transition hover:bg-slate-50/70">
                      <td className="py-3.5 pl-6 pr-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                            {(charge.student?.photo?.url || charge.student?.photo?.filePath) ? (
                              <img
                                src={charge.student.photo.url || charge.student.photo.filePath}
                                alt={charge.studentName}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-brand-50 text-xs font-bold text-brand-700">
                                {(charge.studentName || 'S').slice(0, 1)}
                              </div>
                            )}
                          </div>
                          <div>
                            <Link
                              to={`/accountant/collections/students/${charge.student?._id || charge.student}`}
                              className="font-semibold text-slate-800 hover:text-brand-600"
                            >
                              {charge.studentName}
                            </Link>
                            <p className="font-mono text-xs text-slate-400">
                              {charge.studentId} • {charge.programme || charge.department || 'General'}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <p className="font-medium text-slate-800">
                          {charge.cycle?.title || 'Monthly Fee'}
                        </p>
                        <p className="text-xs text-slate-400">
                          EC {charge.cycle?.ethYear || 2019}
                        </p>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {charge.amountDueEtb} ETB
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge
                          tone={
                            charge.status === 'paid'
                              ? 'emerald'
                              : charge.isOverdue
                              ? 'rose'
                              : charge.status === 'waived'
                              ? 'purple'
                              : 'neutral'
                          }
                        >
                          {charge.status === 'unpaid' && charge.isOverdue
                            ? 'OVERDUE (HOLD)'
                            : charge.status.toUpperCase()}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        {charge.paidAt ? (
                          <span className="text-emerald-700">
                            Paid {formatEthiopian(charge.paidAt)}
                          </span>
                        ) : (
                          formatEthiopian(charge.dueAt)
                        )}
                      </td>

                      <td className="py-3.5 pr-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {charge.status === 'unpaid' && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => {
                                  setActiveCharge(charge);
                                  setPayForm({
                                    amount: charge.amountDueEtb,
                                    method: 'cash',
                                    bankReference: `CASH-${Date.now().toString().slice(-6)}`,
                                    payerName: charge.studentName,
                                  });
                                  setShowPayModal(true);
                                }}
                              >
                                <DollarSign className="h-3.5 w-3.5" />
                                <span>Pay</span>
                              </Button>

                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setActiveCharge(charge);
                                  setWaiveForm({
                                    type: 'full',
                                    amount: charge.amountDueEtb,
                                    reason: 'Scholarship exemption',
                                  });
                                  setShowWaiveModal(true);
                                }}
                              >
                                <Gift className="h-3.5 w-3.5 text-purple-600" />
                                <span>Waive</span>
                              </Button>

                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setActiveCharge(charge);
                                  setExtendDate(
                                    new Date(Date.now() + 7 * 86_400_000)
                                      .toISOString()
                                      .slice(0, 10)
                                  );
                                  setShowExtendModal(true);
                                }}
                              >
                                <Calendar className="h-3.5 w-3.5 text-slate-500" />
                                <span>Extend</span>
                              </Button>
                            </>
                          )}

                          <Link to={`/accountant/collections/students/${charge.student?._id || charge.student}`}>
                            <Button variant="ghost" size="sm" title="View Statement">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
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
                Page {data.page} of {data.pages} ({data.total} total charges)
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

      {/* RECORD PAYMENT MODAL */}
      <Modal
        open={showPayModal}
        onClose={() => setShowPayModal(false)}
        title={`Record Manual Payment: ${activeCharge?.studentName}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            payMutation.mutate({
              chargeId: activeCharge.id,
              data: payForm,
            });
          }}
          className="space-y-4"
        >
          <div className="rounded-xl bg-slate-50 p-3 text-xs">
            <span className="text-slate-400">Target Cycle:</span>{' '}
            <span className="font-semibold text-slate-800">
              {activeCharge?.cycle?.title}
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600">
              Settlement Method
            </label>
            <select
              value={payForm.method}
              onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800"
            >
              <option value="cash">Cash Settlement (At College Cashier)</option>
              <option value="manual">Manual Bank Transfer / Bank Slip</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600">
              Amount (ETB)
            </label>
            <input
              type="number"
              step="0.01"
              value={payForm.amount}
              onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600">
              Bank Reference / Slip Number
            </label>
            <input
              type="text"
              value={payForm.bankReference}
              onChange={(e) => setPayForm({ ...payForm, bankReference: e.target.value })}
              placeholder="e.g. CASH-2019-01 or FT number"
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600">
              Payer Name
            </label>
            <input
              type="text"
              value={payForm.payerName}
              onChange={(e) => setPayForm({ ...payForm, payerName: e.target.value })}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" type="button" onClick={() => setShowPayModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={payMutation.isPending}>
              {payMutation.isPending ? 'Confirming...' : 'Record Payment & Clear Hold'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* WAIVER MODAL */}
      <Modal
        open={showWaiveModal}
        onClose={() => setShowWaiveModal(false)}
        title={`Apply Fee Waiver: ${activeCharge?.studentName}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            waiveMutation.mutate({
              chargeId: activeCharge.id,
              data: waiveForm,
            });
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600">
              Waiver Scope
            </label>
            <div className="mt-1 flex gap-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="waiverType"
                  checked={waiveForm.type === 'full'}
                  onChange={() => setWaiveForm({ ...waiveForm, type: 'full' })}
                />
                <span>Full Exemption (100%)</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="waiverType"
                  checked={waiveForm.type === 'partial'}
                  onChange={() => setWaiveForm({ ...waiveForm, type: 'partial' })}
                />
                <span>Partial Waiver</span>
              </label>
            </div>
          </div>

          {waiveForm.type === 'partial' && (
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">
                Waiver Amount (ETB)
              </label>
              <input
                type="number"
                step="0.01"
                value={waiveForm.amount}
                onChange={(e) => setWaiveForm({ ...waiveForm, amount: e.target.value })}
                className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600">
              Reason / Justification
            </label>
            <textarea
              rows={3}
              value={waiveForm.reason}
              onChange={(e) => setWaiveForm({ ...waiveForm, reason: e.target.value })}
              className="mt-1 block w-full rounded-xl border border-slate-200 p-2.5 text-xs"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" type="button" onClick={() => setShowWaiveModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={waiveMutation.isPending}>
              {waiveMutation.isPending ? 'Applying...' : 'Approve Waiver'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* EXTEND DEADLINE MODAL */}
      <Modal
        open={showExtendModal}
        onClose={() => setShowExtendModal(false)}
        title={`Extend Student Deadline: ${activeCharge?.studentName}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            extendMutation.mutate({
              chargeId: activeCharge.id,
              extendedDueAt: extendDate,
              reason: extendReason,
            });
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600">
              Extended Due Date (UTC)
            </label>
            <input
              type="date"
              value={extendDate}
              onChange={(e) => setExtendDate(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600">
              Extension Justification
            </label>
            <textarea
              rows={2}
              value={extendReason}
              onChange={(e) => setExtendReason(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 p-2.5 text-xs"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" type="button" onClick={() => setShowExtendModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={extendMutation.isPending}>
              {extendMutation.isPending ? 'Saving...' : 'Extend Deadline'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
