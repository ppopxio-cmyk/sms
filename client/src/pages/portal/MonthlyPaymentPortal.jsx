import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  CheckCircle2,
  XCircle,
  Calendar,
  CreditCard,
  User,
  ArrowRight,
  Loader2,
  ShieldCheck,
  AlertCircle,
  Clock,
  Sparkles,
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

  // Flow step: 'login' | 'pay'
  const [step, setStep] = useState('login');

  // Login form
  const [studentIdInput, setStudentIdInput] = useState('');
  const [submittingLogin, setSubmittingLogin] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Portal session data
  const [portalToken, setPortalToken] = useState(null);
  const [studentData, setStudentData] = useState(null);
  const [chargeData, setChargeData] = useState(null);
  const [initializingChapa, setInitializingChapa] = useState(false);

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

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!studentIdInput.trim()) {
      setLoginError('Please enter your Student ID / እባክዎ የተማሪ መታወቂያዎን ያስገቡ።');
      return;
    }
    setLoginError('');
    setSubmittingLogin(true);

    try {
      const res = await fetch(`/api/portal/monthly-payments/${hash}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'sms-web',
        },
        body: JSON.stringify({ studentId: studentIdInput.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setLoginError(data.message || 'Unable to identify student record. Please verify your ID.');
        return;
      }

      if (data.alreadyPaid) {
        if (data.doneHash) {
          navigate(`/monthly-payments/done/${data.doneHash}`);
        } else {
          toast.success(data.message || 'This monthly fee has already been paid and confirmed.');
        }
        return;
      }

      setPortalToken(data.portalToken);
      setStudentData(data.student);
      setChargeData(data.charge);
      setStep('pay');
    } catch {
      setLoginError('Network connection failed. Please check your internet connection.');
    } finally {
      setSubmittingLogin(false);
    }
  };

  const handleChapaPay = async () => {
    if (!portalToken) return;
    setInitializingChapa(true);
    try {
      const res = await fetch(`/api/portal/monthly-payments/${hash}/chapa/initialize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'sms-web',
        },
        body: JSON.stringify({ portalToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || 'Unable to initialize online checkout with Chapa. Please verify payment configuration.');
        return;
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast.error('No checkout redirect URL received from payment gateway.');
      }
    } catch {
      toast.error('Network error. Unable to reach Chapa checkout.');
    } finally {
      setInitializingChapa(false);
    }
  };

  if (loadingCycle) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-600" />
          <p className="mt-2 text-sm font-medium text-slate-600">
            Loading monthly payment portal / የክፍያ ገጹ እየተጫነ ነው...
          </p>
        </div>
      </div>
    );
  }

  if (notFound || !cycle) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-lg">
          <AlertCircle className="mx-auto h-12 w-12 text-amber-500" />
          <h1 className="mt-4 text-lg font-bold text-slate-800">
            Payment Portal Unavailable / የክፍያ ገጹ አልተገኘም
          </h1>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            This monthly payment portal link is invalid, not currently open, or has been closed by the Finance Office.
          </p>
          <div className="mt-6">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700"
            >
              Go to Portal Login / ወደ መግቢያ ተመለስ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/60 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-lg">
        {/* Header Branding */}
        <div className="mb-6 text-center">
          <Brand size="lg" className="justify-center" />
          <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Official Student Fee Portal / ይፋዊ የወርሃዊ ክፍያ ፖርታል</span>
          </span>
          <h1 className="mt-2 text-2xl font-black text-slate-900 tracking-tight">
            {cycle.title}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Academic Year {cycle.ethYear} E.C. • {cycle.monthName} Intake
          </p>
        </div>

        {/* Main Card */}
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-xl">
          {/* STEP 1: Student Login Screen */}
          {step === 'login' && (
            <div className="space-y-6">
              <div className="rounded-2xl bg-brand-50/60 p-4 text-center border border-brand-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-800">
                  Monthly Fee Amount / ወርሃዊ ክፍያ
                </p>
                <p className="mt-1 font-mono text-3xl font-extrabold text-slate-900">
                  {cycle.amountEtb} <span className="text-sm font-normal text-slate-500">ETB</span>
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-600">
                  <Clock className="h-3.5 w-3.5 text-brand-600" />
                  <span>Due Date / የመክፈያ ቀን: {formatEthiopian(cycle.dueAt)}</span>
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Student ID / የተማሪ መታወቂያ ቁጥር
                  </label>
                  <div className="relative mt-1.5">
                    <User className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={studentIdInput}
                      onChange={(e) => setStudentIdInput(e.target.value.toUpperCase())}
                      placeholder="e.g. ST-2019-001 or CNUR-EXT-2019-004"
                      className="block w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 font-mono text-sm font-bold uppercase text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
                      autoFocus
                      required
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Enter your official college-assigned Student ID number to retrieve your fee record.
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
                      <span>Continue / ይቀጥሉ</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* STEP 2: Pay Screen (Chapa Direct Online Checkout) */}
          {step === 'pay' && (
            <div className="space-y-6">
              {/* Student identification badge */}
              <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white font-bold text-sm">
                  <User className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {studentData?.fullName}
                  </p>
                  <p className="font-mono text-xs font-semibold text-brand-700">
                    ID / መታወቂያ: {studentData?.studentId}
                  </p>
                </div>
              </div>

              {/* Amount Breakdown Card */}
              <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-5 text-center space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-800">
                  Total Fee Breakdown / የሚከፈል ክፍያ ዝርዝር
                </p>

                {chargeData?.daysOverdue > 0 ? (
                  <div className="rounded-xl bg-white/80 p-3 border border-amber-200 text-left text-xs space-y-1.5">
                    <div className="flex justify-between text-slate-600">
                      <span>Base Monthly Fee / መደበኛ ወርሃዊ ክፍያ:</span>
                      <span className="font-mono font-bold">{chargeData.baseAmountEtb} ETB</span>
                    </div>
                    <div className="flex justify-between text-rose-600 font-semibold">
                      <span>Overdue Penalty ({chargeData.daysOverdue} days) / የዘገየ ቅጣት ({chargeData.daysOverdue} ቀናት):</span>
                      <span className="font-mono">+{chargeData.overduePenaltyEtb} ETB</span>
                    </div>
                    <div className="border-t border-slate-200 pt-1.5 flex justify-between font-bold text-slate-900 text-sm">
                      <span>Total Amount Due / ጠቅላላ ክፍያ:</span>
                      <span className="font-mono text-brand-700">{chargeData.amountEtb} ETB</span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 font-mono text-3xl font-black text-slate-900">
                    {chargeData?.amountEtb} <span className="text-lg font-normal text-slate-500">ETB</span>
                  </p>
                )}

                <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-600">
                  <Calendar className="h-3.5 w-3.5 text-brand-600" />
                  <span>Due by / መክፈያ ቀን: {formatEthiopian(chargeData?.dueAt)}</span>
                </div>
              </div>

              {/* Online Checkout: Chapa (Telebirr / CBEBirr / Cards) */}
              <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/80 p-5 text-center space-y-3.5">
                <div className="flex items-center justify-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-950">
                    Official Instant Online Checkout / ይፋዊ ፈጣን ክፍያ
                  </span>
                </div>
                <p className="text-xs text-emerald-900 leading-relaxed">
                  Pay securely using <strong>Telebirr</strong>, <strong>CBEBirr</strong>, or <strong>Bank Debit/Credit Cards</strong> via Chapa.
                  <br />
                  <span className="text-[11px] text-emerald-800">
                    ክፍያዎ በቴሌብር፣ በሲቢኢ ብር ወይም በባንክ ካርድ በቅጽበት ተረጋግጦ ይረጋገጣል።
                  </span>
                </p>
                <button
                  type="button"
                  disabled={initializingChapa}
                  onClick={handleChapaPay}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white shadow-lg hover:bg-emerald-700 transition disabled:opacity-50 cursor-pointer"
                >
                  {initializingChapa ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Connecting to Chapa / ወደ ቻፓ በማገናኘት ላይ...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4" />
                      <span>Pay {chargeData?.amountEtb} ETB with Chapa / በቻፓ {chargeData?.amountEtb} ብር ይክፈሉ</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={() => setStep('login')}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  ← Back to ID / ተመለስ
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <p className="mt-6 text-center text-xs text-slate-400">
          Official Student Fee Management System • Chapa Payment Gateway (Telebirr & CBEBirr Integrated)
        </p>
      </div>
    </div>
  );
}
