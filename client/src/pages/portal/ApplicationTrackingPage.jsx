import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Building2,
  GraduationCap,
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck,
  Phone,
  Mail,
  Loader2,
  HelpCircle,
} from 'lucide-react';
import { formatEthiopian, ETH_MONTHS } from '../../lib/ethiopianDate';

export default function ApplicationTrackingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialRef = searchParams.get('ref') || '';

  const [trackingInput, setTrackingInput] = useState(initialRef);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const fetchTracking = async (refNumber) => {
    if (!refNumber || !refNumber.trim()) {
      setError('Please enter a valid application tracking reference number.');
      return;
    }
    setError('');
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/public/registration-portals/track/${encodeURIComponent(refNumber.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'No application found with this tracking reference. Please double-check the number.');
        return;
      }

      setResult(data.tracking);
    } catch {
      setError('Network error. Unable to contact admissions server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialRef) {
      fetchTracking(initialRef);
    }
  }, [initialRef]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!trackingInput.trim()) return;
    setSearchParams({ ref: trackingInput.trim() });
    fetchTracking(trackingInput.trim());
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1 text-xs font-bold text-brand-700 shadow-xs mb-3">
            <ShieldCheck className="h-4 w-4" />
            <span>Admissions Portal · Official Tracking</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Track Application Status
          </h1>
          <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
            Enter your permanent tracking reference number (e.g., COL-2026-000123) to view your admission review progress and official committee decision.
          </p>
        </div>

        {/* Search Box */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm mb-6">
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="text"
                value={trackingInput}
                onChange={(e) => setTrackingInput(e.target.value)}
                placeholder="Enter Reference (e.g. COL-2026-000123)"
                className="w-full rounded-2xl border border-slate-300 py-3 pl-11 pr-4 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60 transition"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <span>Check Status</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {error && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Result Card */}
        {result && (
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm mb-8 animate-fade">
            {/* Top Status Header */}
            <div
              className={`p-6 text-white ${
                result.status === 'APPROVED'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-700'
                  : result.status === 'REJECTED'
                    ? 'bg-gradient-to-r from-rose-600 to-pink-700'
                    : 'bg-gradient-to-r from-brand-600 to-indigo-700'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <span className="inline-block rounded-lg bg-white/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider backdrop-blur-sm">
                    Application Reference
                  </span>
                  <h2 className="mt-1 font-mono text-2xl font-black">{result.trackingReference}</h2>
                  <p className="mt-0.5 text-xs opacity-90">Applicant: {result.applicantName}</p>
                </div>

                <div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-wider shadow-sm ${
                      result.status === 'APPROVED'
                        ? 'bg-white text-emerald-800'
                        : result.status === 'REJECTED'
                          ? 'bg-white text-rose-800'
                          : 'bg-white text-brand-900'
                    }`}
                  >
                    {result.status === 'APPROVED' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                    {result.status === 'REJECTED' && <XCircle className="h-4 w-4 text-rose-600" />}
                    {(result.status === 'SUBMITTED' || result.status === 'UNDER_REVIEW') && (
                      <Clock className="h-4 w-4 text-amber-500" />
                    )}
                    <span>
                      {result.status === 'APPROVED'
                        ? 'Admitted'
                        : result.status === 'REJECTED'
                          ? 'Not Approved'
                          : 'Under Review'}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* Details Body */}
            <div className="p-6 sm:p-8 space-y-6">
              {/* Official Status Note */}
              <div
                className={`rounded-2xl p-4 text-xs leading-relaxed ${
                  result.status === 'APPROVED'
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                    : result.status === 'REJECTED'
                      ? 'border border-rose-200 bg-rose-50 text-rose-900'
                      : 'border border-blue-200 bg-blue-50 text-blue-900'
                }`}
              >
                <p className="font-bold text-sm mb-1">{result.statusDescription}</p>
                <p>{result.nextSteps}</p>
              </div>

              {/* Rejection Reason if Rejected */}
              {result.status === 'REJECTED' && result.rejectionReason && (
                <div className="rounded-2xl border-2 border-rose-300 bg-rose-50/50 p-4 text-xs">
                  <p className="font-bold uppercase tracking-wider text-rose-900 mb-1">
                    Admissions Committee Decision Note:
                  </p>
                  <p className="text-slate-800 italic">"{result.rejectionReason}"</p>
                </div>
              )}

              {/* Official Student ID if Approved */}
              {result.status === 'APPROVED' && result.officialStudentId && (
                <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/70 p-4 text-center">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                    Your Assigned Student ID
                  </span>
                  <p className="font-mono text-2xl font-black text-emerald-950 mt-1">
                    {result.officialStudentId}
                  </p>
                  <p className="text-[11px] text-emerald-700 mt-1">
                    Bring this student number and your original matriculation documents to campus.
                  </p>
                </div>
              )}

              {/* Academic Placement Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="rounded-xl border border-slate-200 p-3.5 space-y-1">
                  <span className="text-slate-400 uppercase font-semibold text-[10px]">Programme</span>
                  <p className="font-bold text-slate-800 text-sm">{result.programName}</p>
                  <p className="text-slate-500 uppercase">{result.qualificationType}</p>
                </div>

                <div className="rounded-xl border border-slate-200 p-3.5 space-y-1">
                  <span className="text-slate-400 uppercase font-semibold text-[10px]">Department</span>
                  <p className="font-bold text-slate-800 text-sm">{result.departmentName}</p>
                  <p className="text-slate-500">{result.batchName}</p>
                </div>

                <div className="rounded-xl border border-slate-200 p-3.5 space-y-1">
                  <span className="text-slate-400 uppercase font-semibold text-[10px]">Submission Date</span>
                  <p className="font-semibold text-slate-800">
                    {result.submissionDate ? new Date(result.submissionDate).toLocaleDateString() : '—'}
                  </p>
                  {result.birthDateEthiopian && (
                    <p className="text-slate-500">
                      EC Birth Date:{' '}
                      {ETH_MONTHS[result.birthDateEthiopian.month - 1] || result.birthDateEthiopian.month}{' '}
                      {result.birthDateEthiopian.day}, {result.birthDateEthiopian.year}
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 p-3.5 space-y-1">
                  <span className="text-slate-400 uppercase font-semibold text-[10px]">Last Status Update</span>
                  <p className="font-semibold text-slate-800">
                    {result.lastUpdated ? new Date(result.lastUpdated).toLocaleString() : 'Recent'}
                  </p>
                  <p className="text-slate-500">Admissions Evaluation Office</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer Support Info */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center text-xs text-slate-500 space-y-2">
          <p className="font-semibold text-slate-800">Have questions regarding your application decision?</p>
          <div className="flex flex-wrap items-center justify-center gap-4 text-slate-600">
            <span className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-brand-600" />
              <span>haile12michaell@gmail.com</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-brand-600" />
              <span>+251 911 000 000</span>
            </span>
          </div>
          <div className="pt-1 flex items-center justify-center gap-3 text-brand-600 font-medium">
            <a href="https://t.me" target="_blank" rel="noopener noreferrer" className="hover:underline">Telegram</a>
            <span>·</span>
            <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="hover:underline">Facebook</a>
            <span>·</span>
            <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" className="hover:underline">YouTube</a>
          </div>
        </div>
      </div>
    </div>
  );
}
