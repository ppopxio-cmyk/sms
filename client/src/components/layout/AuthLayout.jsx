import { Link } from 'react-router-dom';
import { Fingerprint, MailCheck } from 'lucide-react';

// The whole decoration is motion: a cap and an open book that draw themselves once, a ring
// that turns, a tassel that drops, and two glass chips that drift. Nothing here needs an
// image file, and every part of it respects a request for less motion.
function AuthMotif() {
  return (
    <div className="relative mx-auto mb-6 h-40 w-64">
      <span className="animate-pulse-ring absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-400/20" />

      <svg viewBox="0 0 240 170" fill="none" aria-hidden="true" className="relative h-full w-full">
        <defs>
          <linearGradient id="auth-ink" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4f46e5" />
            <stop offset="55%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#0ea5e9" />
          </linearGradient>
        </defs>

        {/* A ring that turns, with one travelling dot on it. */}
        <g className="animate-orbit">
          <circle cx="120" cy="80" r="68" stroke="#c7d2fe" strokeWidth="1.4" strokeDasharray="4 10" />
          <circle cx="120" cy="12" r="4" fill="#0ea5e9" />
          <circle cx="188" cy="80" r="2.5" fill="#a5b4fc" />
        </g>

        <path
          d="M58 62 L120 35 L182 62 L120 89 Z"
          stroke="url(#auth-ink)"
          strokeWidth="3.4"
          strokeLinejoin="round"
          pathLength="1"
          className="animate-draw"
        />

        <path
          d="M170 64 V86"
          stroke="url(#auth-ink)"
          strokeWidth="3.2"
          strokeLinecap="round"
          pathLength="1"
          className="animate-draw"
          style={{ animationDelay: '0.35s' }}
        />
        <circle cx="170" cy="92" r="5.5" fill="#4f46e5" className="animate-pop" style={{ animationDelay: '1.05s' }} />

        <path
          d="M72 112 q26 -12 48 -2 v34 q-22 -10 -48 2 z"
          stroke="url(#auth-ink)"
          strokeWidth="3.2"
          strokeLinejoin="round"
          pathLength="1"
          className="animate-draw"
          style={{ animationDelay: '0.5s' }}
        />
        <path
          d="M168 112 q-26 -12 -48 -2 v34 q22 -10 48 2 z"
          stroke="url(#auth-ink)"
          strokeWidth="3.2"
          strokeLinejoin="round"
          pathLength="1"
          className="animate-draw"
          style={{ animationDelay: '0.5s' }}
        />
      </svg>

      <span className="glass animate-bob absolute right-0 top-1 flex h-11 w-11 items-center justify-center rounded-2xl text-brand-600 shadow-lg shadow-brand-600/10">
        <Fingerprint className="h-5 w-5" />
      </span>

      <span
        className="glass animate-bob absolute bottom-2 left-0 flex h-11 w-11 items-center justify-center rounded-2xl text-sky-600 shadow-lg shadow-sky-600/10"
        style={{ animationDelay: '1.1s' }}
      >
        <MailCheck className="h-5 w-5" />
      </span>
    </div>
  );
}

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <div className="animate-rise w-full max-w-md">
        <AuthMotif />

        {/* The product's full name is stated here, in plain sight and before the sign-in
            card, so the page identifies itself to anybody who opens it. */}
        <div className="mb-5 text-center">
          <h1 className="text-brand-gradient animate-sweep text-xl font-bold tracking-tight">
            School Management System
          </h1>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-600">SMS Portal</p>
        </div>

        <main className="glass rounded-3xl p-6 transition-shadow duration-500 hover:shadow-[0_34px_80px_-40px_rgba(15,23,42,0.55)] sm:p-8">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{subtitle}</p> : null}

          <div className="mt-6">{children}</div>

          {footer ? <div className="mt-6 border-t border-slate-100 pt-5 text-sm text-slate-600">{footer}</div> : null}
        </main>

        <p className="mt-6 flex items-center justify-center gap-3 text-xs text-slate-400">
          <Link to="/privacy" className="transition hover:text-slate-600">
            Privacy Policy
          </Link>
          <span aria-hidden="true">·</span>
          <Link to="/terms" className="transition hover:text-slate-600">
            Terms of Service
          </Link>
        </p>
      </div>
    </div>
  );
}
