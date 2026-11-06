import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  CheckCircle2,
  Printer,
  ExternalLink,
  Building2,
  Calendar,
  FileCheck2,
  Loader2,
  AlertCircle,
  Clock,
  RotateCcw,
} from 'lucide-react';
import Brand from '../../components/ui/Brand';
import { formatEthiopian } from '../../lib/ethiopianDate';

export default function MonthlyPaymentDone() {
  const { paymentId } = useParams();
  const [loading, setLoading] = useState(true);
  const [confirmation, setConfirmation] = useState(null);
  const [status, setStatus] = useState('pending'); // 'success' | 'pending' | 'failed'
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let timer = null;

    async function fetchPaymentStatus() {
      try {
        const res = await fetch(`/api/portal/monthly-payments/done/${paymentId}`);
        const data = await res.json();

        if (res.status === 202 || data.status === 'pending') {
          setStatus('pending');
          setMessage(data.message || 'Payment is still being processed by Chapa. Checking again shortly...');
          setLoading(false);
          // Auto-refresh status every 4 seconds if pending
          timer = setTimeout(fetchPaymentStatus, 4000);
          return;
        }

        if (res.ok && data.status === 'success' && data.confirmation) {
          setConfirmation(data.confirmation);
          setStatus('success');
          setLoading(false);
          return;
        }

        setStatus('failed');
        setMessage(data.message || 'Payment verification was unsuccessful.');
        setError(true);
        setLoading(false);
      } catch {
        setStatus('failed');
        setMessage('Network error while verifying payment status.');
        setError(true);
        setLoading(false);
      }
    }

    if (paymentId) {
      fetchPaymentStatus();
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [paymentId]);

  const handlePrint = () => {
    window.print();
  };

  if (loading || status === 'pending') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900">
              {status === 'pending' ? 'Waiting for Chapa Confirmation...' : 'Verifying Payment Result...'}
            </h1>
            <p className="mt-2 text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
              {message || 'Communicating with payment gateway and college ledger. This page will update automatically.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error || status === 'failed' || !confirmation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <AlertCircle className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900">Payment Not Completed</h1>
            <p className="mt-2 text-xs text-rose-600 font-medium max-w-xs mx-auto">
              "{message || 'The transaction was cancelled, failed, or could not be verified.'}"
            </p>
          </div>
          <div className="pt-2">
            <Link
              to="/"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-bold text-white hover:bg-slate-800 transition"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Return to Portal</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 print:bg-white print:p-0">
      <div className="mx-auto max-w-xl">
        {/* Print & external receipt toolbar (hidden during print) */}
        <div className="mb-4 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer"
            >
              <Printer className="h-4 w-4 text-slate-500" />
              <span>Print Receipt</span>
            </button>
            {confirmation.chapaReceiptUrl && (
              <a
                href={confirmation.chapaReceiptUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
              >
                <ExternalLink className="h-4 w-4" />
                <span>View Chapa Official Receipt</span>
              </a>
            )}
          </div>
        </div>

        {/* Printable Official Receipt Card */}
        <div className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm print:rounded-none print:border-none print:shadow-none">
          {/* Top Banner */}
          <div className="border-b border-emerald-100 bg-emerald-50/70 p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h1 className="mt-3 text-xl font-bold text-slate-900">
              Official Payment Receipt
            </h1>
            <p className="font-mono text-sm font-semibold text-emerald-800">
              {confirmation.receiptNumber}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Confirmed & Recorded in College Fee Register
            </p>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            {/* Header info */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-5">
              <div>
                <Brand size="sm" />
                <p className="mt-1 text-xs text-slate-500">Haramaya Health Science College</p>
              </div>
              <div className="text-right">
                <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                  PAID & VERIFIED
                </span>
                <p className="mt-1 text-xs text-slate-400">
                  Method: {confirmation.method.toUpperCase()}
                </p>
              </div>
            </div>

            {/* Student & Payment Summary Grid */}
            <div className="grid grid-cols-2 gap-4 rounded-2xl bg-slate-50 p-4 text-xs">
              <div>
                <p className="font-semibold uppercase tracking-wider text-slate-400">
                  Student Name
                </p>
                <p className="mt-0.5 text-sm font-bold text-slate-800">
                  {confirmation.student?.fullName}
                </p>
              </div>

              <div>
                <p className="font-semibold uppercase tracking-wider text-slate-400">
                  Student ID
                </p>
                <p className="mt-0.5 font-mono text-sm font-bold text-slate-800">
                  {confirmation.student?.studentId}
                </p>
              </div>

              <div>
                <p className="font-semibold uppercase tracking-wider text-slate-400">
                  Payment Cycle
                </p>
                <p className="mt-0.5 font-medium text-slate-800">
                  {confirmation.cycle?.title}
                </p>
              </div>

              <div>
                <p className="font-semibold uppercase tracking-wider text-slate-400">
                  Payment Date (Ethiopian)
                </p>
                <p className="mt-0.5 font-medium text-slate-800">
                  {formatEthiopian(confirmation.paidAt, { time: true })}
                </p>
              </div>
            </div>

            {/* Financial Details Table */}
            <div className="border-t border-b border-slate-100 py-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-600">
                  Monthly Tuition / Fee ({confirmation.cycle?.title})
                </span>
                <span className="font-mono text-base font-bold text-slate-900">
                  {confirmation.amountEtb} ETB
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>Transaction Reference (Chapa / Bank)</span>
                <span className="font-mono font-medium text-slate-800">
                  {confirmation.bankReference}
                </span>
              </div>

              {confirmation.chapaReference && (
                <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
                  <span>Chapa Reference ID</span>
                  <span className="font-mono font-medium text-emerald-700">
                    {confirmation.chapaReference}
                  </span>
                </div>
              )}

              <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
                <span>Payer Name on Record</span>
                <span className="font-medium text-slate-800">
                  {confirmation.payerName}
                </span>
              </div>

              <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
                <span>College Receiving Account</span>
                <span className="font-mono font-medium text-slate-800">
                  {confirmation.bank?.accountNumber} ({confirmation.bank?.bank})
                </span>
              </div>
            </div>

            {/* Total Paid banner */}
            <div className="flex items-center justify-between rounded-2xl bg-brand-50 p-4">
              <div>
                <p className="text-xs font-semibold text-brand-900">Total Settled Amount</p>
                <p className="text-[11px] text-brand-700">All academic restrictions for this cycle cleared</p>
              </div>
              <p className="font-mono text-2xl font-extrabold text-brand-700">
                {confirmation.amountEtb} ETB
              </p>
            </div>

            {/* Verification Seal */}
            <div className="flex items-center gap-3 border-t border-slate-100 pt-4 text-xs text-slate-400">
              <FileCheck2 className="h-5 w-5 text-emerald-600" />
              <p>
                This is a computer-generated digital receipt issued via the College Student Management System and validated against Commercial Bank of Ethiopia records.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
