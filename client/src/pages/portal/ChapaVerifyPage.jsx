import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  ArrowRight,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';

export default function ChapaVerifyPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const txRef = searchParams.get('tx_ref') || searchParams.get('trx_ref') || searchParams.get('reference') || '';
  const portalHash = searchParams.get('hash') || '';

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function verifyPayment() {
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
          body: JSON.stringify({ txRef }),
        });

        const data = await res.json();

        if (res.ok && data.status === 'success') {
          setResult(data);
          // Redirect to official done page after 2 seconds
          if (data.doneHash) {
            setTimeout(() => {
              navigate(`/monthly-payments/done/${data.doneHash}`);
            }, 2000);
          }
        } else {
          setError(data.message || 'Payment verification was unsuccessful or cancelled.');
        }
      } catch {
        setError('Network error while verifying payment with the server. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    verifyPayment();
  }, [txRef, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">Verifying Payment with Chapa...</h2>
              <p className="mt-1 text-xs text-slate-500 max-w-xs mx-auto">
                Communicating with Chapa gateway and confirming transaction #{txRef}. Please do not close this window.
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
                Your monthly fee has been successfully verified and confirmed in the college ledger.
              </p>
            </div>

            <div className="p-6 text-center space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                  Official Receipt Number
                </span>
                <p className="font-mono text-lg font-black text-emerald-950 mt-0.5">
                  {result.receiptNumber}
                </p>
              </div>

              <p className="text-xs text-slate-500">Redirecting to your official receipt slip...</p>

              {result.doneHash && (
                <Link
                  to={`/monthly-payments/done/${result.doneHash}`}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition"
                >
                  <span>View Official Receipt</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div>
            <div className="bg-gradient-to-br from-rose-600 to-pink-700 p-8 text-center text-white">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 shadow-inner backdrop-blur-sm">
                <XCircle className="h-10 w-10 text-white" />
              </div>
              <h2 className="mt-4 text-2xl font-black">Payment Not Completed</h2>
              <p className="mt-1 text-xs text-rose-100 max-w-xs mx-auto">
                The transaction was cancelled, failed on the gateway, or could not be verified.
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-xs text-rose-800">
                <p className="font-bold flex items-center gap-1.5 mb-1">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>Transaction Error Details:</span>
                </p>
                <p className="italic">"{error || 'Verification check failed.'}"</p>
              </div>

              <p className="text-xs text-slate-500 text-center">
                Your bank or wallet balance has not been updated in the college system. You can try again safely.
              </p>

              <div className="flex gap-2">
                {portalHash ? (
                  <Link
                    to={`/monthly-payments/${portalHash}`}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-bold text-white hover:bg-slate-800 transition"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Retry Payment</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-bold text-white hover:bg-slate-800 transition"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Try Verification Again</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
