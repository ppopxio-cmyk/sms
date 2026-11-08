import { useParams, Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
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
  ShieldAlert,
  Download,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { printStudentFeeStatement } from '../../lib/printVoucher';
import { downloadExport } from '../../lib/download';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { SkeletonPage } from '../../components/ui/Skeleton';
import { formatEthiopian } from '../../lib/ethiopianDate';
import { toast } from 'sonner';

export default function StudentFinanceProfile({ readOnly = false }) {
  const { id } = useParams();
  const location = useLocation();
  const isRegistrar = readOnly || location.pathname.startsWith('/registrar');
  const [exporting, setExporting] = useState('');
  const [imgError, setImgError] = useState(false);

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
  const ethiopianMatrix = data?.ethiopianMatrix || {};
  const charges = data?.charges || [];
  const payments = data?.payments || [];
  const waivers = data?.waivers || [];
  const holdStatus = summary.holdStatus || {};

  const backLink = isRegistrar ? `/registrar/students/${id}` : '/accountant/collections';
  const backLabel = isRegistrar ? '← Back to Student Record' : '← Back to Collections';

  const fullName = student.fullName || student.name || 'Student';
  const photoUrl = student.photo?.url || student.photo?.filePath || null;
  const departmentName = student.department?.name || student.department || '—';
  const programmeName = student.program?.name || student.programme || '—';
  const batchName = student.batch?.name || student.batch || '—';

  const handleExport = async (format) => {
    setExporting(format);
    try {
      await downloadExport(
        `/finance/students/${id}/export?format=${format}`,
        `Fee-Statement-${student.studentId || 'student'}.${format}`,
      );
      toast.success(`${format.toUpperCase()} statement downloaded.`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not generate the export.'));
    } finally {
      setExporting('');
    }
  };

  const handlePrintStatement = () => {
    printStudentFeeStatement({
      student: {
        fullName,
        studentId: student.studentId,
        department: departmentName,
        programme: programmeName,
        batch: batchName,
      },
      summary,
      charges,
      payments,
      printedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link to={backLink} className="hover:text-slate-800 font-medium">
            {backLabel}
          </Link>
        </div>
        {isRegistrar && (
          <Badge tone="indigo">Registrar View (Academic Clearance)</Badge>
        )}
      </div>

      {/* Student Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-2xl font-bold text-slate-600 shadow-sm overflow-hidden border border-slate-200">
            {photoUrl && !imgError ? (
              <img
                src={photoUrl}
                alt={fullName}
                className="h-full w-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <User className="h-10 w-10 text-slate-400" />
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{fullName}</h1>
              {holdStatus.hasHold ? (
                <Badge tone="rose">ACADEMIC HOLD — DOCUMENTS BLOCKED</Badge>
              ) : (
                <Badge tone="emerald">FEES IN GOOD STANDING</Badge>
              )}
            </div>

            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
              <span className="font-mono font-semibold text-slate-800">ID: {student.studentId || '—'}</span>
              <span><strong className="text-slate-500">Department:</strong> {departmentName}</span>
              <span><strong className="text-slate-500">Programme:</strong> {programmeName}</span>
              <span><strong className="text-slate-500">Batch:</strong> {batchName}</span>
              {student.studentCategory && <span><strong className="text-slate-500">Category:</strong> {student.studentCategory}</span>}
            </div>

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
              {student.sex && student.sex !== 'unspecified' && (
                <div className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <span className="capitalize">{student.sex}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <Button variant="outline" size="sm" onClick={handlePrintStatement}>
            <Printer className="h-4 w-4" />
            <span>Print Statement</span>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" disabled={Boolean(exporting)} onClick={() => handleExport('pdf')}>
              <Download className="h-4 w-4" />
              <span>{exporting === 'pdf' ? 'PDF…' : 'PDF'}</span>
            </Button>
            <Button variant="outline" size="sm" disabled={Boolean(exporting)} onClick={() => handleExport('docx')}>
              <FileText className="h-4 w-4" />
              <span>{exporting === 'docx' ? 'Word…' : 'Word'}</span>
            </Button>
            <Button variant="outline" size="sm" disabled={Boolean(exporting)} onClick={() => handleExport('xlsx')}>
              <FileSpreadsheet className="h-4 w-4" />
              <span>{exporting === 'xlsx' ? 'Excel…' : 'Excel'}</span>
            </Button>
          </div>
        </div>
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

      {/* 13 Ethiopian Months Payment Matrix */}
      <Card>
        <CardHeader
          title="13 Ethiopian Months Payment Matrix"
          subtitle="Full historical payment standing across all 13 Ethiopian calendar months (Meskerem to Pagume) for each academic year."
          icon={Calendar}
        />
        <CardBody className="space-y-6">
          {Object.keys(ethiopianMatrix).length === 0 ? (
            <p className="text-center py-6 text-xs text-slate-400">No payment cycles or records found for this student.</p>
          ) : (
            Object.entries(ethiopianMatrix).map(([year, months]) => (
              <div key={year} className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="text-sm font-bold text-slate-800">
                    Ethiopian Academic Year {year}
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">13 Calendar Months</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 lg:grid-cols-13 gap-2">
                  {months.map((m) => {
                    const isPaid = m.status === 'paid';
                    const isWaived = m.status === 'waived';
                    const isOverdue = m.status === 'overdue';
                    const isUnpaid = m.status === 'unpaid';
                    const isNone = m.status === 'none';

                    return (
                      <div
                        key={m.month}
                        className={`rounded-xl border p-2 text-center flex flex-col justify-between min-h-[90px] transition ${
                          isPaid
                            ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900'
                            : isWaived
                            ? 'border-purple-200 bg-purple-50/60 text-purple-900'
                            : isOverdue
                            ? 'border-rose-300 bg-rose-50 text-rose-900 shadow-sm'
                            : isUnpaid
                            ? 'border-amber-200 bg-amber-50/60 text-amber-900'
                            : 'border-slate-100 bg-slate-50/40 text-slate-400'
                        }`}
                        title={m.receiptNumber ? `Receipt #${m.receiptNumber}` : m.waiverReason || undefined}
                      >
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {m.month}. {m.name}
                          </p>
                          <span
                            className={`inline-block mt-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                              isPaid
                                ? 'bg-emerald-200/70 text-emerald-800'
                                : isWaived
                                ? 'bg-purple-200/70 text-purple-800'
                                : isOverdue
                                ? 'bg-rose-200 text-rose-800'
                                : isUnpaid
                                ? 'bg-amber-200/70 text-amber-800'
                                : 'bg-slate-200/50 text-slate-500'
                            }`}
                          >
                            {m.label}
                          </span>
                        </div>

                        {m.amountDueEtb ? (
                          <p className="mt-2 font-mono text-[11px] font-semibold">
                            {m.amountDueEtb} ETB
                          </p>
                        ) : (
                          <p className="mt-2 text-[10px] text-slate-400">—</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </CardBody>
      </Card>

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
