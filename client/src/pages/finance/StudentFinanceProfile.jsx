import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  User,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  CreditCard,
  Gift,
  FileCheck2,
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  Printer,
} from 'lucide-react';
import { api } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { SkeletonPage } from '../../components/ui/Skeleton';
import { formatEthiopian } from '../../lib/ethiopianDate';

export default function StudentFinanceProfile() {
  const { id } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'student', id],
    queryFn: async () => {
      const res = await api.get(`/finance/students/${id}`);
      return res.data;
    },
  });

  if (isLoading) {
    return <SkeletonPage cards={3} />;
  }

  const student = data?.student || {};
  const summary = data?.summary || {};
  const charges = data?.charges || [];
  const payments = data?.payments || [];
  const waivers = data?.waivers || [];
  const holdStatus = summary.holdStatus || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link to="/accountant/collections" className="hover:text-slate-800">
          ← Back to Collections
        </Link>
      </div>

      {/* Student Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white shadow-sm overflow-hidden">
            {student.photo?.url || student.photo?.filePath ? (
              <img
                src={student.photo.url || student.photo.filePath}
                alt={student.fullName}
                className="h-full w-full object-cover"
              />
            ) : (
              (student.fullName || 'S')[0]
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{student.fullName}</h1>
              {holdStatus.hasHold ? (
                <Badge tone="rose">ACADEMIC HOLD ACTIVE</Badge>
              ) : (
                <Badge tone="emerald">FEES IN GOOD STANDING</Badge>
              )}
            </div>

            <p className="font-mono text-xs text-slate-500 mt-0.5">
              ID: {student.studentId} • {student.program?.name || student.department?.name || 'Department'} • {student.batch?.name || 'Batch'}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
              {student.phone && (
                <div className="flex items-center gap-1 font-mono">
                  <Phone className="h-3.5 w-3.5 text-slate-400" />
                  <span>{student.phone}</span>
                </div>
              )}
              {student.email && (
                <div className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  <span>{student.email}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          <span>Print Statement</span>
        </Button>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-400">Total Billed</p>
          <p className="mt-1 font-mono text-2xl font-bold text-slate-900">
            {summary.totalBilledEtb || '0.00'} ETB
          </p>
          <p className="mt-1 text-xs text-slate-500">{charges.length} fee cycles assigned</p>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-emerald-700">Total Settled</p>
          <p className="mt-1 font-mono text-2xl font-bold text-emerald-800">
            {summary.totalPaidEtb || '0.00'} ETB
          </p>
          <p className="mt-1 text-xs text-emerald-600">{payments.length} confirmed payments</p>
        </div>

        <div className="rounded-2xl border border-purple-100 bg-purple-50/50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-purple-700">Total Waived</p>
          <p className="mt-1 font-mono text-2xl font-bold text-purple-800">
            {summary.totalWaivedEtb || '0.00'} ETB
          </p>
          <p className="mt-1 text-xs text-purple-600">{waivers.length} exemptions granted</p>
        </div>

        <div className={`rounded-2xl border p-5 shadow-sm ${holdStatus.hasHold ? 'border-rose-200 bg-rose-50/60' : 'border-slate-200 bg-white'}`}>
          <p className={`text-xs font-semibold uppercase ${holdStatus.hasHold ? 'text-rose-700' : 'text-slate-400'}`}>
            Outstanding Balance
          </p>
          <p className={`mt-1 font-mono text-2xl font-bold ${holdStatus.hasHold ? 'text-rose-800' : 'text-slate-800'}`}>
            {summary.outstandingEtb || '0.00'} ETB
          </p>
          <p className={`mt-1 text-xs ${holdStatus.hasHold ? 'text-rose-600 font-medium' : 'text-slate-500'}`}>
            {holdStatus.hasHold ? `${holdStatus.overdueCount} cycle(s) overdue` : 'No overdue charges'}
          </p>
        </div>
      </div>

      {/* Charges Ledger Table */}
      <Card>
        <CardHeader
          title="Monthly Fee Cycles & Charges"
          subtitle="All monthly charges billed to this student's account."
          icon={Calendar}
        />
        <CardBody className="p-0">
          {!charges.length ? (
            <p className="p-8 text-center text-xs text-slate-400">
              No charges recorded for this student.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase text-slate-400">
                    <th className="py-3 px-6">Cycle</th>
                    <th className="py-3 px-4">Amount Due</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Due Date</th>
                    <th className="py-3 px-4">Settlement Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {charges.map((c) => (
                    <tr key={c.id}>
                      <td className="py-3.5 px-6 font-medium text-slate-800">
                        {c.cycle?.title || 'Fee Cycle'}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {c.amountDueEtb} ETB
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge
                          tone={
                            c.status === 'paid'
                              ? 'emerald'
                              : c.status === 'waived'
                              ? 'purple'
                              : new Date(c.dueAt) < new Date()
                              ? 'rose'
                              : 'neutral'
                          }
                        >
                          {c.status.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        {formatEthiopian(c.dueAt)}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono text-slate-600">
                        {c.payment?.receiptNumber || (c.waiver ? `WAIVER (${c.waiver.reason})` : '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Confirmed Payments Table */}
      <Card>
        <CardHeader
          title="Payment History & Digital Receipts"
          subtitle="Official payments verified and credited to this student."
          icon={FileCheck2}
        />
        <CardBody className="p-0">
          {!payments.length ? (
            <p className="p-8 text-center text-xs text-slate-400">
              No payments recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase text-slate-400">
                    <th className="py-3 px-6">Receipt #</th>
                    <th className="py-3 px-4">Cycle</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Method & Bank Ref</th>
                    <th className="py-3 px-4">Date Paid</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="py-3.5 px-6 font-mono font-bold text-brand-600">
                        {p.receiptNumber}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-700">
                        {p.cycle?.title}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {p.amountEtb} ETB
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        <span className="font-medium text-slate-800">{p.method.toUpperCase()}</span>
                        <span className="block font-mono text-[11px] text-slate-400">{p.bankReference}</span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        {formatEthiopian(p.paidAt, { time: true })}
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge tone={p.status === 'confirmed' ? 'emerald' : 'rose'}>
                          {p.status.toUpperCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
