import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';

export default function ChapaVerifyPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const txRef = searchParams.get('tx_ref') || searchParams.get('trx_ref') || searchParams.get('reference') || '';
  const portalHash = searchParams.get('hash') || '';

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const verifyPayment = useCallback(async () => {
    if (!txRef) {
      setError('Missing payment transaction reference (tx_ref).');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/portal/monthly-payments/chapa/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'sms-web',
        },
        // Do not send a student portal token here. The Chapa return is a public,
        // transaction-reference-based confirmation flow.
        body: JSON.stringify({ txRef }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.status === 'success') {
        setResult(data);
        setError('');
        if (data.doneHash) {
          window.setTimeout(() => {
            navigate(`/monthly-payments/done/${data.doneHash}`);
          }, 1800);
        }
      } else {
        setResult(null);
        setError(data.message || 'We could not confirm this transaction yet.');
      }
    } catch {
      setResult(null);
      setError('The confirmation service could not be reached. Your payment status may still be updating.');
    } finally {
      setLoading(false);
    }
  }, [txRef, navigate]);

  useEffect(() => {
    verifyPayment();
  }, [verifyPayment]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">Confirming Your Payment...</h2>
              <p className="mt-1 text-xs text-slate-500 max-w-xs mx-auto">
                Checking the college payment ledger for transaction #{txRef}. Please do not close this window.
              </p>
            </div>
          </div>
        ) : result && result.status === 'success' ? (
          <div>
            <div className="bg-gradient-to-br from-emerald-600 to-teal-800 p-8 text-center text-white">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 shadow-inner backdrop-blur-sm">
                <CheckCircle2 className="h-10 w-10 text-white" />
              </div>
              <h2 className="mt-4 text-2xl font-black">Payment Confirmed!</h2>
              <p className="mt-1 text-xs text-emerald-100">
                Your monthly fee is confirmed in the college payment ledger.
              </p>
            </div>

            <div className="p-6 text-center space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                  Official Receipt Number
                </span>
                <p className="font-mono text-lg font-black text-emerald-950 mt-0.5">
                  {result.receiptNumber || 'Confirmed'}
                </p>
              </div>

              {result.doneHash ? (
                <>
                  <p className="text-xs text-slate-500">Your official receipt is ready.</p>
                  <Link
                    to={`/monthly-payments/done/${result.doneHash}`}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition"
                  >
                    <span>View Official Receipt</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </>
              ) : (
                <p className="text-xs text-slate-500">The college ledger confirms this payment. Contact the finance office for your receipt reference.</p>
              )}
            </div>
          </div>
        ) : (
          <div>
            <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-8 text-center text-white">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 shadow-inner backdrop-blur-sm">
                <AlertCircle className="h-10 w-10 text-white" />
              </div>
              <h2 className="mt-4 text-2xl font-black">Payment Status Not Confirmed</h2>
              <p className="mt-1 text-xs text-amber-50 max-w-xs mx-auto">
                We could not confirm this transaction on the return page.
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-900">
                <p className="font-bold flex items-center gap-1.5 mb-1">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Verification Details</span>
                </p>
                <p className="italic">&quot;{error || 'Verification check failed.'}&quot;</p>
              </div>

              <p className="text-xs leading-5 text-slate-600 text-center">
                This message does not prove that your payment failed. Chapa may have completed the payment while the confirmation request was interrupted. <strong>Do not pay again yet.</strong> Check the same transaction again below, or contact the college finance office and provide the transaction reference.
              </p>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Transaction Reference</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-800">{txRef || 'Not available'}</p>
              </div>

              <button
                type="button"
                onClick={verifyPayment}
                disabled={loading || !txRef}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-bold text-white hover:bg-slate-800 transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Check This Payment Again</span>
              </button>

              {portalHash && (
                <Link
                  to={`/monthly-payments/${portalHash}`}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 py-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Return to Payment Portal
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
