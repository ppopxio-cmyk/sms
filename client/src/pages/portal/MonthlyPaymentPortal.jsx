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
  Hourglass,
  Video,
  Play,
  ChevronDown,
  BookOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import Brand from '../../components/ui/Brand';
import { formatEthiopian } from '../../lib/ethiopianDate';
import { ETH_MONTHS } from '../../lib/ethiopianDate';

function useCountdown(dueAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!dueAt) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [dueAt]);
  if (!dueAt) return null;
  const diff = new Date(dueAt).getTime() - now;
  if (Number.isNaN(diff)) return null;
  return diff > 0 ? diff : 0;
}

function Countdown({ dueAt, overdueLabel = 'Payment window closed' }) {
  const remaining = useCountdown(dueAt);
  if (!remaining) return null;
  const totalSeconds = Math.floor(remaining / 1000);
  if (totalSeconds <= 0) {
    return (
      <div className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-rose-100 px-3 py-1.5 text-xs font-bold text-rose-700">
        <AlertCircle className="h-3.5 w-3.5" />
        <span>{overdueLabel}</span>
      </div>
    );
  }
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const cells = [
    { value: days, label: 'days', labelAm: 'ቀን' },
    { value: hours, label: 'hrs', labelAm: 'ሰpta' },
    { value: minutes, label: 'min', labelAm: 'kkkk' },
    { value: seconds, label: 'sec', labelAm: 'kkkk' },
  ];
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-800">
        <Hourglass className="h-3.5 w-3.5 animate-pulse" />
        <span>Time remaining / የሚቀር ጊዜ</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
        {cells.map((cell) => (
          <div key={cell.label} className="rounded-xl border border-brand-100 bg-white px-1 py-1.5 text-center shadow-sm">
            <p className="font-mono text-base font-black leading-none text-brand-700 sm:text-lg">
              {String(cell.value).padStart(2, '0')}
            </p>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 sm:text-[10px]">
              {cell.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MonthlyPaymentPortal() {
  const { hash } = useParams();
  const navigate = useNavigate();

  // Year -> month picker state
  const [loadingCycles, setLoadingCycles] = useState(true);
  const [years, setYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);

  // Selected cycle state
  const [loadingCycle, setLoadingCycle] = useState(false);
  const [cycle, setCycle] = useState(null);
  const [notFound, setNotFound] = useState(false);

  // Flow step: 'login' | 'pay'
  const [step, setStep] = useState('login');
  const [studentIdInput, setStudentIdInput] = useState('');
  const [submittingLogin, setSubmittingLogin] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [portalToken, setPortalToken] = useState(null);
  const [studentData, setStudentData] = useState(null);
  const [chargeData, setChargeData] = useState(null);
  const [initializingChapa, setInitializingChapa] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadCycles() {
      try {
        const res = await fetch('/api/portal/monthly-payments');
        if (!res.ok) throw new Error('failed');
        const data = await res.json();
        if (!active) return;
        const y = data.years || [];
        setYears(y);
        if (y.length) {
          setSelectedYear(String(y[0].ethYear));
        }
      } catch {
        if (!active) return;
      } finally {
        if (active) setLoadingCycles(false);
      }
    }
    loadCycles();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedYear || !selectedMonth) {
      setCycle(null);
      return;
    }
    let active = true;
    async function loadCycle() {
      setLoadingCycle(true);
      setNotFound(false);
      try {
        const res = await fetch(`/api/portal/monthly-payments/${selectedMonth.slug}`);
        if (!res.ok) {
          if (!active) return;
          setNotFound(true);
          return;
        }
        const data = await res.json();
        if (!active) return;
        setCycle(data.cycle);
      } catch {
        if (!active) return;
        setNotFound(true);
      } finally {
        if (active) setLoadingCycle(false);
      }
    }
    loadCycle();
    return () => { active = false; };
  }, [selectedYear, selectedMonth]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!studentIdInput.trim()) {
      setLoginError('Please enter your Student ID / እበልዎ የተማري መቃወቂያዎን ያስገብ Oc.');
      return;
    }
    setLoginError('');
    setSubmittingLogin(true);

    try {
      const res = await fetch(`/api/portal/monthly-payments/${selectedMonth.slug}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'sms-web' },
        body: JSON.stringify({ studentId: studentIdInput.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setLoginError(data.message || 'Unable to identify student record. Please verify your ID.');
        return;
      }

      if (data.alreadyPaid) {
        if (data.doneHash) {
          try {
            localStorage.setItem('sms-portal-done', JSON.stringify({ paymentId: data.doneHash, hash: selectedMonth.slug }));
          } catch {}
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
      const res = await fetch(`/api/portal/monthly-payments/${selectedMonth.slug}/chapa/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'sms-web' },
        body: JSON.stringify({ portalToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || 'Unable to initialize online checkout with Chapa.');
        return;
      }
      if (data.status === 'already_paid') {
        toast.success(data.message || 'This monthly fee has already been paid and confirmed.');
        if (data.doneHash) {
          try {
            localStorage.setItem('sms-portal-done', JSON.stringify({ paymentId: data.doneHash, hash: selectedMonth.slug }));
          } catch {}
          navigate(`/monthly-payments/done/${data.doneHash}`);
        }
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

  // Back to year selector
  const handleReturnToYear = () => {
    setSelectedMonth(null);
    setStep('login');
    setPortalToken(null);
    setStudentData(null);
    setChargeData(null);
    setStudentIdInput('');
    setLoginError('');
  };

  // Tutorial modal — auto-open on first load
  const [tutorialSeen, setTutorialSeen] = useState(false);
  useEffect(() => {
    if (cycle && !tutorialSeen) {
      setTutorialOpen(true);
      setTutorialSeen(true);
    }
  }, [cycle]);

  const tutorialUrl = 'https://www.youtube.com/embed/dQw4w9WgXcQ'; // replace with real tutorial

  if (loadingCycles) {
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

  if (!cycle) {
    // Year -> Month picker
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto max-w-3xl">
          {/* Header */}
          <div className="mb-8 text-center">
            <Brand size="lg" className="justify-center" />
<span className="mt-3 inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Official Student Fee Portal</span>
          </span>
          <h1 className="mt-3 text-2xl font-black text-slate-900 tracking-tight">
            Choose Your Academic Year & Month
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Select the academic year, then pick the month cycle to pay your fee.
          </p>
          </div>

          {/* Year cards */}
          {years.length > 0 && (
            <div className="space-y-6">
              {years.map((y) => (
                <div key={y.ethYear} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
                        <Calendar className="h-6 w-6" />
                      </div>
                      <div>
<h2 className="text-lg font-bold text-slate-900">{y.ethYear} EC Academic Year</h2>
                    <p className="text-xs text-slate-500">{y.months.length} month cycle{y.months.length === 1 ? '' : 's'} available</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedYear(String(y.ethYear))}
                      className={`rounded-xl px-4 py-2 text-xs font-bold uppercase transition ${
                        selectedYear === String(y.ethYear)
                          ? 'bg-brand-600 text-white'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {selectedYear === String(y.ethYear) ? 'Selected / ተመርጧል' : 'Select / ይምረጡ'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Month grid for selected year */}
          {selectedYear && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900">
                  Available Months for {selectedYear} EC
                </h2>
                <button
                  type="button"
                  onClick={() => setSelectedYear(null)}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  ← Change Year / ዓመት ይቀየሩ
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {years.find((y) => String(y.ethYear) === selectedYear)?.months.map((m) => (
                  <button
                    key={`${m.ethYear}-${m.ethMonth}`}
                    type="button"
                    onClick={() => {
                      setSelectedMonth(m);
                      setTutorialSeen(false);
                    }}
                    disabled={m.status !== 'open'}
                    className={`relative group rounded-2xl border p-4 text-left transition ${
                      m.status === 'open'
                        ? 'border-brand-300 bg-white hover:border-brand-400 hover:shadow-md'
                        : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {m.status !== 'open' && (
                      <span className="absolute top-2 right-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                        {m.status === 'closed' ? 'Closed / የተዘጋጁ' : m.status === 'draft' ? 'Draft / ድራፍት' : 'Unavailable'}
                      </span>
                    )}
                    <div className="flex items-center gap-3">
                      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                        m.status === 'open' ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-400'
                      }`}>
                        <Calendar className="h-6 w-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-900 truncate">{m.title}</h3>
                        <p className="text-xs font-mono text-slate-500">
                          {m.monthName} • Due {formatEthiopian(m.dueAt, { time: true })}
                        </p>
                        <p className="text-xs text-emerald-600 font-medium">
                          {m.amountEtb} ETB
                        </p>
                      </div>
                    </div>
                    {m.status === 'open' && (
                      <ArrowRight className="h-5 w-5 text-brand-500 group-hover:translate-x-1 transition" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {years.length === 0 && (
            <div className="mt-10 rounded-3xl border border-slate-200 bg-white p-10 text-center">
              <Calendar className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="mt-4 text-lg font-semibold text-slate-700">No Payment Cycles Yet</h3>
              <p className="mt-2 text-sm text-slate-500">The Finance Office has not published any monthly payment cycles.</p>
            </div>
          )}

          {/* Tutorial link */}
          <div className="mt-10 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-800 mb-2">
              Need Help? / እርዳታ ያስፈልጋሉ?
            </p>
            <button
              type="button"
              onClick={() => setTutorialOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700"
            >
              <Video className="h-3.5 w-3.5" />
              <span>Watch Tutorial Video / ሁኔታ ተግባር ይመልከቱ</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Cycle selected — login / pay flow
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/60 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <div className="mb-6 text-center">
          <Brand size="lg" className="justify-center" />
<span className="mt-3 inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Official Student Fee Portal</span>
          </span>
          <h1 className="mt-2 text-2xl font-black text-slate-900 tracking-tight">
            {cycle.title}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Academic Year {cycle.ethYear} E.C. • {cycle.monthName} Intake
          </p>

          {/* Embedded tutorial link — top of the cycle page */}
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => setTutorialOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition"
            >
              <Video className="h-3.5 w-3.5" />
              <span>Embedded Tutorial — How to Pay</span>
            </button>
          </div>
        </div>

        {/* Tutorial Modal — auto-open on first visit to this cycle */}
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 transition-opacity ${
            tutorialOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          onClick={() => setTutorialOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tutorial-title"
        >
          <div
            className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl animate-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="tutorial-title" className="text-lg font-bold text-slate-900">
                How to Pay / እንዴት ክፍያ እንደሚሰር
              </h2>
              <button
                type="button"
                onClick={() => setTutorialOpen(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100"
                aria-label="Close tutorial"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <div className="aspect-video w-full rounded-xl bg-slate-100 overflow-hidden">
              <iframe
                src={tutorialUrl}
                title="Payment tutorial"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tutorialSeen}
                  onChange={() => setTutorialSeen(!tutorialSeen)}
                  className="rounded text-brand-600 focus:ring-brand-500"
                />
                <span>Don't show again / እንደገና አትይዘው</span>
              </label>
              <button
                type="button"
                onClick={() => setTutorialOpen(false)}
                className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700"
              >
                Got it, Start Paying / ተረጋግጧል ክፍያን እጀምር
              </button>
            </div>
          </div>
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
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <Clock className="h-3.5 w-3.5 text-brand-600" />
                  <span>
                    Due Date / የመክፈያ ቀን: {formatEthiopian(cycle.dueAt, { time: true })} (EAT)
                  </span>
                </div>
                <Countdown dueAt={cycle.dueAt} />
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

              <button
                type="button"
                onClick={handleReturnToYear}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                <span>Back to Year Selection / ወደ ዓመት መርጫ ተመለስ</span>
              </button>
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

                <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <Calendar className="h-3.5 w-3.5 text-brand-600" />
                  <span>
                    Due by / መክፈያ ቀን: {formatEthiopian(chargeData?.dueAt, { time: true })} (EAT)
                  </span>
                </div>
                <Countdown dueAt={chargeData?.dueAt} />
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

              <div className="flex justify-start gap-2">
                <button
                  type="button"
                  onClick={() => setStep('login')}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  ← Back to ID / ተመለስ
                </button>
                <button
                  type="button"
                  onClick={handleReturnToYear}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Year Selection / ዓመት መርጫ
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-400">
          Official Student Fee Management System • Chapa Payment Gateway (Telebirr & CBEBirr Integrated)
        </p>
      </div>
    </div>
  );
}