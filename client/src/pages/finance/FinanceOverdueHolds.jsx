import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Search,
  DollarSign,
  Calendar,
  Phone,
  Mail,
  RefreshCw,
  Clock,
  ShieldAlert,
  Bell,
  Send,
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

export default function FinanceOverdueHolds() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Quick modals
  const [activeCharge, setActiveCharge] = useState(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);

  const [payForm, setPayForm] = useState({
    amount: '',
    method: 'cash',
    bankReference: '',
    payerName: '',
  });

  const [extendDate, setExtendDate] = useState('');
  const [extendReason, setExtendReason] = useState('Granted deadline grace period');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['finance', 'overdue', { search, page }],
    queryFn: async () => {
      const res = await api.get('/finance/overdue', {
        params: { search: search || undefined, page, limit: 25 },
      });
      return res.data;
    },
  });

  const payMutation = useMutation({
    mutationFn: async ({ chargeId, data }) => {
      const res = await api.post(`/finance/charges/${chargeId}/pay`, {
        ...data,
        amount: Math.round(parseFloat(data.amount) * 100),
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Payment recorded and student hold lifted!');
      setShowPayModal(false);
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const extendMutation = useMutation({
    mutationFn: async ({ chargeId, extendedDueAt, reason }) => {
      const res = await api.post(`/finance/charges/${chargeId}/extend`, {
        extendedDueAt,
        reason,
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Deadline extended and hold temporarily lifted.');
      setShowExtendModal(false);
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const notifyMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/finance/overdue/notify');
      return res.data;
    },
    onSuccess: (res) => {
      toast.success(res.message || 'Overdue alert notices dispatched successfully.');
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to dispatch notices.')),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overdue Accounts & Academic Holds"
        subtitle="Students currently blocked from assessment submissions, teacher result recording, ID card issuance, and graduation eligibility due to unpaid fees."
        icon={AlertTriangle}
      />

      {/* Toolbar */}
      <Card>
        <CardBody className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search blocked students by name or ID..."
                className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </Button>

              <Button
                size="sm"
                className="bg-rose-600 hover:bg-rose-700 text-white gap-1.5"
                onClick={() => notifyMutation.mutate()}
                loading={notifyMutation.isPending}
                disabled={!data?.overdue?.length}
                title="Dispatch in-app notifications and warnings to overdue students, their assigned course teachers, and the Registrar."
              >
                <Bell className="h-3.5 w-3.5" />
                <span>Notify Students, Teachers & Registrar</span>
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Holds Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="p-6">
              <SkeletonRows rows={6} />
            </div>
          ) : !data?.overdue?.length ? (
            <div className="p-10">
              <EmptyState
                icon={AlertTriangle}
                title="No active academic holds"
                message="All targeted students have settled their monthly fees or have active waivers/extensions."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-3.5 pl-6 pr-4">Student</th>
                    <th className="py-3.5 px-4">Overdue Cycle</th>
                    <th className="py-3.5 px-4">Amount Due</th>
                    <th className="py-3.5 px-4">Due Date</th>
                    <th className="py-3.5 px-4">Days Overdue</th>
                    <th className="py-3.5 px-4">Contact</th>
                    <th className="py-3.5 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.overdue.map((charge) => (
                    <tr key={charge.id} className="transition hover:bg-slate-50/70">
                      <td className="py-3.5 pl-6 pr-4">
                        <Link
                          to={`/accountant/students/${charge.student?._id || charge.student}`}
                          className="font-semibold text-slate-800 hover:text-brand-600"
                        >
                          {charge.studentName}
                        </Link>
                        <p className="font-mono text-xs text-slate-400">
                          {charge.studentId} • {charge.programme || charge.department}
                        </p>
                      </td>

                      <td className="py-3.5 px-4 font-medium text-slate-800 text-xs">
                        {charge.cycle?.title}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-rose-700">
                        {charge.amountDueEtb} ETB
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        {formatEthiopian(charge.dueAt)}
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge tone="rose">
                          {charge.daysOverdue} DAYS OVERDUE
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {charge.student?.phone ? (
                          <div className="flex items-center gap-1 font-mono">
                            <Phone className="h-3 w-3 text-slate-400" />
                            <span>{charge.student.phone}</span>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>

                      <td className="py-3.5 pr-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
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
                            <span>Clear (Pay)</span>
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
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* QUICK PAY MODAL */}
      <Modal
        open={showPayModal}
        onClose={() => setShowPayModal(false)}
        title={`Settle Overdue Fee & Lift Hold: ${activeCharge?.studentName}`}
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
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600">
              Payment Method
            </label>
            <select
              value={payForm.method}
              onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="cash">Cash Settlement (College Cashier)</option>
              <option value="manual">Manual Bank Transfer / Slip</option>
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
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600">
              Bank Ref / Cash Receipt #
            </label>
            <input
              type="text"
              value={payForm.bankReference}
              onChange={(e) => setPayForm({ ...payForm, bankReference: e.target.value })}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={() => setShowPayModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={payMutation.isPending}>
              {payMutation.isPending ? 'Processing...' : 'Confirm & Lift Hold'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* EXTEND MODAL */}
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
              New Due Date (UTC)
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

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={() => setShowExtendModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={extendMutation.isPending}>
              {extendMutation.isPending ? 'Extending...' : 'Extend & Lift Hold'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
