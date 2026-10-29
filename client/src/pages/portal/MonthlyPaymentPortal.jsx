import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Building2,
  Calendar,
  CreditCard,
  User,
  ArrowRight,
  Loader2,
  ShieldCheck,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import Brand from '../../components/ui/Brand';
import { formatEthiopian } from '../../lib/ethiopianDate';

export default function MonthlyPaymentPortal() {
  const { hash } = useParams();
  const navigate = useNavigate();

  // Loading & error for portal cycle
  const [loadingCycle, setLoadingCycle] = useState(true);
  const [cycle, setCycle] = useState(null);
  const [notFound, setNotFound] = useState(false);

  // Flow step: 'login' | 'pay' | 'submit' | 'verifying' | 'success' | 'failed'
  const [step, setStep] = useState('login');

  // Login form
  const [studentIdInput, setStudentIdInput] = useState('');
  const [submittingLogin, setSubmittingLogin] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Portal session data
  const [portalToken, setPortalToken] = useState(null);
  const [studentData, setStudentData] = useState(null);
  const [chargeData, setChargeData] = useState(null);

  // Submit receipt form
  const [receiptUrl, setReceiptUrl] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyError, setVerifyError] = useState('');

  // Copy feedback
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadPortal() {
      setLoadingCycle(true);
      setNotFound(false);
      try {
        const res = await fetch(`/api/portal/monthly-payments/${hash}`);
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const data = await res.json();
        setCycle(data.cycle);
      } catch (err) {
        setNotFound(true);
      } finally {
        setLoadingCycle(false);
      }
    }
    if (hash) {
      loadPortal();
    }
  }, [hash]);

  const handleCopyAccount = () => {
    if (!cycle?.bank?.accountNumber) return;
    navigator.clipboard.writeText(cycle.bank.accountNumber);
    setCopied(true);
    toast.success('Account number copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!studentIdInput.trim()) {
      setLoginError('Please enter your Student ID.');
      return;
    }
    setLoginError('');
    setSubmittingLogin(true);

    try {
      const res = await fetch(`/api/portal/monthly-payments/${hash}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: studentIdInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.message || 'Unable to log in with this Student ID.');
        return;
      }

      if (data.alreadyPaid && data.doneHash) {
        toast.success('Your fee is already paid!');
        navigate(`/monthly-payments/done/${data.doneHash}`);
        return;
      }

      if (data.waived) {
        setLoginError('Your monthly fee for this cycle has been waived by the college.');
        return;
      }

      setPortalToken(data.portalToken);
      setStudentData(data.student);
      setChargeData(data.charge);
      setStep('pay');
    } catch (err) {
      setLoginError('Network error. Please check your connection.');
    } finally {
      setSubmittingLogin(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!receiptUrl.trim()) {
      setVerifyError('Please paste your CBE receipt link.');
      return;
    }
    setVerifyError('');
    setVerifying(true);
    setStep('verifying');

    try {
      const res = await fetch(`/api/portal/monthly-payments/${hash}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portalToken,
          receiptUrl: receiptUrl.trim(),
        }),
      });

      const data = await res.json();

      if (data.status === 'success') {
        setVerifyResult(data);
        setStep('success');
        // Wait 2 seconds as specified, then go to done page!
        setTimeout(() => {
          navigate(`/monthly-payments/done/${data.doneHash}`);
        }, 2000);
      } else if (data.status === 'review_required') {
        setVerifyResult(data);
        setVerifyError(data.message);
        setStep('failed');
      } else if (data.status === 'pending_verification') {
        setVerifyResult(data);
        setVerifyError(data.message);
        setStep('failed');
      } else {
        setVerifyResult(data);
        setVerifyError(data.message || 'Verification failed. Please check the receipt URL.');
        setStep('failed');
      }
    } catch (err) {
      setVerifyError('Network error. Could not contact the server.');
      setStep('failed');
    } finally {
      setVerifying(false);
    }
  };

  if (loadingCycle) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
          <p className="text-sm font-medium text-slate-500">Loading payment portal...</p>
        </div>
      </div>
    );
  }

  if (notFound || !cycle) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto h-12 w-12 text-slate-400" />
          <h1 className="mt-4 text-xl font-bold text-slate-800">Not Found</h1>
          <p className="mt-2 text-sm text-slate-500">
            This monthly payment portal is not available, has closed, or has expired.
          </p>
          <div className="mt-6">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Go to College Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex justify-center">
            <Brand size="md" />
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
            {cycle.title}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Monthly Fee Payment & Automated CBE Verification
          </p>
        </div>

        {/* Content Card */}
        <div className="mt-6 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
          {/* STEP 1: Login with Student ID */}
          {step === 'login' && (
            <div>
              <div className="mb-6 rounded-2xl border border-brand-100 bg-brand-50/50 p-4">
                <div className="flex items-center justify-between text-xs text-brand-900">
                  <span className="font-semibold uppercase tracking-wider">Fee Amount</span>
                  <span className="font-mono text-base font-bold text-brand-700">
                    {cycle.amountEtb} ETB
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>Due Date (Ethiopian)</span>
                  <span className="font-medium text-slate-700">
                    {formatEthiopian(cycle.dueAt)}
                  </span>
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Student ID
                  </label>
                  <input
                    type="text"
                    value={studentIdInput}
                    onChange={(e) => setStudentIdInput(e.target.value.toUpperCase())}
                    placeholder="e.g. NUR-2019-001"
                    className="mt-1 block w-full rounded-xl border border-slate-200 px-4 py-3 font-mono text-base uppercase text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
                    autoFocus
                    autoComplete="off"
                    spellCheck="false"
                  />
                  <p className="mt-1.5 text-xs text-slate-400">
                    Enter your official college Student ID to access your fee balance.
                  </p>
                </div>

                {loginError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">
                    {loginError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submittingLogin}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50"
                >
                  {submittingLogin ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <span>Continue</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* STEP 2: Pay Screen (Bank Details & Instructions) */}
          {step === 'pay' && (
            <div className="space-y-6">
              {/* Student identification badge */}
              <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white font-bold text-sm">
                  <User className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">
                    {studentData?.fullName}
                  </p>
                  <p className="font-mono text-xs text-slate-500">
                    ID: {studentData?.studentId}
                  </p>
                </div>
              </div>

              {/* Amount to pay */}
              <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-5 text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                  Required Monthly Fee
                </p>
                <p className="mt-1 font-mono text-3xl font-extrabold text-slate-900">
                  {chargeData?.amountEtb} <span className="text-lg font-normal text-slate-500">ETB</span>
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-brand-800">
                  <Calendar className="h-3.5 w-3.5 text-brand-600" />
                  <span>Due by {formatEthiopian(chargeData?.dueAt)}</span>
                </div>
              </div>

              {/* Bank Details */}
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Official College Bank Details
                </p>

                <div className="mt-3 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Bank</span>
                    <span className="font-semibold text-slate-800">{cycle.bank?.bank}</span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Account Holder</span>
                    <span className="font-semibold text-slate-800 text-right">
                      {cycle.bank?.holderName}
                    </span>
                  </div>

                  <div className="border-t border-slate-100 pt-3">
                    <span className="text-xs text-slate-500">Account Number:</span>
                    <div className="mt-1 flex items-center justify-between rounded-xl bg-slate-50 p-2.5">
                      <span className="font-mono text-base font-bold tracking-wider text-slate-900">
                        {cycle.bank?.accountNumber}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyAccount}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                            <span className="text-emerald-700">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 text-slate-400" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('login')}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep('submit')}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span>I Paid — Submit Receipt</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Submit Screen (Paste CBE Receipt Link) */}
          {step === 'submit' && (
            <div>
              <div className="mb-5 rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Student Name (Read-Only)
                </p>
                <p className="mt-0.5 text-base font-bold text-slate-800">
                  {studentData?.fullName}
                </p>
                <p className="font-mono text-xs text-slate-500">
                  ID: {studentData?.studentId} • Amount: {chargeData?.amountEtb} ETB
                </p>
              </div>

              <form onSubmit={handleVerify} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                    CBE Receipt Link or Token
                  </label>
                  <textarea
                    rows={3}
                    value={receiptUrl}
                    onChange={(e) => setReceiptUrl(e.target.value)}
                    placeholder="https://mbreciept.cbe.com.et/v2-... or https://apps.cbe.com.et:100/..."
                    className="mt-1.5 block w-full rounded-xl border border-slate-200 p-3 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
                    autoFocus
                  />
                  <p className="mt-1.5 text-xs text-slate-500">
                    Paste the complete official CBE digital receipt URL received via SMS, CBE Birr, or CBE Mobile Banking.
                  </p>
                </div>

                {verifyError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">
                    {verifyError}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep('pay')}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Verify Receipt</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* STEP 4: Verifying Spinner */}
          {step === 'verifying' && (
            <div className="py-8 text-center">
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-brand-600" />
              <h2 className="mt-4 text-base font-bold text-slate-800">
                Verifying CBE Receipt...
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Connecting to Commercial Bank of Ethiopia to validate transaction details.
              </p>
            </div>
          )}

          {/* STEP 5: Success Tick */}
          {step === 'success' && (
            <div className="py-8 text-center animate-in fade-in zoom-in duration-300">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <h2 className="mt-4 text-xl font-bold text-slate-800">
                Payment Confirmed!
              </h2>
              <p className="mt-1 text-sm font-mono text-emerald-700">
                Receipt: {verifyResult?.receiptNumber}
              </p>
              <p className="mt-3 text-xs text-slate-400">
                Redirecting to your official confirmation...
              </p>
            </div>
          )}

          {/* STEP 6: Failure / Retry */}
          {step === 'failed' && (
            <div className="py-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <XCircle className="h-8 w-8" />
              </div>
              <h2 className="mt-3 text-lg font-bold text-slate-800">
                Verification Unsuccessful
              </h2>
              <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-left">
                <p className="text-xs font-semibold text-rose-900">Reason:</p>
                <p className="mt-1 text-xs text-rose-800">{verifyError}</p>
              </div>

              <div className="mt-6 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setStep('submit')}
                  className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Try Again
                </button>
                <button
                  type="button"
                  onClick={() => setStep('pay')}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  View Bank Details
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <p className="mt-6 text-center text-xs text-slate-400">
          Official Student Fee Management System • Commercial Bank of Ethiopia Integration
        </p>
      </div>
    </div>
  );
}
