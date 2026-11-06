import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  CheckCircle2,
  XCircle,
  X,
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
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import Brand from '../../components/ui/Brand';
import { formatEthiopian } from '../../lib/ethiopianDate';

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
    { value: hours, label: 'hrs', labelAm: 'ሰዓት' },
    { value: minutes, label: 'min', labelAm: 'ደቂቃ' },
    { value: seconds, label: 'sec', labelAm: 'ሰከንድ' },
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

function getYouTubeEmbedUrl(url) {
  if (!url) return '';
  try {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = String(url).match(regExp);
    return match && match[2].length === 11
      ? `https://www.youtube-nocookie.com/embed/${match[2]}?autoplay=1&rel=0`
      : url;
  } catch {
    return url;
  }
}

export default function MonthlyPaymentPortal() {
  const { hash } = useParams();
  const navigate = useNavigate();

  // Mode 1: All years & months picker (when on /monthly-payments without a hash)
  const isAllCyclesPage = !hash || !hash.trim();

  const [loadingCycles, setLoadingCycles] = useState(isAllCyclesPage);
  const [years, setYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);

  // Mode 2: Specific month cycle page (when on /monthly-payments/:hash)
  const [loadingCycle, setLoadingCycle] = useState(!isAllCyclesPage);
  const [cycle, setCycle] = useState(null);
  const [notFound, setNotFound] = useState(false);

  // Student checkout flow inside a cycle: 'login' | 'pay'
  const [step, setStep] = useState('login');
  const [studentIdInput, setStudentIdInput] = useState('');
  const [submittingLogin, setSubmittingLogin] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [portalToken, setPortalToken] = useState(null);
  const [studentData, setStudentData] = useState(null);
  const [chargeData, setChargeData] = useState(null);
  const [initializingChapa, setInitializingChapa] = useState(false);

  // Video Tutorial Modal
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [dontShowTutorialAgain, setDontShowTutorialAgain] = useState(false);

  // 1. Fetch all cycles if viewing /monthly-payments
  useEffect(() => {
    if (!isAllCyclesPage) return;
    let active = true;
    setLoadingCycles(true);
    async function loadAllCycles() {
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
    loadAllCycles();
    return () => {
      active = false;
    };
  }, [isAllCyclesPage]);

  // 2. Fetch specific cycle if viewing /monthly-payments/:hash
  useEffect(() => {
    if (isAllCyclesPage) {
      setCycle(null);
      setNotFound(false);
      setLoadingCycle(false);
      return;
    }

    let active = true;
    const cleanHash = hash.trim();
    setLoadingCycle(true);
    setNotFound(false);

    async function loadSpecificCycle() {
      try {
        const res = await fetch(`/api/portal/monthly-payments/${cleanHash}`);
        if (!res.ok) {
          if (!active) return;
          setNotFound(true);
          return;
        }
        const data = await res.json();
        if (!active) return;
        setCycle(data.cycle);

        // Auto-open video tutorial on first visit if video URL is present and not dismissed
        if (data.cycle?.tutorialVideoUrl) {
          try {
            const dismissed = localStorage.getItem('sms-tutorial-dismissed') === '1';
            if (!dismissed) {
              setTutorialOpen(true);
            }
          } catch {}
        }
      } catch {
        if (!active) return;
        setNotFound(true);
      } finally {
        if (active) setLoadingCycle(false);
      }
    }

    loadSpecificCycle();
    return () => {
      active = false;
    };
  }, [hash, isAllCyclesPage]);

  const handleCloseTutorial = (neverShowAgain = false) => {
    if (neverShowAgain || dontShowTutorialAgain) {
      try {
        localStorage.setItem('sms-tutorial-dismissed', '1');
      } catch {}
    }
    setTutorialOpen(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!studentIdInput.trim()) {
      setLoginError('Please enter your Student ID / እባክዎ የተማሪ መታወቂያዎን ያስገቡ።');
      return;
    }
    setLoginError('');
    setSubmittingLogin(true);

    const activeSlug = cycle?.slug || cycle?.portalHash || hash;

    try {
      const res = await fetch(`/api/portal/monthly-payments/${activeSlug}/login`, {
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
            localStorage.setItem('sms-portal-done', JSON.stringify({ paymentId: data.doneHash, hash: activeSlug }));
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
    const activeSlug = cycle?.slug || cycle?.portalHash || hash;

    try {
      const res = await fetch(`/api/portal/monthly-payments/${activeSlug}/chapa/initialize`, {
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
            localStorage.setItem('sms-portal-done', JSON.stringify({ paymentId: data.doneHash, hash: activeSlug }));
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

  // ==========================================
  // VIEW A: ALL YEARS & MONTHS PICKER
  // (Rendered when URL is /monthly-payments)
  // ==========================================
  if (isAllCyclesPage) {
    if (loadingCycles) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-600" />
            <p className="mt-2 text-sm font-medium text-slate-600">
              Loading payment cycles / የክፍያ ገጹ እየተጫነ ነው...
            </p>
          </div>
        </div>
      );
    }

    const activeYearCycles = years.find((y) => String(y.ethYear) === selectedYear)?.months || [];
    const anyTutorialVideo = years.flatMap((y) => y.months).find((m) => m.tutorialVideoUrl)?.tutorialVideoUrl;

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
              Choose Your Academic Year & Month / የትምህርት ዓመት እና ወር ይምረጡ
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Select your academic year, then click the month cycle to proceed with your student fee payment.
            </p>

            {/* Optional video tutorial link on the main index page */}
            {anyTutorialVideo && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => setTutorialOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition"
                >
                  <Video className="h-3.5 w-3.5 text-red-500" />
                  <span>Watch Tutorial Video / አጋዥ ቪዲዮ ይመልከቱ</span>
                </button>
              </div>
            )}
          </div>

          {/* Academic Year Selector Cards */}
          {years.length > 0 ? (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2">
                {years.map((y) => (
                  <div
                    key={y.ethYear}
                    onClick={() => setSelectedYear(String(y.ethYear))}
                    className={`cursor-pointer rounded-2xl border p-4 transition ${
                      selectedYear === String(y.ethYear)
                        ? 'border-brand-500 bg-brand-50/50 shadow-sm ring-2 ring-brand-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                            selectedYear === String(y.ethYear)
                              ? 'bg-brand-600 text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <Calendar className="h-5 w-5" />
                        </div>
                        <div>
                          <h2 className="text-base font-bold text-slate-900">
                            {y.ethYear} EC Academic Year
                          </h2>
                          <p className="text-xs text-slate-500">
                            {y.months.length} monthly cycle{y.months.length === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase ${
                          selectedYear === String(y.ethYear)
                            ? 'bg-brand-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {selectedYear === String(y.ethYear) ? 'Selected' : 'View'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Month cycles for selected year */}
              {selectedYear && (
                <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        Available Month Cycles for {selectedYear} E.C.
                      </h2>
                      <p className="text-xs text-slate-500">
                        Click on your month to open its dedicated payment portal.
                      </p>
                    </div>
                  </div>

                  {activeYearCycles.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {activeYearCycles.map((m) => {
                        const cycleSlug = m.slug || m.portalHash;
                        const isAccessible = m.status === 'open' || m.status === 'closed';

                        return (
                          <button
                            key={`${m.ethYear}-${m.ethMonth}-${cycleSlug}`}
                            type="button"
                            onClick={() => {
                              navigate(`/monthly-payments/${cycleSlug}`);
                            }}
                            disabled={!isAccessible}
                            className={`group relative rounded-2xl border p-4 text-left transition ${
                              isAccessible
                                ? 'border-brand-200 bg-white hover:border-brand-400 hover:shadow-md'
                                : 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                                <Calendar className="h-5 w-5" />
                              </div>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                  m.status === 'open'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : m.status === 'closed'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {m.status === 'open' ? 'Open' : m.status === 'closed' ? 'Closed' : m.status}
                              </span>
                            </div>

                            <div className="mt-3">
                              <h3 className="font-bold text-slate-900 group-hover:text-brand-700 transition">
                                {m.title}
                              </h3>
                              <p className="mt-0.5 text-xs text-slate-500">
                                Due {formatEthiopian(m.dueAt, { time: true })}
                              </p>
                              {m.amountEtb && (
                                <p className="mt-2 font-mono text-sm font-bold text-slate-900">
                                  {m.amountEtb} <span className="text-xs font-normal text-slate-500">ETB</span>
                                </p>
                              )}
                            </div>

                            <div className="mt-3 flex items-center justify-end text-xs font-semibold text-brand-600 group-hover:translate-x-1 transition">
                              <span>Pay this month →</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No monthly cycles published for {selectedYear} E.C.
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-10 rounded-3xl border border-slate-200 bg-white p-10 text-center">
              <Calendar className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="mt-4 text-lg font-semibold text-slate-700">No Payment Cycles Available</h3>
              <p className="mt-2 text-sm text-slate-500">
                The College Finance Office has not published any monthly fee cycles yet.
              </p>
            </div>
          )}
        </div>

        {/* Video Tutorial Modal (If triggered) */}
        {tutorialOpen && anyTutorialVideo && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tutorial-title"
          >
            <div
              className="relative w-full max-w-2xl rounded-3xl bg-white p-5 sm:p-6 shadow-2xl animate-pop overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Video className="h-5 w-5 text-red-600" />
                  <div>
                    <h2 id="tutorial-title" className="text-base font-bold text-slate-900">
                      Payment Tutorial / የክፍያ አጋዥ ቪዲዮ
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      Watch how to select your month and pay via Chapa.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCloseTutorial(false)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                  aria-label="Skip tutorial"
                >
                  <span>Skip / ዝለል</span>
                  <X className="h-4 w-4 text-slate-500" />
                </button>
              </div>

              <div className="aspect-video w-full rounded-2xl bg-black overflow-hidden shadow-inner">
                <iframe
                  src={getYouTubeEmbedUrl(anyTutorialVideo)}
                  title="Payment tutorial"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full border-0"
                />
              </div>

              <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={dontShowTutorialAgain}
                    onChange={(e) => setDontShowTutorialAgain(e.target.checked)}
                    className="rounded text-brand-600 focus:ring-brand-500"
                  />
                  <span>Don't show this again / እንደገና አታሳየኝ</span>
                </label>
                <button
                  type="button"
                  onClick={() => handleCloseTutorial(false)}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-brand-700 transition"
                >
                  <span>Close / ዝጋ</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // VIEW B: SPECIFIC MONTH CYCLE PAYMENT PAGE
  // (Rendered when URL is /monthly-payments/:hash)
  // ==========================================

  if (loadingCycle) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-600" />
          <p className="mt-2 text-sm font-medium text-slate-600">
            Loading monthly payment details / የክፍያ ገጹ እየተጫነ ነው...
          </p>
        </div>
      </div>
    );
  }

  if (notFound || !cycle) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-lg">
          <XCircle className="mx-auto h-12 w-12 text-rose-500" />
          <h2 className="mt-4 text-xl font-bold text-slate-900">Payment Cycle Not Found / የክፍያ ዙር አልተገኘም</h2>
          <p className="mt-2 text-xs text-slate-500">
            The requested payment link does not exist, has closed, or is not yet open.
          </p>
          <Link
            to="/monthly-payments"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-brand-700 transition"
          >
            <span>Browse Available Payment Cycles / ያሉትን ወራት ይመልከቱ</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  const embedTutorialUrl = getYouTubeEmbedUrl(cycle.tutorialVideoUrl);

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

          {/* Top Video Tutorial Button (Only when YouTube video is configured) */}
          {embedTutorialUrl && (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => setTutorialOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition"
              >
                <Video className="h-3.5 w-3.5 text-red-500" />
                <span>Watch Tutorial Video / አጋዥ ቪዲዮ ይመልከቱ</span>
              </button>
            </div>
          )}
        </div>

        {/* Video Tutorial Modal — unmounted when closed, so NO background playing! */}
        {tutorialOpen && embedTutorialUrl && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tutorial-title"
          >
            <div
              className="relative w-full max-w-2xl rounded-3xl bg-white p-5 sm:p-6 shadow-2xl animate-pop overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Video className="h-5 w-5 text-red-600" />
                  <div>
                    <h2 id="tutorial-title" className="text-base font-bold text-slate-900">
                      Payment Tutorial / የክፍያ አጋዥ ቪዲዮ
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      Learn how to pay your student fee step by step.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCloseTutorial(false)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                  aria-label="Skip tutorial"
                >
                  <span>Skip / ዝለል</span>
                  <X className="h-4 w-4 text-slate-500" />
                </button>
              </div>

              <div className="aspect-video w-full rounded-2xl bg-black overflow-hidden shadow-inner">
                <iframe
                  src={embedTutorialUrl}
                  title="Payment tutorial"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full border-0"
                />
              </div>

              <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={dontShowTutorialAgain}
                    onChange={(e) => setDontShowTutorialAgain(e.target.checked)}
                    className="rounded text-brand-600 focus:ring-brand-500"
                  />
                  <span>Don't show this again / እንደገና አታሳየኝ</span>
                </label>
                <button
                  type="button"
                  onClick={() => handleCloseTutorial(false)}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-brand-700 transition"
                >
                  <span>Continue to Payment / ወደ ክፍያ ይቀጥሉ</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

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
                  {cycle.totalAmountEtb || cycle.amountEtb} <span className="text-sm font-normal text-slate-500">ETB</span>
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

              <div className="pt-2 text-center">
                <Link
                  to="/monthly-payments"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-600 transition"
                >
                  <span>← Choose another academic year or month / ሌላ ወር ይምረጡ</span>
                </Link>
              </div>
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
                      <span>Overdue Penalty ({chargeData.daysOverdue} days) / የዘገየ ቅጣት:</span>
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

              <div className="flex items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('login')}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  ← Back to ID / ተመለስ
                </button>
                <Link
                  to="/monthly-payments"
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  All Months / ሁሉም ወራት
                </Link>
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
